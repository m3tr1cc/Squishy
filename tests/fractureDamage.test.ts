import { describe, expect, it } from 'vitest'
import {
  createFractureModel,
  createFractureState,
  FRAGMENT_STATE,
  markFragmentsSettled,
  resetFractureState,
  stepFracture,
} from '../src/scene/fracture/damage'
import type {
  FractureGraph,
  FractureModel,
  FracturePress,
  FractureState,
} from '../src/scene/fracture/damage'

function createRingGraph(fragmentCount = 8): FractureGraph {
  return {
    fragments: Array.from({ length: fragmentCount }, (_, index) => {
      const angle = (index / fragmentCount) * Math.PI * 2
      return {
        id: `fragment-${index}`,
        centroid: [Math.cos(angle), Math.sin(angle), 0],
        normal: [Math.cos(angle), Math.sin(angle), 0],
      } as const
    }),
    bonds: Array.from({ length: fragmentCount }, (_, index) => ({
      id: `bond-${index}`,
      fragmentA: `fragment-${index}`,
      fragmentB: `fragment-${(index + 1) % fragmentCount}`,
      length: 0.4,
      toughness: 0.72,
    })),
  }
}

function createModel(overrides = {}): FractureModel {
  return createFractureModel(createRingGraph(), {
    fixedDeltaSeconds: 1 / 60,
    maxSubsteps: 2,
    propagationRadius: 1.75,
    damagePerSecond: 4.5,
    holdRampSeconds: 0.35,
    holdStrength: 0.65,
    crackContinuation: 0.7,
    peelBrokenRatio: 0.4,
    detachBrokenRatio: 0.8,
    settleCandidateSeconds: 0.05,
    ...overrides,
  })
}

function press(
  fragmentIndex: number,
  durationSeconds = 0.16,
  pressure = 1,
): FracturePress {
  const angle = (fragmentIndex / 8) * Math.PI * 2
  return {
    fragmentIndex,
    localPoint: [Math.cos(angle), Math.sin(angle), 0],
    localNormal: [Math.cos(angle), Math.sin(angle), 0],
    pressure,
    durationSeconds,
  }
}

function runFrames(
  model: FractureModel,
  state: FractureState,
  presses: readonly FracturePress[],
  frameCount: number,
) {
  for (let frame = 0; frame < frameCount; frame += 1) {
    stepFracture(model, state, presses, 1 / 60)
  }
}

function snapshot(state: FractureState) {
  return {
    damage: Array.from(state.bondDamage),
    broken: Array.from(state.bondBroken),
    fragments: Array.from(state.fragmentState),
    peelAges: Array.from(state.fragmentPeelAge),
    brokenBondCount: state.brokenBondCount,
    attachedFragmentCount: state.attachedFragmentCount,
    completed: state.completed,
    elapsedSeconds: state.elapsedSeconds,
  }
}

