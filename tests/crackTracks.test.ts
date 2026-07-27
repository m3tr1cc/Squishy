import { describe, expect, it } from 'vitest'
import {
  CRACK_TRACK_COUNT,
  CRACK_TRACKS,
} from '../src/audio/crackTracks'

describe('crack audio manifest', () => {
  it('includes five unique deployable recordings', () => {
    expect(CRACK_TRACK_COUNT).toBe(5)
    expect(new Set(CRACK_TRACKS.map((track) => track.id)).size).toBe(5)
    expect(new Set(CRACK_TRACKS.map((track) => track.url)).size).toBe(5)
    for (const track of CRACK_TRACKS) {
      expect(track.url.length).toBeGreaterThan(0)
      expect(track.gain).toBeGreaterThan(0)
      expect(track.gain).toBeLessThanOrEqual(1)
    }
  })
})
