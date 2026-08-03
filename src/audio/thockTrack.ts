import thockKeypressUrl from '../../audio/thock-keypress.mp3?url'

export const THOCK_TRACK = Object.freeze({
  id: 'mechanical-keypress',
  url: thockKeypressUrl,
  gain: 0.82,
})

export type ThockAudioProfile = 'standard' | 'deep'

export const THOCK_AUDIO_PROFILES = Object.freeze({
  standard: Object.freeze({
    playbackRateScale: 1,
    masterGain: 0.78,
    lowShelfGain: 4.5,
    lowPassFrequency: 9000,
    sampleGain: 1,
    fadeSeconds: 0.36,
    durationSeconds: 0.4,
  }),
  deep: Object.freeze({
    playbackRateScale: 0.72,
    masterGain: 0.9,
    lowShelfGain: 8,
    lowPassFrequency: 2600,
    sampleGain: 1.08,
    fadeSeconds: 0.48,
    durationSeconds: 0.52,
  }),
})

const PLAYBACK_RATES = Object.freeze([0.92, 0.955, 0.99, 1.015])

function hashUint32(value: number) {
  let hash = value >>> 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

export function selectThockPlaybackRate(seed: number, sequence: number) {
  const hash = hashUint32(
    (seed ^ Math.imul(sequence + 1, 0x9e3779b1)) >>> 0,
  )
  return PLAYBACK_RATES[hash % PLAYBACK_RATES.length]
}

export function resolveThockPlaybackRate(
  seed: number,
  sequence: number,
  profile: ThockAudioProfile,
) {
  return (
    selectThockPlaybackRate(seed, sequence) *
    THOCK_AUDIO_PROFILES[profile].playbackRateScale
  )
}
