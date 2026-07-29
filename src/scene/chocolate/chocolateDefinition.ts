import type { DebrisVector3 } from '../fracture/RapierDebris'
import { WAX_SEAM_PROFILE, type WaxBond } from '../fracture/types'
import type {
  FracturableDefinition,
  FracturableSquishyConfig,
} from '../SoapSquishy'
import {
  CHOCOLATE_CORNER_RADIUS,
  CHOCOLATE_SEGMENTS,
  CHOCOLATE_SIZE,
  createChocolateShellGeometry,
  createChocolateSlimeGeometry,
  isChocolateGutter,
} from './chocolateGeometry'
import { createSlimeDisplacementSampler } from './slimeDeformation'

export const CHOCOLATE_ID = 'chocolate'
export const CHOCOLATE_OUTER_OFFSET = 0.052
export const CHOCOLATE_DEBRIS_BODY_LIMIT = 24
export const CHOCOLATE_DEBRIS_FLOOR_Y = -2.35

function hashUint32(value: number) {
  let hash = value >>> 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

function signedNoise(seed: number) {
  return (hashUint32(seed) / 0xffffffff) * 2 - 1
}

export function createChocolateDebrisLaunch(
  seed: number,
  normal: DebrisVector3,
) {
  const mixed = hashUint32(seed)
  return {
    linearVelocity: [
      normal[0] * 0.12 + signedNoise(mixed ^ 0x51ed270b) * 0.04,
      -0.18,
      normal[2] * 0.16 + 0.04,
    ] as DebrisVector3,
    angularVelocity: [
      signedNoise(mixed ^ 0x68bc21eb) * 0.28,
      signedNoise(mixed ^ 0x02e5be93) * 0.24,
      signedNoise(mixed ^ 0xc8013ea4) * 0.2,
    ] as DebrisVector3,
    gravityScale: 1.18,
  } as const
}

function chocolateBondToughnessScale(bond: WaxBond) {
  return isChocolateGutter(
    bond.midpoint[0],
    bond.midpoint[1],
    bond.midpoint[2],
  )
    ? 0.78
    : 1
}

export const CHOCOLATE_DEFINITION = Object.freeze({
  id: CHOCOLATE_ID,
  name: 'Chocolate slime',
  seedSalt: 0x7a6f11d3,
  geometry: Object.freeze({
    size: CHOCOLATE_SIZE,
    cornerRadius: CHOCOLATE_CORNER_RADIUS,
    segments: CHOCOLATE_SEGMENTS,
    createSourceGeometry: createChocolateSlimeGeometry,
  }),
  deformation: Object.freeze({
    behavior: 'gooey',
    dentRadius: 0.85,
    dentDepth: 0.26,
    maximumDentDepth: 0.3,
    compression: 0.035,
    spring: Object.freeze({
      stiffness: 72,
      damping: 13,
    }),
  }),
  style: Object.freeze({
    finish: 'translucent-gel',
    bodyColor: '#a9ef75',
    accentPalette: Object.freeze(['#d6ffad', '#79cf49']),
    roughness: 0.28,
    metalness: 0,
    clearcoat: 0.65,
    transmission: 0.12,
    sheen: 0.14,
  }),
} satisfies FracturableDefinition)

export const CHOCOLATE_RUNTIME_CONFIG = Object.freeze({
  plateCount: 72,
  innerClearance: 0.012,
  outerOffset: CHOCOLATE_OUTER_OFFSET,
  seamProfile: WAX_SEAM_PROFILE.standard,
  maximumActiveImpacts: 6,
  maximumClusterSize: 3,
  releasedImpactTarget: 0.18,
  fadePolicy: Object.freeze({
    maximumSimulationSeconds: 2.9,
    sleepFadeDelaySeconds: 0.14,
    fadeDurationSeconds: 0.52,
  }),
  fractureOptions: Object.freeze({
    propagationRadius: 0.72,
    damagePerSecond: 5.2,
    holdRampSeconds: 0.2,
    holdStrength: 0.86,
    crackContinuation: 0.3,
    globalCompressionFatigue: 0.01,
    tipStressTransfer: 0.5,
    tipStressDecay: 0.8,
    maxTipBranches: 2,
    peelBrokenRatio: 0.78,
    detachBrokenRatio: 0.93,
    minimumPeelSeconds: 0.24,
    settleCandidateSeconds: 0.18,
  }),
  waxPalette: Object.freeze({
    surfaceColor: '#3a160f',
    attenuationColor: '#24100c',
  }),
  waxMaterial: Object.freeze({
    attenuationDistance: 0.32,
    clearcoat: 0.65,
    clearcoatRoughness: 0.16,
    ior: 1.48,
    metalness: 0,
    opacity: 1,
    roughness: 0.22,
    sheen: 0.04,
    specularIntensity: 0.9,
    thickness: CHOCOLATE_OUTER_OFFSET,
    transmission: 0,
    transparent: false,
  }),
  createShellGeometry: createChocolateShellGeometry,
  displacementSampler: createSlimeDisplacementSampler(),
  bondToughnessScale: chocolateBondToughnessScale,
  createDebrisLaunch: createChocolateDebrisLaunch,
} satisfies FracturableSquishyConfig)
