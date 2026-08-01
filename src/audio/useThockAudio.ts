import { useCallback, useEffect, useRef } from 'react'
import {
  selectThockPlaybackRate,
  THOCK_TRACK,
} from './thockTrack'

const MAX_ACTIVE_SOURCES = 6
const MIN_PLAY_INTERVAL_SECONDS = 0.018
const MAX_PENDING_PRESSES = 2

type ThockAudioStatus =
  | 'disabled'
  | 'loading'
  | 'locked'
  | 'ready'
  | 'suspended'
  | 'unsupported'
  | 'error'

export type ThockAudioDiagnostics = {
  status: ThockAudioStatus
  playCount: number
  skippedPlayCount: number
  pendingPressCount: number
  activeSourceCount: number
  lastPlaybackRate: number | null
  lastUnlockHadUserActivation: boolean | null
  lastResumeError: string | null
}

type ActivePlayback = {
  source: AudioBufferSourceNode
  gain: GainNode
}

type ThockAudioRuntime = {
  context: AudioContext | null
  masterGain: GainNode | null
  lowShelf: BiquadFilterNode | null
  compressor: DynamicsCompressorNode | null
  buffer: AudioBuffer | null
  decodePromise: Promise<AudioBuffer> | null
  activePlaybacks: Set<ActivePlayback>
  pendingPressCount: number
  sequence: number
  lastStartedAt: number
  disposed: boolean
  diagnostics: ThockAudioDiagnostics
}

declare global {
  interface Window {
    __squishyThockAudioDiagnostics?: ThockAudioDiagnostics
  }
}

let encodedTrackPromise: Promise<ArrayBuffer> | null = null

