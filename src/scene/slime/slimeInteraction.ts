import * as THREE from 'three'

export const SLIME_MAX_INTERACTIONS = 48
export const SLIME_MAX_GROWTH = 0.55
export const SLIME_MAX_RADIAL_SPREAD = 0.18
export const SLIME_DENT_RADIUS = 0.62
export const SLIME_DENT_DEPTH = 0.16
export const SLIME_MAX_DENT_DEPTH = 0.34
export const SLIME_TRANSIENT_DENT_DEPTH = 0.08

const GROWTH_DECAY = SLIME_MAX_INTERACTIONS / 3
const LOCAL_MIX_RADIUS = 1.28
const LOCAL_MIX_AGE = 8
const LOCAL_MIX_FLOOR = 0.25
const GLOBAL_MIX_CONTRIBUTION = 0.6
const UINT32_MAX = 0xffffffff

export type SlimeInteractionResult = Readonly<{
  changedPermanently: boolean
  becameSaturated: boolean
  interactionCount: number
}>

export type SlimeInteractionRuntime = {
  interactionCount: number
  readonly impactCoordinates: Float32Array
}

export type SlimeTransientPresses = Readonly<{
  coordinates: Float32Array
  strengths: Float32Array
}>

export function createSlimeInteractionRuntime(): SlimeInteractionRuntime {
  return {
    interactionCount: 0,
    impactCoordinates: new Float32Array(SLIME_MAX_INTERACTIONS * 2),
  }
}

export function resetSlimeInteractionRuntime(runtime: SlimeInteractionRuntime) {
  runtime.interactionCount = 0
  runtime.impactCoordinates.fill(0)
  return runtime
}

export function getSlimeGrowthProgress(interactionCount: number) {
  const count = THREE.MathUtils.clamp(
    interactionCount,
    0,
    SLIME_MAX_INTERACTIONS,
  )
  const numerator = 1 - Math.exp(-count / GROWTH_DECAY)
  const denominator =
    1 - Math.exp(-SLIME_MAX_INTERACTIONS / GROWTH_DECAY)
  return numerator / denominator
}

export function getSlimeMixProgress(interactionCount: number) {
  return THREE.MathUtils.clamp(
    interactionCount / SLIME_MAX_INTERACTIONS,
    0,
    1,
  )
}

export function applySlimeInteraction(
  runtime: SlimeInteractionRuntime,
  localX: number,
  localZ: number,
): SlimeInteractionResult {
  if (
    !Number.isFinite(localX) ||
    !Number.isFinite(localZ) ||
    runtime.interactionCount >= SLIME_MAX_INTERACTIONS
  ) {
    return {
      changedPermanently: false,
      becameSaturated: false,
      interactionCount: runtime.interactionCount,
    }
  }

  const index = runtime.interactionCount
  const offset = index * 2
  runtime.impactCoordinates[offset] = localX
  runtime.impactCoordinates[offset + 1] = localZ
  runtime.interactionCount += 1
  return {
    changedPermanently: true,
    becameSaturated: runtime.interactionCount === SLIME_MAX_INTERACTIONS,
    interactionCount: runtime.interactionCount,
  }
}

function smoothWeight(distance: number, radius: number) {
  if (distance >= radius) {
    return 0
  }
  const t = Math.max(0, 1 - distance / radius)
  return t * t * (3 - 2 * t)
}

function smoothStep(minimum: number, maximum: number, value: number) {
  const t = THREE.MathUtils.clamp(
    (value - minimum) / Math.max(1e-6, maximum - minimum),
    0,
    1,
  )
  return t * t * (3 - 2 * t)
}

