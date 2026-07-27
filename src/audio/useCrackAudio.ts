import { useCallback, useEffect, useRef } from 'react'
import {
  createCrackShuffleBag,
  drawCrackTrack,
  type CrackShuffleBagState,
} from './crackShuffleBag'
import {
  CRACK_TRACKS,
  type CrackTrack,
} from './crackTracks'

const AUDIO_SEED_SALT = 0xa17d4e39
const MAX_ACTIVE_SOURCES = 4
const MIN_PLAY_INTERVAL_SECONDS = 0.07
const MAX_RECENT_TRACKS = 20

type CrackAudioStatus =
  | 'loading'
  | 'locked'
  | 'ready'
  | 'suspended'
  | 'unsupported'
  | 'error'

export type CrackAudioDiagnostics = {
  status: CrackAudioStatus
  decodedTrackCount: number
  playCount: number
  skippedPlayCount: number
  lastTrackIndex: number | null
  recentTrackIndices: number[]
  lastUnlockHadUserActivation: boolean | null
  lastResumeError: string | null
}

declare global {
  interface Window {
    __squishyAudioDiagnostics?: CrackAudioDiagnostics
  }
}

type CrackAudioRuntime = {
  context: AudioContext | null
  masterGain: GainNode | null
  compressor: DynamicsCompressorNode | null
  buffers: readonly AudioBuffer[] | null
  decodePromise: Promise<readonly AudioBuffer[]> | null
  activePlaybacks: Set<ActivePlayback>
  shuffleBag: CrackShuffleBagState
  pendingBreakCount: number
  lastStartedAt: number
  disposed: boolean
  diagnostics: CrackAudioDiagnostics
}

type ActivePlayback = {
  source: AudioBufferSourceNode
  gain: GainNode
}

let encodedTracksPromise: Promise<readonly ArrayBuffer[]> | null = null

function publishDiagnostics(runtime: CrackAudioRuntime) {
  if (!import.meta.env.DEV) {
    return
  }
  document.documentElement.dataset.squishyAudioDiagnostics =
    JSON.stringify(runtime.diagnostics)
}

function loadEncodedTracks() {
  if (!encodedTracksPromise) {
    encodedTracksPromise = Promise.all(
      CRACK_TRACKS.map(async ({ url }) => {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(
            `Unable to load crack audio (${response.status})`,
          )
        }
        return response.arrayBuffer()
      }),
    ).catch((error: unknown) => {
      encodedTracksPromise = null
      throw error
    })
  }
  return encodedTracksPromise
}

function getAudioContextConstructor() {
  const audioWindow = window as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext
}

function stopActiveSources(runtime: CrackAudioRuntime) {
  for (const playback of runtime.activePlaybacks) {
    playback.source.onended = null
    try {
      playback.source.stop()
    } catch {
      // A source may already have ended between the Set iteration and stop.
    }
    playback.source.disconnect()
    playback.gain.disconnect()
  }
  runtime.activePlaybacks.clear()
}

function resetDiagnostics(
  runtime: CrackAudioRuntime,
  status: CrackAudioStatus,
) {
  runtime.diagnostics.status = status
  runtime.diagnostics.playCount = 0
  runtime.diagnostics.skippedPlayCount = 0
  runtime.diagnostics.lastTrackIndex = null
  runtime.diagnostics.recentTrackIndices.length = 0
  runtime.diagnostics.lastResumeError = null
  publishDiagnostics(runtime)
}

function playTrack(
  runtime: CrackAudioRuntime,
  brokenBondCount: number,
) {
  const { context, masterGain, buffers } = runtime
  if (
    runtime.disposed ||
    !context ||
    !masterGain ||
    !buffers ||
    context.state !== 'running'
  ) {
    return
  }

  const now = context.currentTime
  if (
    now - runtime.lastStartedAt < MIN_PLAY_INTERVAL_SECONDS ||
    runtime.activePlaybacks.size >= MAX_ACTIVE_SOURCES
  ) {
    runtime.diagnostics.skippedPlayCount += 1
    publishDiagnostics(runtime)
    return
  }

  const draw = drawCrackTrack(runtime.shuffleBag)
  runtime.shuffleBag = draw.state
  const track = CRACK_TRACKS[draw.trackIndex] as CrackTrack
  const buffer = buffers[draw.trackIndex]
  if (!buffer) {
    runtime.diagnostics.skippedPlayCount += 1
    publishDiagnostics(runtime)
    return
  }

  const source = context.createBufferSource()
  const gain = context.createGain()
  const intensity =
    0.82 +
    Math.min(0.18, Math.log2(Math.max(1, brokenBondCount) + 1) * 0.08)
  const startedAt = now + 0.002

  source.buffer = buffer
  gain.gain.setValueAtTime(0, startedAt)
  gain.gain.linearRampToValueAtTime(
    track.gain * intensity,
    startedAt + 0.003,
  )
  source.connect(gain)
  gain.connect(masterGain)
  const playback = { source, gain }
  runtime.activePlaybacks.add(playback)
  source.onended = () => {
    runtime.activePlaybacks.delete(playback)
    source.disconnect()
    gain.disconnect()
  }
  source.start(startedAt)

  runtime.lastStartedAt = startedAt
  runtime.diagnostics.playCount += 1
  runtime.diagnostics.lastTrackIndex = draw.trackIndex
  runtime.diagnostics.recentTrackIndices.push(draw.trackIndex)
  if (
    runtime.diagnostics.recentTrackIndices.length >
    MAX_RECENT_TRACKS
  ) {
    runtime.diagnostics.recentTrackIndices.shift()
  }
  publishDiagnostics(runtime)
}

