import { describe, expect, it } from 'vitest'
import {
  resolveThockPlaybackRate,
  selectThockPlaybackRate,
  THOCK_AUDIO_PROFILES,
  THOCK_TRACK,
} from '../src/audio/thockTrack'

describe('thock audio', () => {
  it('exposes one locally deployable mechanical-key recording', () => {
    expect(THOCK_TRACK.id).toBe('mechanical-keypress')
    expect(THOCK_TRACK.url.length).toBeGreaterThan(0)
    expect(THOCK_TRACK.gain).toBeGreaterThan(0)
    expect(THOCK_TRACK.gain).toBeLessThanOrEqual(1)
  })

  it('selects bounded deterministic pitch variation', () => {
    const first = Array.from({ length: 12 }, (_, sequence) =>
      selectThockPlaybackRate(0x712a2c3d, sequence),
    )
    const second = Array.from({ length: 12 }, (_, sequence) =>
      selectThockPlaybackRate(0x712a2c3d, sequence),
    )
    expect(first).toEqual(second)
    expect(new Set(first).size).toBeGreaterThan(1)
    expect(Math.min(...first)).toBeGreaterThanOrEqual(0.9)
    expect(Math.max(...first)).toBeLessThanOrEqual(1.02)
  })

  it('uses a lower, softer profile for iPod button presses', () => {
    const standardRate = resolveThockPlaybackRate(
      0x712a2c3d,
      0,
      'standard',
    )
    const deepRate = resolveThockPlaybackRate(
      0x712a2c3d,
      0,
      'deep',
    )
    expect(deepRate).toBeLessThan(standardRate * 0.75)
    expect(THOCK_AUDIO_PROFILES.deep.lowPassFrequency).toBeLessThan(
      THOCK_AUDIO_PROFILES.standard.lowPassFrequency,
    )
    expect(THOCK_AUDIO_PROFILES.deep.lowShelfGain).toBeGreaterThan(
      THOCK_AUDIO_PROFILES.standard.lowShelfGain,
    )
  })
})
