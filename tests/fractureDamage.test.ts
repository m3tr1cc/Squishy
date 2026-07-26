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

function createTipGraph(reverseBonds = false): FractureGraph {
  const bonds = [
    {
      id: 'source',
      fragmentA: 'fragment-0',
      fragmentB: 'fragment-1',
      length: 1,
      toughness: 0.05,
      role: 0,
    },
    {
      id: 'trunk',
      fragmentA: 'fragment-1',
      fragmentB: 'fragment-2',
      length: 1,
      toughness: 10,
      role: 0,
    },
    {
      id: 'branch',
      fragmentA: 'fragment-1',
      fragmentB: 'fragment-3',
      length: 1,
      toughness: 10,
      role: 1,
    },
    {
      id: 'extra',
      fragmentA: 'fragment-1',
      fragmentB: 'fragment-4',
      length: 1,
      toughness: 10,
      role: 1,
    },
    {
      id: 'ordinary-turn',
      fragmentA: 'fragment-1',
      fragmentB: 'fragment-5',
      length: 1,
      toughness: 10,
      role: 2,
    },
    {
      id: 'remote',
      fragmentA: 'fragment-6',
      fragmentB: 'fragment-7',
      length: 1,
      toughness: 10,
      role: 0,
    },
  ]

  return {
    fragments: [
      [-1, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
      [0.9, 0.35, 0],
      [0.9, -0.35, 0],
      [0, 1, 0],
      [4, 0, 0],
      [5, 0, 0],
    ].map((centroid, index) => ({
      id: `fragment-${index}`,
      centroid: centroid as [number, number, number],
      normal: [0, 0, 1] as const,
    })),
    bonds: reverseBonds ? [...bonds].reverse() : bonds,
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
    tipStress: Array.from(state.bondTipStress),
    seamOpen: Array.from(state.bondSeamOpen),
    fragments: Array.from(state.fragmentState),
    peelAges: Array.from(state.fragmentPeelAge),
    brokenBondCount: state.brokenBondCount,
    attachedFragmentCount: state.attachedFragmentCount,
    completed: state.completed,
    elapsedSeconds: state.elapsedSeconds,
  }
}

function bondSnapshot(model: FractureModel, state: FractureState) {
  return Object.fromEntries(
    model.bondIds.map((id, index) => [
      String(id),
      {
        damage: state.bondDamage[index],
        broken: state.bondBroken[index],
        tipStress: state.bondTipStress[index],
        seamOpen: state.bondSeamOpen[index],
      },
    ]),
  )
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

  it('commits breaks before transferring stress to a later step', () => {
    const graph = createTipGraph()
    const chainGraph: FractureGraph = {
      fragments: graph.fragments.slice(0, 3),
      bonds: graph.bonds.slice(0, 2).map((bond, index) => ({
        ...bond,
        toughness: index === 0 ? 0.05 : 0.01,
      })),
    }
    const model = createFractureModel(chainGraph, {
      fixedDeltaSeconds: 1 / 60,
      propagationRadius: 0.2,
      damagePerSecond: 100,
      tipStressTransfer: 0.55,
      tipStressDecay: 0.82,
      maxTipBranches: 2,
    })
    const state = createFractureState(model)
    const localPress: FracturePress = {
      fragmentIndex: 0,
      localPoint: [-1, 0, 0],
      localNormal: [0, 0, 1],
      pressure: 1,
      durationSeconds: 0.16,
    }

    stepFracture(model, state, [localPress], 1 / 60)

    expect(Array.from(state.bondBroken)).toEqual([1, 0])
    expect(state.bondSeamOpen[0]).toBeGreaterThan(0)
    expect(state.bondSeamOpen[0]).toBeLessThan(1)
    expect(state.bondSeamOpen[1]).toBe(0)
    expect(state.bondTipStress[1]).toBeGreaterThan(0)

    stepFracture(model, state, [], 1 / 60)
    expect(Array.from(state.bondBroken)).toEqual([1, 1])
    expect(state.bondSeamOpen[0]).toBeGreaterThan(
      state.bondSeamOpen[1],
    )
    expect(state.bondSeamOpen[1]).toBeGreaterThan(0)
    expect(state.bondSeamOpen[1]).toBeLessThan(1)

    runFrames(model, state, [], 10)
    expect(Array.from(state.bondSeamOpen)).toEqual([1, 1])
  })

  it('routes decaying tip stress only to adjacent weak or aligned bonds', () => {
    const model = createFractureModel(createTipGraph(), {
      fixedDeltaSeconds: 1 / 60,
      propagationRadius: 0.2,
      damagePerSecond: 100,
      tipStressTransfer: 0.55,
      tipStressDecay: 0.82,
      maxTipBranches: 2,
    })
    const state = createFractureState(model)
    const localPress: FracturePress = {
      fragmentIndex: 0,
      localPoint: [-1, 0, 0],
      localNormal: [0, 0, 1],
      pressure: 1,
      durationSeconds: 0.16,
    }

    stepFracture(model, state, [localPress], 1 / 60)
    const firstTipStress = bondSnapshot(model, state)

    expect(firstTipStress.trunk.tipStress).toBeGreaterThan(0)
    expect(firstTipStress.branch.tipStress).toBeGreaterThan(0)
    expect(firstTipStress.extra.tipStress).toBe(0)
    expect(firstTipStress['ordinary-turn'].tipStress).toBe(0)
    expect(firstTipStress.remote.tipStress).toBe(0)

    stepFracture(model, state, [], 1 / 60)
    const decayedTipStress = bondSnapshot(model, state)
    expect(decayedTipStress.trunk.tipStress).toBeCloseTo(
      firstTipStress.trunk.tipStress * 0.82,
      6,
    )
    expect(decayedTipStress.branch.tipStress).toBeCloseTo(
      firstTipStress.branch.tipStress * 0.82,
      6,
    )
  })

  it('is invariant to bond input order', () => {
    const options = {
      fixedDeltaSeconds: 1 / 60,
      propagationRadius: 0.2,
      damagePerSecond: 100,
      tipStressTransfer: 0.55,
      tipStressDecay: 0.82,
      maxTipBranches: 2,
    }
    const orderedModel = createFractureModel(createTipGraph(), options)
    const reversedModel = createFractureModel(
      createTipGraph(true),
      options,
    )
    const orderedState = createFractureState(orderedModel)
    const reversedState = createFractureState(reversedModel)
    const localPress: FracturePress = {
      fragmentId: 'fragment-0',
      localPoint: [-1, 0, 0],
      localNormal: [0, 0, 1],
      pressure: 1,
      durationSeconds: 0.16,
    }

    stepFracture(orderedModel, orderedState, [localPress], 1 / 60)
    stepFracture(reversedModel, reversedState, [localPress], 1 / 60)
    stepFracture(orderedModel, orderedState, [], 1 / 60)
    stepFracture(reversedModel, reversedState, [], 1 / 60)

    expect(bondSnapshot(orderedModel, orderedState)).toEqual(
      bondSnapshot(reversedModel, reversedState),
    )
    expect(orderedState.events.map((event) => event.type)).toEqual(
      reversedState.events.map((event) => event.type),
    )
  })

  it('validates crack-tip routing options and bond roles', () => {
    expect(() => createModel({ tipStressTransfer: 1.1 })).toThrow(
      /tipStressTransfer/,
    )
    expect(() => createModel({ tipStressDecay: -0.1 })).toThrow(
      /tipStressDecay/,
    )
    expect(() => createModel({ maxTipBranches: 3 })).toThrow(
      /maxTipBranches/,
    )
    const graph = createRingGraph()
    const invalidGraph: FractureGraph = {
      ...graph,
      bonds: [{ ...graph.bonds[0], role: 4 }, ...graph.bonds.slice(1)],
    }
    expect(() => createFractureModel(invalidGraph)).toThrow(/role/)
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
    const continuingModel = createModel({
      crackContinuation: 1.2,
      tipStressTransfer: 0,
    })
    const continuing = createFractureState(continuingModel)
    const baselineModel = createModel({
      crackContinuation: 0,
      tipStressTransfer: 0,
    })
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
    expect(Array.from(state.bondTipStress)).toEqual(
      Array(model.bondCount).fill(0),
    )
    expect(Array.from(state.bondSeamOpen)).toEqual(
      Array(model.bondCount).fill(0),
    )
    expect(Array.from(state.bondPendingBreak)).toEqual(
      Array(model.bondCount).fill(0),
    )
    expect(Array.from(state.bondNextTipStress)).toEqual(
      Array(model.bondCount).fill(0),
    )
    expect(Array.from(state.fragmentSettleCandidate)).toEqual(
      Array(8).fill(0),
    )
  })
})
