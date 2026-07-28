import { describe, expect, it } from 'vitest'
import {
  createFragmentFadeState,
  DEFAULT_FRAGMENT_FADE_POLICY,
  detachFragmentForFade,
  FRAGMENT_FADE_PHASE,
  isFragmentRetired,
  markFragmentSleepingForFade,
  resetFragmentFadeFragment,
  resetFragmentFadeState,
  shouldSimulateFragment,
  stepFragmentFade,
} from '../src/scene/fracture/fragmentFade'

describe('fragment fade lifecycle', () => {
  it('uses the production simulation, sleep-delay, and fade timings', () => {
    const state = createFragmentFadeState(2)

    expect(state.policy).toEqual(DEFAULT_FRAGMENT_FADE_POLICY)
    expect([...state.phase]).toEqual([
      FRAGMENT_FADE_PHASE.ATTACHED,
      FRAGMENT_FADE_PHASE.ATTACHED,
    ])
    expect([...state.alpha]).toEqual([1, 1])
  })

  it('simulates until the hard timeout, then fades linearly to retirement', () => {
    const state = createFragmentFadeState(1)
    detachFragmentForFade(state, 0)

    stepFragmentFade(state, 1.49, false)
    expect(shouldSimulateFragment(state, 0)).toBe(true)
    expect(state.alpha[0]).toBe(1)
    expect(state.fadeStartedCount).toBe(0)

    stepFragmentFade(state, 0.01, false)
    expect(state.phase[0]).toBe(FRAGMENT_FADE_PHASE.FADING)
    expect(state.alpha[0]).toBeCloseTo(1, 6)
    expect(state.fadeStartedCount).toBe(1)
    expect(state.fadeStartedIndices[0]).toBe(0)

    stepFragmentFade(state, 0.225, false)
    expect(state.alpha[0]).toBeCloseTo(0.5, 6)
    expect(state.retiredCount).toBe(0)

    stepFragmentFade(state, 0.225, false)
    expect(isFragmentRetired(state, 0)).toBe(true)
    expect(state.alpha[0]).toBe(0)
    expect(state.retiredCount).toBe(1)
    expect(state.retiredIndices[0]).toBe(0)
  })

  it('waits 150ms after sleep before beginning the fade', () => {
    const state = createFragmentFadeState(1)
    detachFragmentForFade(state, 0)
    stepFragmentFade(state, 0.4, false)
    markFragmentSleepingForFade(state, 0)

    expect(shouldSimulateFragment(state, 0)).toBe(false)
    expect(state.phase[0]).toBe(
      FRAGMENT_FADE_PHASE.WAITING_AFTER_SLEEP,
    )

    stepFragmentFade(state, 0.149, false)
    expect(state.alpha[0]).toBe(1)
    expect(state.fadeStartedCount).toBe(0)

    stepFragmentFade(state, 0.001, false)
    expect(state.phase[0]).toBe(FRAGMENT_FADE_PHASE.FADING)
    expect(state.alpha[0]).toBeCloseTo(1, 6)
    expect(state.fadeStartedIndices[0]).toBe(0)

    stepFragmentFade(state, 0.45, false)
    expect(isFragmentRetired(state, 0)).toBe(true)
    expect(state.alpha[0]).toBe(0)
  })

  it('carries a large-frame overshoot through timeout and fade boundaries', () => {
    const state = createFragmentFadeState(1)
    detachFragmentForFade(state, 0)

    stepFragmentFade(state, 2, false)

    expect(state.fadeStartedCount).toBe(1)
    expect(state.fadeStartedIndices[0]).toBe(0)
    expect(state.retiredCount).toBe(1)
    expect(state.retiredIndices[0]).toBe(0)
    expect(state.phase[0]).toBe(FRAGMENT_FADE_PHASE.RETIRED)
    expect(state.alpha[0]).toBe(0)
  })

  it('retires every detached phase immediately for reduced motion', () => {
    const state = createFragmentFadeState(4)
    detachFragmentForFade(state, 0)
    detachFragmentForFade(state, 1)
    detachFragmentForFade(state, 2)
    markFragmentSleepingForFade(state, 1)
    stepFragmentFade(state, 1.6, false)
    detachFragmentForFade(state, 3)

    stepFragmentFade(state, 0, true)

    expect([...state.phase]).toEqual([
      FRAGMENT_FADE_PHASE.RETIRED,
      FRAGMENT_FADE_PHASE.RETIRED,
      FRAGMENT_FADE_PHASE.RETIRED,
      FRAGMENT_FADE_PHASE.RETIRED,
    ])
    expect([...state.alpha]).toEqual([0, 0, 0, 0])
    expect(state.retiredCount).toBe(3)
    expect(state.retiredIndices[0]).toBe(0)
    expect(state.retiredIndices[1]).toBe(2)
    expect(state.retiredIndices[2]).toBe(3)
  })

  it('does not affect attached fragments in reduced-motion mode', () => {
    const state = createFragmentFadeState(2)
    detachFragmentForFade(state, 1)

    stepFragmentFade(state, 0, true)

    expect(state.phase[0]).toBe(FRAGMENT_FADE_PHASE.ATTACHED)
    expect(state.alpha[0]).toBe(1)
    expect(state.phase[1]).toBe(FRAGMENT_FADE_PHASE.RETIRED)
  })

  it('is deterministic across regular and irregular frame partitions', () => {
    const regular = createFragmentFadeState(1)
    const irregular = createFragmentFadeState(1)
    detachFragmentForFade(regular, 0)
    detachFragmentForFade(irregular, 0)

    for (let frame = 0; frame < 102; frame += 1) {
      stepFragmentFade(regular, 1 / 60, false)
    }
    for (const delta of [0.17, 0.031, 0.42, 0.079, 0.5, 0.2, 0.3]) {
      stepFragmentFade(irregular, delta, false)
    }

    expect(regular.detachedAgeSeconds[0]).toBeCloseTo(1.7, 12)
    expect(irregular.detachedAgeSeconds[0]).toBeCloseTo(1.7, 12)
    expect(regular.phase[0]).toBe(irregular.phase[0])
    expect(regular.alpha[0]).toBeCloseTo(irregular.alpha[0], 6)
  })

  it('keeps fragments independent and reports only current-step transitions', () => {
    const state = createFragmentFadeState(3, {
      maximumSimulationSeconds: 0.5,
      sleepFadeDelaySeconds: 0.1,
      fadeDurationSeconds: 0.2,
    })
    detachFragmentForFade(state, 0)
    detachFragmentForFade(state, 2)
    markFragmentSleepingForFade(state, 2)

    stepFragmentFade(state, 0.1, false)
    expect(state.phase[0]).toBe(FRAGMENT_FADE_PHASE.SIMULATING)
    expect(state.phase[1]).toBe(FRAGMENT_FADE_PHASE.ATTACHED)
    expect(state.phase[2]).toBe(FRAGMENT_FADE_PHASE.FADING)
    expect(state.fadeStartedCount).toBe(1)
    expect(state.fadeStartedIndices[0]).toBe(2)

    stepFragmentFade(state, 0.1, false)
    expect(state.fadeStartedCount).toBe(0)
    expect(state.retiredCount).toBe(0)
    expect(state.alpha[2]).toBeCloseTo(0.5, 6)
  })

  it('reuses fixed scratch buffers and never rewinds repeated detach or sleep events', () => {
    const state = createFragmentFadeState(1)
    const phases = state.phase
    const alpha = state.alpha
    const fadeStarts = state.fadeStartedIndices
    const retirements = state.retiredIndices

    expect(detachFragmentForFade(state, 0)).toBe(state)
    stepFragmentFade(state, 0.4, false)
    detachFragmentForFade(state, 0)
    markFragmentSleepingForFade(state, 0)
    stepFragmentFade(state, 0.1, false)
    markFragmentSleepingForFade(state, 0)
    expect(stepFragmentFade(state, 0.05, false)).toBe(state)

    expect(state.detachedAgeSeconds[0]).toBeCloseTo(0.55, 12)
    expect(state.phase).toBe(phases)
    expect(state.alpha).toBe(alpha)
    expect(state.fadeStartedIndices).toBe(fadeStarts)
    expect(state.retiredIndices).toBe(retirements)
  })

  it('can reset one fragment or reuse the complete state for another coating', () => {
    const state = createFragmentFadeState(2)
    detachFragmentForFade(state, 0)
    detachFragmentForFade(state, 1)
    stepFragmentFade(state, 2, false)

    resetFragmentFadeFragment(state, 0)
    expect(state.phase[0]).toBe(FRAGMENT_FADE_PHASE.ATTACHED)
    expect(state.alpha[0]).toBe(1)
    expect(state.phase[1]).toBe(FRAGMENT_FADE_PHASE.RETIRED)

    expect(resetFragmentFadeState(state)).toBe(state)
    expect([...state.phase]).toEqual([
      FRAGMENT_FADE_PHASE.ATTACHED,
      FRAGMENT_FADE_PHASE.ATTACHED,
    ])
    expect([...state.alpha]).toEqual([1, 1])
    expect(state.fadeStartedCount).toBe(0)
    expect(state.retiredCount).toBe(0)
  })

  it('validates counts, policy timings, frame deltas, and fragment indices', () => {
    expect(() => createFragmentFadeState(-1)).toThrow(
      'fragmentCount must be a non-negative integer',
    )
    expect(() =>
      createFragmentFadeState(1, {
        maximumSimulationSeconds: Number.NaN,
      }),
    ).toThrow('maximumSimulationSeconds')
    expect(() =>
      createFragmentFadeState(1, {
        sleepFadeDelaySeconds: -1,
      }),
    ).toThrow('sleepFadeDelaySeconds')
    expect(() =>
      createFragmentFadeState(1, {
        fadeDurationSeconds: 0,
      }),
    ).toThrow('fadeDurationSeconds')

    const state = createFragmentFadeState(1)
    expect(() => detachFragmentForFade(state, 1)).toThrow('fragmentIndex')
    expect(() => markFragmentSleepingForFade(state, -1)).toThrow(
      'fragmentIndex',
    )
    expect(() => stepFragmentFade(state, Number.NaN, false)).toThrow(
      'deltaSeconds',
    )
  })
})
