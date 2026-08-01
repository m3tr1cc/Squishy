import { describe, expect, it } from 'vitest'
import {
  SLIME_TRACK_COUNT,
  SLIME_TRACKS,
  selectSlimePlaybackRate,
} from '../src/audio/slimeTracks'
import {
  createSlimeShuffleBag,
  drawSlimeTrack,
} from '../src/audio/slimeShuffleBag'

describe('slime audio', () => {
  it('exposes three unique locally deployable wet recordings', () => {
    expect(SLIME_TRACK_COUNT).toBe(3)
    expect(new Set(SLIME_TRACKS.map((track) => track.id)).size).toBe(3)
    expect(new Set(SLIME_TRACKS.map((track) => track.url)).size).toBe(3)
    for (const track of SLIME_TRACKS) {
      expect(track.url.length).toBeGreaterThan(0)
      expect(track.gain).toBeGreaterThan(0)
      expect(track.gain).toBeLessThanOrEqual(1)
    }
  })

  it('plays complete shuffled cycles without immediate repeats', () => {
    let state = createSlimeShuffleBag(0x4a17cf03)
    const draws: number[] = []
    for (let index = 0; index < 18; index += 1) {
      const draw = drawSlimeTrack(state)
      state = draw.state
      draws.push(draw.trackIndex)
    }
    for (let offset = 0; offset < draws.length; offset += 3) {
      expect(new Set(draws.slice(offset, offset + 3)).size).toBe(3)
    }
    for (let index = 1; index < draws.length; index += 1) {
      expect(draws[index]).not.toBe(draws[index - 1])
    }
  })

  it('selects bounded deterministic pitch variation', () => {
    const first = Array.from({ length: 16 }, (_, sequence) =>
      selectSlimePlaybackRate(0x93ae118d, sequence),
    )
    const second = Array.from({ length: 16 }, (_, sequence) =>
      selectSlimePlaybackRate(0x93ae118d, sequence),
    )
    expect(first).toEqual(second)
    expect(new Set(first).size).toBeGreaterThan(1)
    expect(Math.min(...first)).toBeGreaterThanOrEqual(0.96)
    expect(Math.max(...first)).toBeLessThanOrEqual(1.035)
  })
})
