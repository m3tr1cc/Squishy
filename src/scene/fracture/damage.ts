export type FractureId = string | number
export type FractureVector = readonly [number, number, number]

export type FractureFragment = Readonly<{
  id: FractureId
  centroid: FractureVector
  normal: FractureVector
}>

export type FractureBond = Readonly<{
  id: FractureId
  fragmentA: FractureId
  fragmentB: FractureId
  length: number
  toughness: number
}>

export type FractureGraph = Readonly<{
  fragments: readonly FractureFragment[]
  bonds: readonly FractureBond[]
}>

export const FRAGMENT_STATE = {
  ATTACHED: 0,
  CRACKED: 1,
  PEELING: 2,
  DETACHED: 3,
  SETTLED: 4,
} as const

export type FragmentState =
  (typeof FRAGMENT_STATE)[keyof typeof FRAGMENT_STATE]

export type FracturePress = Readonly<{
  /**
   * Supplying an index avoids an ID lookup in the hot path. If neither an
   * index nor an ID is supplied, the closest centroid to localPoint is used.
   */
  fragmentIndex?: number
  fragmentId?: FractureId
  localPoint: FractureVector
  localNormal: FractureVector
  /** Normalized contact pressure. Values outside 0..1 are clamped. */
  pressure: number
  /** Time since contact began. A synthesized tap can remain active for 160ms. */
  durationSeconds: number
}>

export type FractureEvent =
  | Readonly<{
      type: 'bond-break'
      bondIndex: number
      bondId: FractureId
      fragmentA: number
      fragmentB: number
      energy: number
    }>
  | Readonly<{
      type:
        | 'fragment-crack'
        | 'fragment-peel'
        | 'fragment-detach'
        | 'fragment-settle-candidate'
        | 'fragment-settle'
      fragmentIndex: number
      fragmentId: FractureId
    }>
  | Readonly<{
      type: 'complete'
      elapsedSeconds: number
      brokenBondCount: number
    }>

export type FractureOptions = Readonly<{
  fixedDeltaSeconds?: number
  maxSubsteps?: number
  propagationRadius?: number
  damagePerSecond?: number
  holdRampSeconds?: number
  holdStrength?: number
  /**
   * Fraction of combined press strength applied as low whole-shell fatigue.
   * Keep small: local geodesic loading remains the primary fracture force.
   */
  globalCompressionFatigue?: number
  crackContinuation?: number
  normalCutoff?: number
  peelBrokenRatio?: number
  detachBrokenRatio?: number
  /** Required locally loaded time in PEELING before detachment is allowed. */
  minimumPeelSeconds?: number
  settleCandidateSeconds?: number
}>

type ResolvedFractureOptions = Readonly<{
  fixedDeltaSeconds: number
  maxSubsteps: number
  propagationRadius: number
  damagePerSecond: number
  holdRampSeconds: number
  holdStrength: number
  globalCompressionFatigue: number
  crackContinuation: number
  normalCutoff: number
  peelBrokenRatio: number
  detachBrokenRatio: number
  minimumPeelSeconds: number
  settleCandidateSeconds: number
}>

export type FractureModel = Readonly<{
  fragmentCount: number
  bondCount: number
  fragmentIds: readonly FractureId[]
  bondIds: readonly FractureId[]
  centroids: Float32Array
  normals: Float32Array
  bondFragmentA: Uint16Array | Uint32Array
  bondFragmentB: Uint16Array | Uint32Array
  bondLength: Float32Array
  bondToughness: Float32Array
  incidentStarts: Uint32Array
  incidentBonds: Uint16Array | Uint32Array
  geodesicDistances: Float32Array
  meanBondLength: number
  options: ResolvedFractureOptions
  fragmentIndexById: ReadonlyMap<FractureId, number>
}>

export type FractureState = {
  /** Accumulated, irreversible damage in the same units as bond toughness. */
  readonly bondDamage: Float32Array
  readonly bondBroken: Uint8Array
  readonly fragmentState: Uint8Array
  readonly fragmentLoad: Float32Array
  readonly fragmentBrokenBonds: Uint16Array | Uint32Array
  /** Cumulative locally loaded time spent in the PEELING state. */
  readonly fragmentPeelAge: Float32Array
  readonly fragmentDetachAge: Float32Array
  readonly fragmentSettleCandidate: Uint8Array
  /** Reused on every step. Copy events if they must survive the next call. */
  readonly events: FractureEvent[]
  elapsedSeconds: number
  accumulatorSeconds: number
  stepCount: number
  lastSubstepCount: number
  brokenBondCount: number
  attachedFragmentCount: number
  completed: boolean
}