describe('deterministic wax fracture damage', () => {
  it('propagates locally over the surface graph without jumping opposite', () => {
    const model = createModel()
    const state = createFractureState(model)

    runFrames(model, state, [press(0)], 10)

    expect(state.bondDamage[0]).toBeGreaterThan(0)
    expect(state.bondDamage[7]).toBeGreaterThan(0)
    expect(state.bondDamage[3]).toBe(0)
    expect(state.bondDamage[4]).toBe(0)
    expect(state.fragmentLoad[4]).toBe(0)
  })

  it('accumulates opt-in remote fatigue without breaking from one tap', () => {
    const model = createModel({ globalCompressionFatigue: 0.035 })
    const state = createFractureState(model)

    runFrames(model, state, [press(0)], 10)

    expect(state.fragmentLoad[4]).toBe(0)
    expect(state.bondDamage[3]).toBeGreaterThan(0)
    expect(state.bondDamage[4]).toBeGreaterThan(0)
    expect(state.bondBroken[3]).toBe(0)
    expect(state.bondBroken[4]).toBe(0)
  })

  it('can fatigue the full shell through repeated local pulses', () => {
    const model = createModel({ globalCompressionFatigue: 0.035 })
    const state = createFractureState(model)

    for (let pulse = 0; pulse < 28; pulse += 1) {
      runFrames(model, state, [press(0)], 10)
      runFrames(model, state, [], 2)
    }

    expect(state.brokenBondCount).toBe(model.bondCount)
    expect(state.completed).toBe(true)
  })

  it('rejects invalid global compression fatigue', () => {
    expect(() =>
      createModel({ globalCompressionFatigue: -0.01 }),
    ).toThrow(/globalCompressionFatigue/)
    expect(() =>
      createModel({ globalCompressionFatigue: Number.NaN }),
    ).toThrow(/globalCompressionFatigue/)
  })

  it('never heals damage or returns fragments to an earlier state', () => {
    const model = createModel()
    const state = createFractureState(model)

    runFrames(model, state, [press(0)], 6)
    const beforeDamage = Array.from(state.bondDamage)
    const beforeState = Array.from(state.fragmentState)

    runFrames(model, state, [], 30)

    state.bondDamage.forEach((damage, index) => {
      expect(damage).toBeGreaterThanOrEqual(beforeDamage[index])
    })
    state.fragmentState.forEach((fragmentState, index) => {
      expect(fragmentState).toBeGreaterThanOrEqual(beforeState[index])
    })
  })

  it('requires locally loaded peel dwell before a damaged plate detaches', () => {
    const model = createModel({
      damagePerSecond: 100,
      peelBrokenRatio: 0.5,
      detachBrokenRatio: 1,
      minimumPeelSeconds: 0.22,
    })
    const state = createFractureState(model)

    // Fully damage fragment 0, then keep a tap active for less than 220ms.
    runFrames(model, state, [press(0)], 10)
    expect(state.fragmentBrokenBonds[0]).toBe(2)
    expect(state.fragmentState[0]).toBe(FRAGMENT_STATE.PEELING)
    expect(state.fragmentPeelAge[0]).toBeLessThan(0.22)

    // Wall-clock frames after release do not satisfy a physical peel dwell.
    runFrames(model, state, [], 20)
    expect(state.fragmentState[0]).toBe(FRAGMENT_STATE.PEELING)
    const ageAfterRelease = state.fragmentPeelAge[0]
    runFrames(model, state, [], 20)
    expect(state.fragmentPeelAge[0]).toBe(ageAfterRelease)

    // Continued/repeated local loading supplies the remaining dwell.
    runFrames(model, state, [press(0, 0.7)], 10)
    expect(state.fragmentState[0]).toBe(FRAGMENT_STATE.DETACHED)
    expect(state.fragmentPeelAge[0]).toBeGreaterThanOrEqual(0.22)
  })

  it('validates the minimum peel dwell', () => {
    expect(() => createModel({ minimumPeelSeconds: -0.01 })).toThrow(
      /minimumPeelSeconds/,
    )
    expect(() =>
      createModel({ minimumPeelSeconds: Number.NaN }),
    ).toThrow(/minimumPeelSeconds/)
  })

  it('replays the same press sequence bit-for-bit', () => {
    const model = createModel()
    const first = createFractureState(model)
    const second = createFractureState(model)
    const sequence = [
      { fragment: 0, frames: 8, duration: 0.16 },
      { fragment: 1, frames: 20, duration: 0.7 },
      { fragment: 7, frames: 12, duration: 0.3 },
      { fragment: 3, frames: 9, duration: 0.16 },
    ]

    for (const item of sequence) {
      runFrames(
        model,
        first,
        [press(item.fragment, item.duration)],
        item.frames,
      )
      runFrames(
        model,
        second,
        [press(item.fragment, item.duration)],
        item.frames,
      )
    }

    expect(snapshot(first)).toEqual(snapshot(second))
  })

  it('amplifies a continuing crack along an already broken boundary', () => {
    const continuingModel = createModel({ crackContinuation: 1.2 })
    const continuing = createFractureState(continuingModel)
    const baselineModel = createModel({ crackContinuation: 0 })
    const baseline = createFractureState(baselineModel)

    runFrames(continuingModel, continuing, [press(0)], 18)
    runFrames(baselineModel, baseline, [press(0)], 18)
    expect(continuing.brokenBondCount).toBeGreaterThan(0)
    expect(baseline.brokenBondCount).toBeGreaterThan(0)

    runFrames(continuingModel, continuing, [press(1, 0.7)], 4)
    runFrames(baselineModel, baseline, [press(1, 0.7)], 4)

    expect(continuing.bondDamage[1]).toBeGreaterThan(
      baseline.bondDamage[1],
    )
  })

  it('reaches completion, exposes settle candidates, and resets exactly', () => {
    const model = createModel({
      damagePerSecond: 12,
      peelBrokenRatio: 0.25,
      detachBrokenRatio: 0.5,
    })
    const state = createFractureState(model)

    for (let fragmentIndex = 0; fragmentIndex < 8; fragmentIndex += 1) {
      runFrames(model, state, [press(fragmentIndex, 0.8)], 8)
    }
    runFrames(model, state, [], 8)

    expect(state.completed).toBe(true)
    expect(state.attachedFragmentCount).toBe(0)
    expect(state.brokenBondCount).toBe(model.bondCount)
    expect(Array.from(state.fragmentSettleCandidate)).toEqual(
      Array(8).fill(1),
    )

    markFragmentsSettled(
      model,
      state,
      Uint16Array.from({ length: 8 }, (_, index) => index),
    )
    expect(Array.from(state.fragmentState)).toEqual(
      Array(8).fill(FRAGMENT_STATE.SETTLED),
    )

    resetFractureState(state)
    expect(snapshot(state)).toEqual(
      snapshot(createFractureState(model)),
    )
    expect(state.events).toEqual([])
    expect(Array.from(state.fragmentSettleCandidate)).toEqual(
      Array(8).fill(0),
    )
  })
})
