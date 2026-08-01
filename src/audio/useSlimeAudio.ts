import { useCallback, useEffect, useRef } from 'react'
import {
  SLIME_TRACKS,
  selectSlimePlaybackRate,
} from './slimeTracks'
import {
  createSlimeShuffleBag,
  drawSlimeTrack,
  type SlimeShuffleBagState,
} from './slimeShuffleBag'

const MAX_ACTIVE_SOURCES = 4
const MAX_PENDING_PRESSES = 2
const MIN_PLAY_INTERVAL_SECONDS = 0.035

type SlimeAudioStatus =
  | 'disabled'
  | 'loading'
  | 'locked'
  | 'ready'
  | 'suspended'
  | 'unsupported'
  | 'error'

export type SlimeAudioDiagnostics = {
  status: SlimeAudioStatus
  playCount: number
  skippedPlayCount: number
  pendingPressCount: number
  activeSourceCount: number
  lastTrackId: string | null
  lastPlaybackRate: number | null
  lastUnlockHadUserActivation: boolean | null
  lastResumeError: string | null
}

type ActivePlayback = {
  source: AudioBufferSourceNode
  gain: GainNode
}

type SlimeAudioRuntime = {
  context: AudioContext | null
  masterGain: GainNode | null
  compressor: DynamicsCompressorNode | null
  buffers: AudioBuffer[] | null
  decodePromise: Promise<AudioBuffer[]> | null
  activePlaybacks: Set<ActivePlayback>
  pendingPressCount: number
  sequence: number
  lastStartedAt: number
  shuffle: SlimeShuffleBagState
  disposed: boolean
  diagnostics: SlimeAudioDiagnostics
}

declare global {
  interface Window {
    __squishySlimeAudioDiagnostics?: SlimeAudioDiagnostics
  }
}

let encodedTracksPromise: Promise<ArrayBuffer[]> | null = null