const DEFAULT_FIXED_DELTA_SECONDS = 1 / 60
const EPSILON = 1e-8

function assertFinitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite number greater than zero`)
  }
}

function assertRatio(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between zero and one`)
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function vectorLength(x: number, y: number, z: number) {
  return Math.sqrt(x * x + y * y + z * z)
}

function chooseIndexArray(length: number, maximumValue: number) {
  return maximumValue <= 0xffff
    ? new Uint16Array(length)
    : new Uint32Array(length)
}

function resolveOptions(
  options: FractureOptions,
  defaultPropagationRadius: number,
): ResolvedFractureOptions {
  const resolved = {
    fixedDeltaSeconds:
      options.fixedDeltaSeconds ?? DEFAULT_FIXED_DELTA_SECONDS,
    maxSubsteps: options.maxSubsteps ?? 2,
    propagationRadius:
      options.propagationRadius ?? defaultPropagationRadius,
    damagePerSecond: options.damagePerSecond ?? 4.5,
    holdRampSeconds: options.holdRampSeconds ?? 0.35,
    holdStrength: options.holdStrength ?? 0.65,
    globalCompressionFatigue: options.globalCompressionFatigue ?? 0,
    crackContinuation: options.crackContinuation ?? 0.45,
    normalCutoff: options.normalCutoff ?? -0.2,
    peelBrokenRatio: options.peelBrokenRatio ?? 0.4,
    detachBrokenRatio: options.detachBrokenRatio ?? 0.8,
    minimumPeelSeconds: options.minimumPeelSeconds ?? 0,
    settleCandidateSeconds: options.settleCandidateSeconds ?? 0.25,
  }

  assertFinitePositive(resolved.fixedDeltaSeconds, 'fixedDeltaSeconds')
  assertFinitePositive(resolved.propagationRadius, 'propagationRadius')
  assertFinitePositive(resolved.damagePerSecond, 'damagePerSecond')
  assertFinitePositive(resolved.holdRampSeconds, 'holdRampSeconds')
  assertRatio(resolved.peelBrokenRatio, 'peelBrokenRatio')
  assertRatio(resolved.detachBrokenRatio, 'detachBrokenRatio')

  if (
    !Number.isInteger(resolved.maxSubsteps) ||
    resolved.maxSubsteps < 1 ||
    resolved.maxSubsteps > 16
  ) {
    throw new Error('maxSubsteps must be an integer between 1 and 16')
  }
  if (!Number.isFinite(resolved.holdStrength) || resolved.holdStrength < 0) {
    throw new Error('holdStrength must be a finite non-negative number')
  }
  if (
    !Number.isFinite(resolved.globalCompressionFatigue) ||
    resolved.globalCompressionFatigue < 0
  ) {
    throw new Error(
      'globalCompressionFatigue must be a finite non-negative number',
    )
  }
  if (
    !Number.isFinite(resolved.crackContinuation) ||
    resolved.crackContinuation < 0
  ) {
    throw new Error('crackContinuation must be a finite non-negative number')
  }
  if (
    !Number.isFinite(resolved.normalCutoff) ||
    resolved.normalCutoff < -1 ||
    resolved.normalCutoff >= 1
  ) {
    throw new Error('normalCutoff must be at least -1 and less than 1')
  }
  if (resolved.detachBrokenRatio < resolved.peelBrokenRatio) {
    throw new Error('detachBrokenRatio cannot be less than peelBrokenRatio')
  }
  if (
    !Number.isFinite(resolved.minimumPeelSeconds) ||
    resolved.minimumPeelSeconds < 0
  ) {
    throw new Error(
      'minimumPeelSeconds must be a finite non-negative number',
    )
  }
  if (
    !Number.isFinite(resolved.settleCandidateSeconds) ||
    resolved.settleCandidateSeconds < 0
  ) {
    throw new Error(
      'settleCandidateSeconds must be a finite non-negative number',
    )
  }

  return resolved
}

