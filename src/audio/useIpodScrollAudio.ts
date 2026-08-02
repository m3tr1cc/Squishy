import { useCallback, useEffect, useRef } from 'react'
import {
  getIpodScrollSample,
  IPOD_SCROLL_SOUND,
} from './ipodScrollSound'

type IpodScrollAudioRuntime = {
  context: AudioContext | null
  output: GainNode | null
  buffer: AudioBuffer | null
  activeSources: Set<AudioBufferSourceNode>
  lastStartedAt: number
  disposed: boolean
}

function getAudioContextConstructor() {
  const audioWindow = window as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext
}

function createClickBuffer(context: AudioContext) {
  const sampleCount = Math.max(
    1,
    Math.ceil(
      context.sampleRate * IPOD_SCROLL_SOUND.durationSeconds,
    ),
  )
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < sampleCount; index += 1) {
    channel[index] = getIpodScrollSample(index / context.sampleRate)
  }
  return buffer
}

function ensureAudioGraph(runtime: IpodScrollAudioRuntime) {
  if (runtime.context && runtime.context.state !== 'closed') {
    return runtime.context
  }
  const AudioContextConstructor = getAudioContextConstructor()
  if (!AudioContextConstructor) {
    return null
  }
  const context = new AudioContextConstructor({ latencyHint: 'interactive' })
  const output = context.createGain()
  output.gain.value = IPOD_SCROLL_SOUND.gain
  output.connect(context.destination)
  runtime.context = context
  runtime.output = output
  runtime.buffer = createClickBuffer(context)
  return context
}

function playClick(runtime: IpodScrollAudioRuntime) {
  const { buffer, context, output } = runtime
  if (
    runtime.disposed ||
    !buffer ||
    !context ||
    !output ||
    context.state !== 'running'
  ) {
    return
  }
  const now = context.currentTime
  if (
    now - runtime.lastStartedAt <
    IPOD_SCROLL_SOUND.minimumIntervalSeconds
  ) {
    return
  }
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(output)
  source.onended = () => {
    runtime.activeSources.delete(source)
    source.disconnect()
  }
  runtime.activeSources.add(source)
  runtime.lastStartedAt = now
  source.start(now)
}

export function useIpodScrollAudio(enabled: boolean) {
  const runtimeRef = useRef<IpodScrollAudioRuntime | null>(null)
  if (!runtimeRef.current) {
    runtimeRef.current = {
      context: null,
      output: null,
      buffer: null,
      activeSources: new Set(),
      lastStartedAt: Number.NEGATIVE_INFINITY,
      disposed: !enabled,
    }
  }
  const runtime = runtimeRef.current

  useEffect(() => {
    runtime.disposed = !enabled
    if (!enabled) {
      return
    }
    return () => {
      runtime.disposed = true
      for (const source of runtime.activeSources) {
        source.onended = null
        try {
          source.stop()
        } catch {
          // The tiny piezo buffer may already have ended.
        }
        source.disconnect()
      }
      runtime.activeSources.clear()
      runtime.output?.disconnect()
      const context = runtime.context
      runtime.context = null
      runtime.output = null
      runtime.buffer = null
      runtime.lastStartedAt = Number.NEGATIVE_INFINITY
      if (context && context.state !== 'closed') {
        void context.close()
      }
    }
  }, [enabled, runtime])

  const unlock = useCallback(() => {
    if (!enabled || runtime.disposed) {
      return
    }
    const context = ensureAudioGraph(runtime)
    if (context?.state === 'suspended') {
      void context.resume()
    }
  }, [enabled, runtime])

  const trigger = useCallback(() => {
    if (!enabled || runtime.disposed) {
      return
    }
    const context = ensureAudioGraph(runtime)
    if (!context) {
      return
    }
    if (context.state === 'running') {
      playClick(runtime)
      return
    }
    void context.resume().then(() => playClick(runtime))
  }, [enabled, runtime])

  return { trigger, unlock } as const
}