function flushPendingBreak(runtime: CrackAudioRuntime) {
  if (runtime.pendingBreakCount <= 0) {
    return
  }
  const pendingBreakCount = runtime.pendingBreakCount
  runtime.pendingBreakCount = 0
  playTrack(runtime, pendingBreakCount)
}

function ensureDecodedTracks(
  runtime: CrackAudioRuntime,
  context: AudioContext,
) {
  if (runtime.buffers) {
    return Promise.resolve(runtime.buffers)
  }
  if (runtime.decodePromise) {
    return runtime.decodePromise
  }

  runtime.diagnostics.status = 'loading'
  publishDiagnostics(runtime)
  runtime.decodePromise = loadEncodedTracks()
    .then((encodedTracks) =>
      Promise.all(
        encodedTracks.map((encodedTrack) =>
          context.decodeAudioData(encodedTrack.slice(0)),
        ),
      ),
    )
    .then((buffers) => {
      if (
        runtime.disposed ||
        runtime.context !== context ||
        context.state === 'closed'
      ) {
        return buffers
      }
      runtime.buffers = buffers
      runtime.diagnostics.decodedTrackCount = buffers.length
      runtime.diagnostics.status =
        context.state === 'running' ? 'ready' : 'suspended'
      if (context.state === 'running') {
        flushPendingBreak(runtime)
      }
      publishDiagnostics(runtime)
      return buffers
    })
    .catch((error: unknown) => {
      runtime.decodePromise = null
      runtime.diagnostics.status = 'error'
      publishDiagnostics(runtime)
      throw error
    })

  return runtime.decodePromise
}

function createAudioGraph(runtime: CrackAudioRuntime) {
  const AudioContextConstructor = getAudioContextConstructor()
  if (!AudioContextConstructor) {
    runtime.diagnostics.status = 'unsupported'
    publishDiagnostics(runtime)
    return null
  }

  let context: AudioContext
  try {
    context = new AudioContextConstructor({
      latencyHint: 'interactive',
    })
  } catch {
    runtime.diagnostics.status = 'error'
    publishDiagnostics(runtime)
    return null
  }
  const masterGain = context.createGain()
  const compressor = context.createDynamicsCompressor()

  masterGain.gain.value = 0.8
  compressor.threshold.value = -18
  compressor.knee.value = 16
  compressor.ratio.value = 6
  compressor.attack.value = 0.003
  compressor.release.value = 0.12
  masterGain.connect(compressor)
  compressor.connect(context.destination)

  runtime.context = context
  runtime.masterGain = masterGain
  runtime.compressor = compressor
  runtime.buffers = null
  runtime.decodePromise = null

  return context
}

function primeAudioContext(context: AudioContext) {
  const source = context.createBufferSource()
  const silentGain = context.createGain()
  source.buffer = context.createBuffer(1, 1, context.sampleRate)
  silentGain.gain.value = 0
  source.connect(silentGain)
  silentGain.connect(context.destination)
  source.onended = () => {
    source.disconnect()
    silentGain.disconnect()
  }
  source.start()
}