/**
 * Validates and compiles a fragment graph into cache-friendly arrays.
 * Surface geodesics are calculated once, so runtime loads cannot jump through
 * a thin object to a spatially close fragment on the opposite face.
 */
export function createFractureModel(
  graph: FractureGraph,
  options: FractureOptions = {},
): FractureModel {
  const fragmentCount = graph.fragments.length
  const bondCount = graph.bonds.length

  if (fragmentCount === 0) {
    throw new Error('A fracture graph requires at least one fragment')
  }
  if (fragmentCount > 0xffffffff) {
    throw new Error('A fracture graph cannot exceed 4,294,967,295 fragments')
  }

  const fragmentIndexById = new Map<FractureId, number>()
  const fragmentIds = graph.fragments.map((fragment) => fragment.id)
  const centroids = new Float32Array(fragmentCount * 3)
  const normals = new Float32Array(fragmentCount * 3)

  for (let index = 0; index < fragmentCount; index += 1) {
    const fragment = graph.fragments[index]
    if (fragmentIndexById.has(fragment.id)) {
      throw new Error(`Duplicate fragment ID: ${String(fragment.id)}`)
    }
    fragmentIndexById.set(fragment.id, index)
    fragmentIds[index] = fragment.id

    const offset = index * 3
    for (let axis = 0; axis < 3; axis += 1) {
      const coordinate = fragment.centroid[axis]
      if (!Number.isFinite(coordinate)) {
        throw new Error(`Fragment ${String(fragment.id)} has an invalid centroid`)
      }
      centroids[offset + axis] = coordinate
    }

    const normalLength = vectorLength(
      fragment.normal[0],
      fragment.normal[1],
      fragment.normal[2],
    )
    if (!Number.isFinite(normalLength) || normalLength <= EPSILON) {
      throw new Error(`Fragment ${String(fragment.id)} has an invalid normal`)
    }
    normals[offset] = fragment.normal[0] / normalLength
    normals[offset + 1] = fragment.normal[1] / normalLength
    normals[offset + 2] = fragment.normal[2] / normalLength
  }

  const bondIds = graph.bonds.map((bond) => bond.id)
  const bondIdSet = new Set<FractureId>()
  const bondFragmentA = chooseIndexArray(bondCount, fragmentCount - 1)
  const bondFragmentB = chooseIndexArray(bondCount, fragmentCount - 1)
  const bondLength = new Float32Array(bondCount)
  const bondToughness = new Float32Array(bondCount)
  const incidentCounts = new Uint32Array(fragmentCount)
  let totalBondLength = 0

  for (let index = 0; index < bondCount; index += 1) {
    const bond = graph.bonds[index]
    if (bondIdSet.has(bond.id)) {
      throw new Error(`Duplicate bond ID: ${String(bond.id)}`)
    }
    bondIdSet.add(bond.id)
    bondIds[index] = bond.id

    const fragmentA = fragmentIndexById.get(bond.fragmentA)
    const fragmentB = fragmentIndexById.get(bond.fragmentB)
    if (fragmentA === undefined || fragmentB === undefined) {
      throw new Error(`Bond ${String(bond.id)} references an unknown fragment`)
    }
    if (fragmentA === fragmentB) {
      throw new Error(`Bond ${String(bond.id)} cannot join a fragment to itself`)
    }
    assertFinitePositive(bond.length, `Bond ${String(bond.id)} length`)
    assertFinitePositive(bond.toughness, `Bond ${String(bond.id)} toughness`)

    bondFragmentA[index] = fragmentA
    bondFragmentB[index] = fragmentB
    bondLength[index] = bond.length
    bondToughness[index] = bond.toughness
    incidentCounts[fragmentA] += 1
    incidentCounts[fragmentB] += 1
    totalBondLength += bond.length
  }

  if (fragmentCount > 1) {
    for (let index = 0; index < fragmentCount; index += 1) {
      if (incidentCounts[index] === 0) {
        throw new Error(
          `Fragment ${String(fragmentIds[index])} has no incident bonds`,
        )
      }
    }
  }

  const incidentStarts = new Uint32Array(fragmentCount + 1)
  for (let index = 0; index < fragmentCount; index += 1) {
    incidentStarts[index + 1] =
      incidentStarts[index] + incidentCounts[index]
  }
  const incidentBonds = chooseIndexArray(bondCount * 2, bondCount - 1)
  const incidentCursors = incidentStarts.slice(0, fragmentCount)
  for (let bondIndex = 0; bondIndex < bondCount; bondIndex += 1) {
    const fragmentA = bondFragmentA[bondIndex]
    const fragmentB = bondFragmentB[bondIndex]
    incidentBonds[incidentCursors[fragmentA]] = bondIndex
    incidentCursors[fragmentA] += 1
    incidentBonds[incidentCursors[fragmentB]] = bondIndex
    incidentCursors[fragmentB] += 1
  }

  const geodesicDistances = new Float32Array(fragmentCount * fragmentCount)
  geodesicDistances.fill(Number.POSITIVE_INFINITY)
  for (let index = 0; index < fragmentCount; index += 1) {
    geodesicDistances[index * fragmentCount + index] = 0
  }

  let totalCenterDistance = 0
  for (let bondIndex = 0; bondIndex < bondCount; bondIndex += 1) {
    const fragmentA = bondFragmentA[bondIndex]
    const fragmentB = bondFragmentB[bondIndex]
    const offsetA = fragmentA * 3
    const offsetB = fragmentB * 3
    const centerDistance = vectorLength(
      centroids[offsetA] - centroids[offsetB],
      centroids[offsetA + 1] - centroids[offsetB + 1],
      centroids[offsetA + 2] - centroids[offsetB + 2],
    )
    const distance =
      centerDistance > EPSILON ? centerDistance : bondLength[bondIndex]
    const forward = fragmentA * fragmentCount + fragmentB
    const reverse = fragmentB * fragmentCount + fragmentA
    geodesicDistances[forward] = Math.min(
      geodesicDistances[forward],
      distance,
    )
    geodesicDistances[reverse] = Math.min(
      geodesicDistances[reverse],
      distance,
    )
    totalCenterDistance += distance
  }

  // Floyd-Warshall is inexpensive for the intended 128-plate shell and turns
  // every runtime press into a linear scan with no queue allocations.
  for (let via = 0; via < fragmentCount; via += 1) {
    const viaRow = via * fragmentCount
    for (let from = 0; from < fragmentCount; from += 1) {
      const fromRow = from * fragmentCount
      const distanceToVia = geodesicDistances[fromRow + via]
      if (!Number.isFinite(distanceToVia)) continue

      for (let to = 0; to < fragmentCount; to += 1) {
        const candidate =
          distanceToVia + geodesicDistances[viaRow + to]
        const offset = fromRow + to
        if (candidate < geodesicDistances[offset]) {
          geodesicDistances[offset] = candidate
        }
      }
    }
  }

  const meanCenterDistance =
    bondCount > 0 ? totalCenterDistance / bondCount : 1
  const meanBondLength = bondCount > 0 ? totalBondLength / bondCount : 1
  const resolvedOptions = resolveOptions(
    options,
    Math.max(meanCenterDistance * 3.25, EPSILON),
  )

  return {
    fragmentCount,
    bondCount,
    fragmentIds,
    bondIds,
    centroids,
    normals,
    bondFragmentA,
    bondFragmentB,
    bondLength,
    bondToughness,
    incidentStarts,
    incidentBonds,
    geodesicDistances,
    meanBondLength,
    options: resolvedOptions,
    fragmentIndexById,
  }
}

