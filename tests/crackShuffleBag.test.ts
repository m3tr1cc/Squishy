import { describe, expect, it } from 'vitest'
import {
  createCrackShuffleBag,
  drawCrackTrack,
  type CrackShuffleBagState,
  type CrackTrackIndex,
} from '../src/audio/crackShuffleBag'

function drawSequence(seed: number, count: number) {
  const tracks: CrackTrackIndex[] = []
  let state = createCrackShuffleBag(seed)

  for (let draw = 0; draw < count; draw += 1) {
    const result = drawCrackTrack(state)
    tracks.push(result.trackIndex)
    state = result.state
  }

  return { tracks, state }
}

function continueSequence(
  initialState: CrackShuffleBagState,
  count: number,
) {
  const tracks: CrackTrackIndex[] = []
  let state = initialState

  for (let draw = 0; draw < count; draw += 1) {
    const result = drawCrackTrack(state)
    tracks.push(result.trackIndex)
    state = result.state
  }

  return { tracks, state }
}

describe('crack track shuffle bag', () => {
  it('is deterministic for the same seed', () => {
    const first = drawSequence(0x51a7c0de, 50)
    const second = drawSequence(0x51a7c0de, 50)

    expect(first).toEqual(second)
  })

  it('produces different orders for different fixed seeds', () => {
    expect(drawSequence(1, 5).tracks).not.toEqual(
      drawSequence(2, 5).tracks,
    )
  })

  it('uses every track exactly once before refilling', () => {
    const { tracks } = drawSequence(0x12345678, 100)

    for (let start = 0; start < tracks.length; start += 5) {
      expect(tracks.slice(start, start + 5).sort()).toEqual([
        0, 1, 2, 3, 4,
      ])
    }
  })

  it('never repeats across a bag boundary', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const { tracks } = drawSequence(seed, 30)
      for (let index = 1; index < tracks.length; index += 1) {
        expect(tracks[index]).not.toBe(tracks[index - 1])
      }
    }
  })

  it('resumes to the same sequence from saved state', () => {
    const firstPart = drawSequence(7919, 7)
    const resumed = continueSequence(firstPart.state, 13)
    const uninterrupted = drawSequence(7919, 20)

    expect([...firstPart.tracks, ...resumed.tracks]).toEqual(
      uninterrupted.tracks,
    )
    expect(resumed.state).toEqual(uninterrupted.state)
  })

  it('does not mutate a frozen input state or bag', () => {
    const mutableState = createCrackShuffleBag(42)
    const snapshot = {
      ...mutableState,
      bag: [...mutableState.bag],
    }
    Object.freeze(mutableState.bag)
    Object.freeze(mutableState)

    const result = drawCrackTrack(mutableState)

    expect(mutableState).toEqual(snapshot)
    expect(result.state).not.toBe(mutableState)
    expect(result.state.bag).toBe(mutableState.bag)
  })

  it('returns only valid indices and keeps cursor within one bag', () => {
    let state = createCrackShuffleBag(8080)

    for (let draw = 0; draw < 100; draw += 1) {
      const result = drawCrackTrack(state)
      expect(Number.isInteger(result.trackIndex)).toBe(true)
      expect(result.trackIndex).toBeGreaterThanOrEqual(0)
      expect(result.trackIndex).toBeLessThanOrEqual(4)
      expect(result.state.cursor).toBeGreaterThanOrEqual(1)
      expect(result.state.cursor).toBeLessThanOrEqual(5)
      state = result.state
    }
  })

  it('normalizes the seed to an unsigned 32-bit value', () => {
    expect(drawSequence(-1, 30)).toEqual(
      drawSequence(0xffffffff, 30),
    )
  })
})