export function useCrackAudio(coatingSeed: number) {
  const runtimeRef = useRef<CrackAudioRuntime | null>(null)
  if (!runtimeRef.current) {
    runtimeRef.current = {
      context: null,
      masterGain: null,
      compressor: null,
      buffers: null,
      decodePromise: null,
      activePlaybacks: new Set(),
      shuffleBag: createCrackShuffleBag(
        (coatingSeed ^ AUDIO_SEED_SALT) >>> 0,
      ),
      pendingBreakCount: 0,
      lastStartedAt: Number.NEGATIVE_INFINITY,
      disposed: false,
      diagnostics: {
        status: 'loading',
        decodedTrackCount: 0,
        playCount: 0,
        skippedPlayCount: 0,
        lastTrackIndex: null,
        recentTrackIndices: [],
        lastUnlockHadUserActivation: null,
        lastResumeError: null,
      },
    }
  }
  const runtime = runtimeRef.current

  useEffect(() => {
    runtime.disposed = false
    if (import.meta.env.DEV) {
      window.__squishyAudioDiagnostics = runtime.diagnostics
    }
    publishDiagnostics(runtime)
    void loadEncodedTracks()
      .then(() => {
        if (
          !runtime.disposed &&
          runtime.diagnostics.status === 'loading' &&
          !runtime.context
        ) {
          runtime.diagnostics.status = 'locked'
          publishDiagnostics(runtime)
        }
      })
      .catch(() => {
        if (!runtime.disposed) {
          runtime.diagnostics.status = 'error'
          publishDiagnostics(runtime)
        }
      })

    return () => {
      runtime.disposed = true
      runtime.pendingBreakCount = 0
      stopActiveSources(runtime)
      const context = runtime.context
      runtime.context = null
      runtime.masterGain = null
      runtime.compressor = null
      runtime.buffers = null
      runtime.decodePromise = null
      if (context && context.state !== 'closed') {
        void context.close()
      }
      if (window.__squishyAudioDiagnostics === runtime.diagnostics) {
        delete window.__squishyAudioDiagnostics
      }
      delete document.documentElement.dataset.squishyAudioDiagnostics
    }
  }, [runtime])

  useEffect(() => {
    runtime.shuffleBag = createCrackShuffleBag(
      (coatingSeed ^ AUDIO_SEED_SALT) >>> 0,
    )
    runtime.pendingBreakCount = 0
    runtime.lastStartedAt = Number.NEGATIVE_INFINITY
    stopActiveSources(runtime)
    resetDiagnostics(
      runtime,
      runtime.buffers
        ? runtime.context?.state === 'running'
          ? 'ready'
          : 'suspended'
        : runtime.context
          ? 'loading'
          : 'locked',
    )
  }, [coatingSeed, runtime])

  const unlock = useCallback(() => {
    if (runtime.disposed) {
      return
    }
    runtime.diagnostics.lastUnlockHadUserActivation =
      navigator.userActivation?.isActive ?? null
    runtime.diagnostics.lastResumeError = null
    publishDiagnostics(runtime)

    let context = runtime.context
    if (!context || context.state === 'closed') {
      context = createAudioGraph(runtime)
      if (!context) {
        return
      }
    }

    if (context.state !== 'running') {
      primeAudioContext(context)
      void context
        .resume()
        .then(() => {
          if (
            runtime.disposed ||
            runtime.context !== context
          ) {
            return
          }
          runtime.diagnostics.status =
            context.state === 'running'
              ? runtime.buffers
                ? 'ready'
                : 'loading'
              : 'suspended'
          if (context.state === 'running' && runtime.buffers) {
            flushPendingBreak(runtime)
          }
          publishDiagnostics(runtime)
        })
        .catch((error: unknown) => {
          if (!runtime.disposed) {
            runtime.diagnostics.status = 'suspended'
            runtime.diagnostics.lastResumeError =
              error instanceof Error
                ? `${error.name}: ${error.message}`
                : 'AudioContext resume failed'
            publishDiagnostics(runtime)
          }
        })
    }

    void ensureDecodedTracks(runtime, context).catch(() => {
      // Diagnostics report the failure while the visual interaction continues.
    })
  }, [runtime])

  const play = useCallback(
    (brokenBondCount: number) => {
      if (
        !Number.isFinite(brokenBondCount) ||
        brokenBondCount <= 0 ||
        runtime.disposed
      ) {
        return
      }

      const context = runtime.context
      if (!context || context.state !== 'running') {
        runtime.diagnostics.skippedPlayCount += 1
        publishDiagnostics(runtime)
        return
      }
      if (!runtime.buffers) {
        runtime.pendingBreakCount = Math.max(
          runtime.pendingBreakCount,
          Math.round(brokenBondCount),
        )
        void ensureDecodedTracks(runtime, context).catch(() => {
          // Diagnostics report the failure while the visual interaction continues.
        })
        return
      }
      playTrack(runtime, Math.round(brokenBondCount))
    },
    [runtime],
  )

  return { unlock, play } as const
}