export function createFractureState(model: FractureModel): FractureState {
  return {
    bondDamage: new Float32Array(model.bondCount),
    bondBroken: new Uint8Array(model.bondCount),
    fragmentState: new Uint8Array(model.fragmentCount),
    fragmentLoad: new Float32Array(model.fragmentCount),
    fragmentBrokenBonds: chooseIndexArray(
      model.fragmentCount,
      model.bondCount,
    ),
    fragmentPeelAge: new Float32Array(model.fragmentCount),
    fragmentDetachAge: new Float32Array(model.fragmentCount),
    fragmentSettleCandidate: new Uint8Array(model.fragmentCount),
    events: [],
    elapsedSeconds: 0,
    accumulatorSeconds: 0,
    stepCount: 0,
    lastSubstepCount: 0,
    brokenBondCount: 0,
    attachedFragmentCount: model.fragmentCount,
    completed: false,
  }
}

export function resetFractureState(state: FractureState) {
  state.bondDamage.fill(0)
  state.bondBroken.fill(0)
  state.fragmentState.fill(FRAGMENT_STATE.ATTACHED)
  state.fragmentLoad.fill(0)
  state.fragmentBrokenBonds.fill(0)
  state.fragmentPeelAge.fill(0)
  state.fragmentDetachAge.fill(0)
  state.fragmentSettleCandidate.fill(0)
  state.events.length = 0
  state.elapsedSeconds = 0
  state.accumulatorSeconds = 0
  state.stepCount = 0
  state.lastSubstepCount = 0
  state.brokenBondCount = 0
  state.attachedFragmentCount = state.fragmentState.length
  state.completed = false
  return state
}

