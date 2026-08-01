import slimeSquish1Url from '../../audio/slime-squish-1.mp3?url'
import slimeSquish2Url from '../../audio/slime-squish-2.mp3?url'
import slimeSquish4Url from '../../audio/slime-squish-4.mp3?url'

export const SLIME_TRACKS = Object.freeze([
  Object.freeze({ id: 'slime-squish-1', url: slimeSquish1Url, gain: 0.72 }),
  Object.freeze({ id: 'slime-squish-2', url: slimeSquish2Url, gain: 0.68 }),
  Object.freeze({ id: 'slime-squish-4', url: slimeSquish4Url, gain: 0.7 }),
] as const)

export const SLIME_TRACK_COUNT = SLIME_TRACKS.length
const PLAYBACK_RATES = Object.freeze([0.96, 0.985, 1.01, 1.035])

function hashUint32(value: number) {
  let hash = value >>> 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

export function selectSlimePlaybackRate(seed: number, sequence: number) {
  const hash = hashUint32(
    (seed ^ Math.imul(sequence + 1, 0x9e3779b1)) >>> 0,
  )
  return PLAYBACK_RATES[hash % PLAYBACK_RATES.length]
}