export function sampleSlimeDisplacement(
  x: number,
  y: number,
  z: number,
  rimY: number,
  crownY: number,
  radius: number,
  runtime: SlimeInteractionRuntime,
  impactStrengths: Float32Array | null,
  displayedInteractionCount: number,
  transientPresses: SlimeTransientPresses | null,
  output: { x: number; y: number; z: number },
) {
  const topWeight = smoothStep(rimY - 0.14, crownY, y)
  const radialDistance = Math.hypot(x, z)
  const normalizedRadius = THREE.MathUtils.clamp(
    radialDistance / radius,
    0,
    1,
  )
  const growth = getSlimeGrowthProgress(displayedInteractionCount)
  const crownWeight = 0.34 + 0.66 * (1 - normalizedRadius ** 1.65)
  let displacementY = topWeight * SLIME_MAX_GROWTH * growth * crownWeight
  let radialDisplacement =
    topWeight *
    SLIME_MAX_RADIAL_SPREAD *
    growth *
    smoothStep(0.52, 0.98, normalizedRadius)

  let permanentDent = 0
  for (let index = 0; index < runtime.interactionCount; index += 1) {
    const offset = index * 2
    const distance = Math.hypot(
      x - runtime.impactCoordinates[offset],
      z - runtime.impactCoordinates[offset + 1],
    )
    const strength = impactStrengths?.[index] ?? 1
    permanentDent +=
      SLIME_DENT_DEPTH *
      strength *
      smoothWeight(distance, SLIME_DENT_RADIUS) *
      topWeight
  }
  displacementY -= Math.min(SLIME_MAX_DENT_DEPTH, permanentDent)

  if (transientPresses) {
    for (let index = 0; index < transientPresses.strengths.length; index += 1) {
      const strength = transientPresses.strengths[index]
      if (strength <= 0.001) {
        continue
      }
      const offset = index * 2
      const distance = Math.hypot(
        x - transientPresses.coordinates[offset],
        z - transientPresses.coordinates[offset + 1],
      )
      displacementY -=
        SLIME_TRANSIENT_DENT_DEPTH *
        strength *
        smoothWeight(distance, SLIME_DENT_RADIUS * 0.9) *
        topWeight
    }
  }

  if (radialDistance <= 1e-6) {
    radialDisplacement = 0
  }
  const inverseRadius = radialDistance > 1e-6 ? 1 / radialDistance : 0
  output.x = x * inverseRadius * radialDisplacement
  output.y = displacementY
  output.z = z * inverseRadius * radialDisplacement
}

function srgbChannelToLinear(channel: number) {
  const value = channel / 255
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4
}

const PINK = Object.freeze([
  1,
  srgbChannelToLinear(79),
  srgbChannelToLinear(155),
] as const)
const ORANGE = Object.freeze([
  1,
  srgbChannelToLinear(154),
  srgbChannelToLinear(69),
] as const)
const CORAL = Object.freeze([
  1,
  srgbChannelToLinear(111),
  srgbChannelToLinear(115),
] as const)

export function sampleSlimeColor(
  x: number,
  y: number,
  z: number,
  runtime: SlimeInteractionRuntime,
  displayedInteractionCount: number,
  output: { r: number; g: number; b: number },
) {
  const boundary = x + Math.sin(y * 2.15 + z * 0.9) * 0.17
  const pinkWeight = smoothStep(-0.16, 0.16, boundary)
  const mixProgress = getSlimeMixProgress(displayedInteractionCount)
  const localMixCeiling = THREE.MathUtils.lerp(
    LOCAL_MIX_FLOOR,
    1,
    mixProgress,
  )
  let mixAmount = mixProgress * GLOBAL_MIX_CONTRIBUTION

  for (let index = 0; index < runtime.interactionCount; index += 1) {
    const offset = index * 2
    const distance = Math.hypot(
      x - runtime.impactCoordinates[offset],
      z - runtime.impactCoordinates[offset + 1],
    )
    const impactAge = displayedInteractionCount - index
    if (impactAge <= 0) {
      continue
    }
    mixAmount = Math.max(
      mixAmount,
      smoothWeight(distance, LOCAL_MIX_RADIUS) *
        Math.min(1, impactAge / LOCAL_MIX_AGE) *
        localMixCeiling,
    )
  }

  if (displayedInteractionCount >= SLIME_MAX_INTERACTIONS) {
    mixAmount = 1
  } else {
    mixAmount = THREE.MathUtils.clamp(mixAmount, 0, 0.96)
  }

  const baseR = THREE.MathUtils.lerp(ORANGE[0], PINK[0], pinkWeight)
  const baseG = THREE.MathUtils.lerp(ORANGE[1], PINK[1], pinkWeight)
  const baseB = THREE.MathUtils.lerp(ORANGE[2], PINK[2], pinkWeight)
  output.r = THREE.MathUtils.lerp(baseR, CORAL[0], mixAmount)
  output.g = THREE.MathUtils.lerp(baseG, CORAL[1], mixAmount)
  output.b = THREE.MathUtils.lerp(baseB, CORAL[2], mixAmount)
}

export function mixSlimeSeed(seed: number, sequence: number) {
  let hash = (seed ^ Math.imul(sequence + 1, 0x9e3779b1)) >>> 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return (hash >>> 0) / UINT32_MAX
}