function findPressFragment(model: FractureModel, press: FracturePress) {
  if (
    press.fragmentIndex !== undefined &&
    Number.isInteger(press.fragmentIndex) &&
    press.fragmentIndex >= 0 &&
    press.fragmentIndex < model.fragmentCount
  ) {
    return press.fragmentIndex
  }

  if (press.fragmentId !== undefined) {
    const index = model.fragmentIndexById.get(press.fragmentId)
    if (index !== undefined) return index
  }

  let closestIndex = 0
  let closestDistanceSquared = Number.POSITIVE_INFINITY
  for (let index = 0; index < model.fragmentCount; index += 1) {
    const offset = index * 3
    const deltaX = press.localPoint[0] - model.centroids[offset]
    const deltaY = press.localPoint[1] - model.centroids[offset + 1]
    const deltaZ = press.localPoint[2] - model.centroids[offset + 2]
    const distanceSquared =
      deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ
    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared
      closestIndex = index
    }
  }
  return closestIndex
}

function accumulatePressLoads(
  model: FractureModel,
  state: FractureState,
  presses: readonly FracturePress[],
) {
  const {
    holdRampSeconds,
    holdStrength,
    normalCutoff,
    propagationRadius,
  } = model.options

  state.fragmentLoad.fill(0)
  let combinedPressStrength = 0

  for (let pressIndex = 0; pressIndex < presses.length; pressIndex += 1) {
    const press = presses[pressIndex]
    const pressure = clamp(press.pressure, 0, 1)
    if (pressure <= EPSILON) continue

    const normalLength = vectorLength(
      press.localNormal[0],
      press.localNormal[1],
      press.localNormal[2],
    )
    if (!Number.isFinite(normalLength) || normalLength <= EPSILON) continue

    const normalX = press.localNormal[0] / normalLength
    const normalY = press.localNormal[1] / normalLength
    const normalZ = press.localNormal[2] / normalLength
    const sourceIndex = findPressFragment(model, press)
    const distanceRow = sourceIndex * model.fragmentCount
    const holdProgress = clamp(
      press.durationSeconds / holdRampSeconds,
      0,
      1,
    )
    const pressStrength = pressure * (1 + holdProgress * holdStrength)
    combinedPressStrength += pressStrength

    for (
      let fragmentIndex = 0;
      fragmentIndex < model.fragmentCount;
      fragmentIndex += 1
    ) {
      const distance =
        model.geodesicDistances[distanceRow + fragmentIndex]
      if (distance > propagationRadius) continue

      const fragmentOffset = fragmentIndex * 3
      const normalDot =
        normalX * model.normals[fragmentOffset] +
        normalY * model.normals[fragmentOffset + 1] +
        normalZ * model.normals[fragmentOffset + 2]
      const normalWeight = clamp(
        (normalDot - normalCutoff) / (1 - normalCutoff),
        0,
        1,
      )
      if (normalWeight <= EPSILON) continue

      const normalizedDistance = distance / propagationRadius
      const radial = Math.max(
        0,
        1 - normalizedDistance * normalizedDistance,
      )
      const falloff = radial * radial
      state.fragmentLoad[fragmentIndex] +=
        pressStrength * falloff * normalWeight
    }
  }

  // Bound multi-touch compression without erasing the extra force of a second
  // thumb. This scalar is intentionally separate from directional/geodesic
  // load so a small configured fraction can fatigue the complete shell.
  return Math.min(2, combinedPressStrength)
}