function loadEncodedTrack() {
  if (!encodedTrackPromise) {
    encodedTrackPromise = fetch(THOCK_TRACK.url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load thock audio (${response.status})`)
        }
        return response.arrayBuffer()
      })
      .catch((error: unknown) => {
        encodedTrackPromise = null
        throw error
      })
  }
  return encodedTrackPromise
}

function getAudioContextConstructor() {
  const audioWindow = window as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext
}

function publishDiagnostics(runtime: ThockAudioRuntime) {
  if (!import.meta.env.DEV) {
    return
  }
  runtime.diagnostics.pendingPressCount = runtime.pendingPressCount
  runtime.diagnostics.activeSourceCount = runtime.activePlaybacks.size
  document.documentElement.dataset.squishyThockAudioDiagnostics =
    JSON.stringify(runtime.diagnostics)
}

function stopActiveSources(runtime: ThockAudioRuntime) {
  for (const playback of runtime.activePlaybacks) {
    playback.source.onended = null
    try {
      playback.source.stop()
    } catch {
      // A short key sample may have ended before cleanup runs.
    }
    playback.source.disconnect()
    playback.gain.disconnect()
  }
  runtime.activePlaybacks.clear()
}

function createAudioGraph(runtime: ThockAudioRuntime) {
  const AudioContextConstructor = getAudioContextConstructor()
  if (!AudioContextConstructor) {
    runtime.diagnostics.status = 'unsupported'
    runtime.pendingPressCount = 0
    publishDiagnostics(runtime)
    return null
  }

  let context: AudioContext
  try {
    context = new AudioContextConstructor({ latencyHint: 'interactive' })
  } catch {
    runtime.diagnostics.status = 'error'
    runtime.pendingPressCount = 0
    publishDiagnostics(runtime)
    return null
  }

  const masterGain = context.createGain()
  const lowShelf = context.createBiquadFilter()
  const compressor = context.createDynamicsCompressor()
  masterGain.gain.value = 0.78
  lowShelf.type = 'lowshelf'
  lowShelf.frequency.value = 180
  lowShelf.gain.value = 4.5
  compressor.threshold.value = -16
  compressor.knee.value = 14
  compressor.ratio.value = 5
  compressor.attack.value = 0.002
  compressor.release.value = 0.1
  masterGain.connect(lowShelf)
  lowShelf.connect(compressor)
  compressor.connect(context.destination)

  runtime.context = context
  runtime.masterGain = masterGain
  runtime.lowShelf = lowShelf
  runtime.compressor = compressor
  return context
}

function playSample(runtime: ThockAudioRuntime, seed: number) {
  const { buffer, context, masterGain } = runtime
  if (
    runtime.disposed ||
    !buffer ||
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

  const source = context.createBufferSource()
  const gain = context.createGain()
  const playbackRate = selectThockPlaybackRate(seed, runtime.sequence)
  const startedAt = now + 0.002
  runtime.sequence += 1
  source.buffer = buffer
  source.playbackRate.setValueAtTime(playbackRate, startedAt)
  gain.gain.setValueAtTime(0, startedAt)
  gain.gain.linearRampToValueAtTime(THOCK_TRACK.gain, startedAt + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.001, startedAt + 0.36)
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
  source.start(startedAt, 0, Math.min(0.4, buffer.duration))

  runtime.lastStartedAt = startedAt
  runtime.diagnostics.playCount += 1
  runtime.diagnostics.lastPlaybackRate = playbackRate
  publishDiagnostics(runtime)
}

function flushPendingPresses(runtime: ThockAudioRuntime, seed: number) {
  if (
    runtime.context?.state !== 'running' ||
    !runtime.buffer ||
    runtime.pendingPressCount <= 0
  ) {
    return
  }
  runtime.pendingPressCount = 0
  playSample(runtime, seed)
}

function ensureDecodedTrack(
  runtime: ThockAudioRuntime,
  context: AudioContext,
  seed: number,
) {
  if (runtime.buffer) {
    return Promise.resolve(runtime.buffer)
  }
  if (runtime.decodePromise) {
    return runtime.decodePromise
  }
  runtime.diagnostics.status = 'loading'
  publishDiagnostics(runtime)
  runtime.decodePromise = loadEncodedTrack()
    .then((encodedTrack) =>
      context.decodeAudioData(encodedTrack.slice(0)),
    )
    .then((buffer) => {
      if (
        runtime.disposed ||
        runtime.context !== context ||
        context.state === 'closed'
      ) {
        return buffer
      }
      runtime.buffer = buffer
      runtime.diagnostics.status =
        context.state === 'running' ? 'ready' : 'suspended'
      flushPendingPresses(runtime, seed)
      publishDiagnostics(runtime)
      return buffer
    })
    .catch((error: unknown) => {
      runtime.decodePromise = null
      runtime.diagnostics.status = 'error'
      publishDiagnostics(runtime)
      throw error
    })
  return runtime.decodePromise
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

export function useThockAudio(experienceSeed: number, enabled: boolean) {
  const runtimeRef = useRef<ThockAudioRuntime | null>(null)
  if (!runtimeRef.current) {
    runtimeRef.current = {
      context: null,
      masterGain: null,
      lowShelf: null,
      compressor: null,
      buffer: null,
      decodePromise: null,
      activePlaybacks: new Set(),
      pendingPressCount: 0,
      sequence: 0,
      lastStartedAt: Number.NEGATIVE_INFINITY,
      disposed: !enabled,
      diagnostics: {
        status: enabled ? 'loading' : 'disabled',
        playCount: 0,
        skippedPlayCount: 0,
        pendingPressCount: 0,
        activeSourceCount: 0,
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
      window.__squishyThockAudioDiagnostics = runtime.diagnostics
    }
    publishDiagnostics(runtime)
    void loadEncodedTrack()
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
      runtime.lowShelf = null
      runtime.compressor = null
      runtime.buffer = null
      runtime.decodePromise = null
      if (context && context.state !== 'closed') {
        void context.close()
      }
      if (window.__squishyThockAudioDiagnostics === runtime.diagnostics) {
        delete window.__squishyThockAudioDiagnostics
      }
      delete document.documentElement.dataset.squishyThockAudioDiagnostics
    }
  }, [enabled, runtime])

  useEffect(() => {
    runtime.sequence = 0
    runtime.pendingPressCount = 0
    runtime.lastStartedAt = Number.NEGATIVE_INFINITY
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

    if (context.state === 'running' && runtime.buffer) {
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
          runtime.diagnostics.status = runtime.buffer
            ? 'ready'
            : 'loading'
          flushPendingPresses(runtime, experienceSeed)
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

    void ensureDecodedTrack(runtime, context, experienceSeed).catch(() => {
      // Diagnostics expose decode failures while visual presses continue.
    })
  }, [enabled, experienceSeed, runtime])

  return { trigger } as const
}