function loadEncodedTracks() {
  if (!encodedTracksPromise) {
    encodedTracksPromise = Promise.all(
      SLIME_TRACKS.map((track) =>
        fetch(track.url).then((response) => {
          if (!response.ok) {
            throw new Error(
              `Unable to load slime audio ${track.id} (${response.status})`,
            )
          }
          return response.arrayBuffer()
        }),
      ),
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

function publishDiagnostics(runtime: SlimeAudioRuntime) {
  if (!import.meta.env.DEV) {
    return
  }
  runtime.diagnostics.pendingPressCount = runtime.pendingPressCount
  runtime.diagnostics.activeSourceCount = runtime.activePlaybacks.size
  document.documentElement.dataset.squishySlimeAudioDiagnostics =
    JSON.stringify(runtime.diagnostics)
}

function createAudioGraph(runtime: SlimeAudioRuntime) {
  const AudioContextConstructor = getAudioContextConstructor()
  if (!AudioContextConstructor) {
    runtime.diagnostics.status = 'unsupported'
    publishDiagnostics(runtime)
    return null
  }
  let context: AudioContext
  try {
    context = new AudioContextConstructor({ latencyHint: 'interactive' })
  } catch {
    runtime.diagnostics.status = 'error'
    publishDiagnostics(runtime)
    return null
  }
  const masterGain = context.createGain()
  const compressor = context.createDynamicsCompressor()
  masterGain.gain.value = 0.82
  compressor.threshold.value = -18
  compressor.knee.value = 16
  compressor.ratio.value = 4
  compressor.attack.value = 0.003
  compressor.release.value = 0.12
  masterGain.connect(compressor)
  compressor.connect(context.destination)
  runtime.context = context
  runtime.masterGain = masterGain
  runtime.compressor = compressor
  return context
}

function ensureDecodedTracks(
  runtime: SlimeAudioRuntime,
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
        encodedTracks.map((encoded) =>
          context.decodeAudioData(encoded.slice(0)),
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
      runtime.diagnostics.status =
        context.state === 'running' ? 'ready' : 'suspended'
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

function playSample(runtime: SlimeAudioRuntime, seed: number) {
  const { buffers, context, masterGain } = runtime
  if (
    runtime.disposed ||
    !buffers ||
    !context ||
    !masterGain ||
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

  const draw = drawSlimeTrack(runtime.shuffle)
  runtime.shuffle = draw.state
  const track = SLIME_TRACKS[draw.trackIndex]
  const source = context.createBufferSource()
  const gain = context.createGain()
  const startedAt = now + 0.002
  const playbackRate = selectSlimePlaybackRate(seed, runtime.sequence)
  runtime.sequence += 1
  source.buffer = buffers[draw.trackIndex]
  source.playbackRate.setValueAtTime(playbackRate, startedAt)
  gain.gain.setValueAtTime(0, startedAt)
  gain.gain.linearRampToValueAtTime(track.gain, startedAt + 0.004)
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    startedAt + Math.min(0.72, source.buffer.duration),
  )
  source.connect(gain)
  gain.connect(masterGain)

  const playback = { source, gain }
  runtime.activePlaybacks.add(playback)
  source.onended = () => {
    runtime.activePlaybacks.delete(playback)
    source.disconnect()
    gain.disconnect()
    publishDiagnostics(runtime)
  }
  source.start(startedAt)
  runtime.lastStartedAt = startedAt
  runtime.diagnostics.playCount += 1
  runtime.diagnostics.lastTrackId = track.id
  runtime.diagnostics.lastPlaybackRate = playbackRate
  publishDiagnostics(runtime)
}

function flushPendingPress(runtime: SlimeAudioRuntime, seed: number) {
  if (
    runtime.context?.state !== 'running' ||
    !runtime.buffers ||
    runtime.pendingPressCount <= 0
  ) {
    return
  }
  runtime.pendingPressCount = 0
  playSample(runtime, seed)
}

function primeAudioContext(context: AudioContext) {
  const source = context.createBufferSource()
  const gain = context.createGain()
  source.buffer = context.createBuffer(1, 1, context.sampleRate)
  gain.gain.value = 0
  source.connect(gain)
  gain.connect(context.destination)
  source.onended = () => {
    source.disconnect()
    gain.disconnect()
  }
  source.start()
}

function stopActiveSources(runtime: SlimeAudioRuntime) {
  for (const playback of runtime.activePlaybacks) {
    playback.source.onended = null
    try {
      playback.source.stop()
    } catch {
      // A short slime sample may have ended before cleanup runs.
    }
    playback.source.disconnect()
    playback.gain.disconnect()
  }
  runtime.activePlaybacks.clear()
}

export function useSlimeAudio(experienceSeed: number, enabled: boolean) {
  const runtimeRef = useRef<SlimeAudioRuntime | null>(null)
  if (!runtimeRef.current) {
    runtimeRef.current = {
      context: null,
      masterGain: null,
      compressor: null,
      buffers: null,
      decodePromise: null,
      activePlaybacks: new Set(),
      pendingPressCount: 0,
      sequence: 0,
      lastStartedAt: Number.NEGATIVE_INFINITY,
      shuffle: createSlimeShuffleBag(experienceSeed),
      disposed: !enabled,
      diagnostics: {
        status: enabled ? 'loading' : 'disabled',
        playCount: 0,
        skippedPlayCount: 0,
        pendingPressCount: 0,
        activeSourceCount: 0,
        lastTrackId: null,
        lastPlaybackRate: null,
        lastUnlockHadUserActivation: null,
        lastResumeError: null,
      },
    }
  }
  const runtime = runtimeRef.current

  useEffect(() => {
    if (!enabled) {
      runtime.disposed = true
      runtime.diagnostics.status = 'disabled'
      publishDiagnostics(runtime)
      return
    }
    runtime.disposed = false
    runtime.diagnostics.status = 'loading'
    if (import.meta.env.DEV) {
      window.__squishySlimeAudioDiagnostics = runtime.diagnostics
    }
    publishDiagnostics(runtime)
    void loadEncodedTracks()
      .then(() => {
        if (!runtime.disposed && !runtime.context) {
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
      runtime.pendingPressCount = 0
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
      if (window.__squishySlimeAudioDiagnostics === runtime.diagnostics) {
        delete window.__squishySlimeAudioDiagnostics
      }
      delete document.documentElement.dataset.squishySlimeAudioDiagnostics
    }
  }, [enabled, runtime])

  useEffect(() => {
    runtime.sequence = 0
    runtime.pendingPressCount = 0
    runtime.lastStartedAt = Number.NEGATIVE_INFINITY
    runtime.shuffle = createSlimeShuffleBag(experienceSeed)
  }, [experienceSeed, runtime])

  const trigger = useCallback(() => {
    if (!enabled || runtime.disposed) {
      return
    }
    runtime.diagnostics.lastUnlockHadUserActivation =
      navigator.userActivation?.isActive ?? null
    runtime.diagnostics.lastResumeError = null

    let context = runtime.context
    if (!context || context.state === 'closed') {
      context = createAudioGraph(runtime)
      if (!context) {
        return
      }
    }
    if (context.state === 'running' && runtime.buffers) {
      playSample(runtime, experienceSeed)
      return
    }

    runtime.pendingPressCount = Math.min(
      MAX_PENDING_PRESSES,
      runtime.pendingPressCount + 1,
    )
    publishDiagnostics(runtime)
    if (context.state !== 'running') {
      primeAudioContext(context)
      void context
        .resume()
        .then(() => {
          if (runtime.disposed || runtime.context !== context) {
            return
          }
          runtime.diagnostics.status = runtime.buffers ? 'ready' : 'loading'
          flushPendingPress(runtime, experienceSeed)
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
    void ensureDecodedTracks(runtime, context)
      .then(() => flushPendingPress(runtime, experienceSeed))
      .catch(() => {
        // Diagnostics expose decode failures while visual presses continue.
      })
  }, [enabled, experienceSeed, runtime])

  return { trigger } as const
}