function countBrokenNeighbors(
  model: FractureModel,
  state: FractureState,
  fragmentIndex: number,
) {
  let count = 0
  const start = model.incidentStarts[fragmentIndex]
  const end = model.incidentStarts[fragmentIndex + 1]
  for (let cursor = start; cursor < end; cursor += 1) {
    count += state.bondBroken[model.incidentBonds[cursor]]
  }
  return count
}

function updateFragmentStates(
  model: FractureModel,
  state: FractureState,
  fixedDeltaSeconds: number,
) {
  for (
    let fragmentIndex = 0;
    fragmentIndex < model.fragmentCount;
    fragmentIndex += 1
  ) {
    const currentState = state.fragmentState[fragmentIndex] as FragmentState
    const bondCount =
      model.incidentStarts[fragmentIndex + 1] -
      model.incidentStarts[fragmentIndex]
    const brokenCount = state.fragmentBrokenBonds[fragmentIndex]
    const brokenRatio = bondCount > 0 ? brokenCount / bondCount : 0
    let nextState = currentState
    let eventType: FractureEvent['type'] | undefined

    if (
      currentState === FRAGMENT_STATE.ATTACHED &&
      brokenCount > 0
    ) {
      nextState = FRAGMENT_STATE.CRACKED
      eventType = 'fragment-crack'
      state.attachedFragmentCount -= 1
    } else if (
      currentState === FRAGMENT_STATE.CRACKED &&
      brokenRatio >= model.options.peelBrokenRatio
    ) {
      nextState = FRAGMENT_STATE.PEELING
      eventType = 'fragment-peel'
      state.fragmentPeelAge[fragmentIndex] = 0
    } else if (currentState === FRAGMENT_STATE.PEELING) {
      if (state.fragmentLoad[fragmentIndex] > EPSILON) {
        state.fragmentPeelAge[fragmentIndex] += fixedDeltaSeconds
      }
      if (
        brokenRatio >= model.options.detachBrokenRatio &&
        state.fragmentPeelAge[fragmentIndex] + EPSILON >=
          model.options.minimumPeelSeconds
      ) {
        nextState = FRAGMENT_STATE.DETACHED
        eventType = 'fragment-detach'
        state.fragmentDetachAge[fragmentIndex] = 0
      }
    } else if (currentState === FRAGMENT_STATE.DETACHED) {
      const detachAge =
        state.fragmentDetachAge[fragmentIndex] + fixedDeltaSeconds
      state.fragmentDetachAge[fragmentIndex] = detachAge
      if (
        state.fragmentSettleCandidate[fragmentIndex] === 0 &&
        detachAge >= model.options.settleCandidateSeconds
      ) {
        state.fragmentSettleCandidate[fragmentIndex] = 1
        state.events.push({
          type: 'fragment-settle-candidate',
          fragmentIndex,
          fragmentId: model.fragmentIds[fragmentIndex],
        })
      }
    }

    if (nextState !== currentState) {
      state.fragmentState[fragmentIndex] = nextState
      state.events.push({
        type: eventType as
          | 'fragment-crack'
          | 'fragment-peel'
          | 'fragment-detach',
        fragmentIndex,
        fragmentId: model.fragmentIds[fragmentIndex],
      })
    }
  }

  if (
    !state.completed &&
    state.brokenBondCount > 0 &&
    state.attachedFragmentCount === 0
  ) {
    state.completed = true
    state.events.push({
      type: 'complete',
      elapsedSeconds: state.elapsedSeconds,
      brokenBondCount: state.brokenBondCount,
    })
  }
}

