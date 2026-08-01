import { describe, expect, it } from 'vitest'
import {
  selectThockPlaybackRate,
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
})