function runFixedStep(
  model: FractureModel,
  state: FractureState,
  presses: readonly FracturePress[],
) {
  const fixedDeltaSeconds = model.options.fixedDeltaSeconds
  const combinedPressStrength = accumulatePressLoads(model, state, presses)
  const globalCompressionLoad =
    combinedPressStrength * model.options.globalCompressionFatigue

  for (let bondIndex = 0; bondIndex < model.bondCount; bondIndex += 1) {
    if (state.bondBroken[bondIndex] !== 0) continue

    const fragmentA = model.bondFragmentA[bondIndex]
    const fragmentB = model.bondFragmentB[bondIndex]
    const load =
      Math.max(
        state.fragmentLoad[fragmentA],
        state.fragmentLoad[fragmentB],
      ) + globalCompressionLoad
    if (load <= EPSILON) continue

    const brokenNeighbors =
      countBrokenNeighbors(model, state, fragmentA) +
      countBrokenNeighbors(model, state, fragmentB)
    const continuationMultiplier =
      1 +
      model.options.crackContinuation *
        Math.min(3, brokenNeighbors)
    const lengthMultiplier = clamp(
      Math.sqrt(model.bondLength[bondIndex] / model.meanBondLength),
      0.5,
      1.5,
    )
    const damageIncrement =
      load *
      model.options.damagePerSecond *
      fixedDeltaSeconds *
      continuationMultiplier *
      lengthMultiplier
    const nextDamage =
      state.bondDamage[bondIndex] + damageIncrement
    state.bondDamage[bondIndex] = nextDamage

    if (nextDamage >= model.bondToughness[bondIndex]) {
      state.bondBroken[bondIndex] = 1
      state.brokenBondCount += 1
      state.fragmentBrokenBonds[fragmentA] += 1
      state.fragmentBrokenBonds[fragmentB] += 1
      state.events.push({
        type: 'bond-break',
        bondIndex,
        bondId: model.bondIds[bondIndex],
        fragmentA,
        fragmentB,
        energy:
          damageIncrement +
          Math.max(
            0,
            nextDamage - model.bondToughness[bondIndex],
          ),
      })
    }
  }

  state.elapsedSeconds += fixedDeltaSeconds
  state.stepCount += 1
  updateFragmentStates(model, state, fixedDeltaSeconds)
}

/**
 * Advances damage using a fixed timestep. At most maxSubsteps are processed;
 * excess wall-clock time is discarded to keep interaction work bounded.
 */
export function stepFracture(
  model: FractureModel,
  state: FractureState,
  presses: readonly FracturePress[],
  deltaSeconds: number,
) {
  state.events.length = 0
  state.lastSubstepCount = 0

  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    state.fragmentLoad.fill(0)
    return state
  }

  const fixedDeltaSeconds = model.options.fixedDeltaSeconds
  const acceptedDelta = Math.min(
    deltaSeconds,
    fixedDeltaSeconds * model.options.maxSubsteps,
  )
  state.accumulatorSeconds += acceptedDelta

  while (
    state.accumulatorSeconds + EPSILON >= fixedDeltaSeconds &&
    state.lastSubstepCount < model.options.maxSubsteps
  ) {
    runFixedStep(model, state, presses)
    state.accumulatorSeconds -= fixedDeltaSeconds
    state.lastSubstepCount += 1
  }

  if (
    state.lastSubstepCount === model.options.maxSubsteps &&
    state.accumulatorSeconds >= fixedDeltaSeconds
  ) {
    state.accumulatorSeconds %= fixedDeltaSeconds
  }

  return state
}

/**
 * Physics owns the final sleeping decision. This function commits those
 * candidates to the terminal state without changing any fracture damage.
 */
export function markFragmentsSettled(
  model: FractureModel,
  state: FractureState,
  fragmentIndices: ArrayLike<number>,
) {
  for (let cursor = 0; cursor < fragmentIndices.length; cursor += 1) {
    const fragmentIndex = fragmentIndices[cursor]
    if (
      !Number.isInteger(fragmentIndex) ||
      fragmentIndex < 0 ||
      fragmentIndex >= model.fragmentCount ||
      state.fragmentState[fragmentIndex] !== FRAGMENT_STATE.DETACHED ||
      state.fragmentSettleCandidate[fragmentIndex] === 0
    ) {
      continue
    }

    state.fragmentState[fragmentIndex] = FRAGMENT_STATE.SETTLED
    state.events.push({
      type: 'fragment-settle',
      fragmentIndex,
      fragmentId: model.fragmentIds[fragmentIndex],
    })
  }
  return state
}
