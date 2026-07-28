import type { FragmentFadePolicyOptions } from '../fracture/fragmentFade'
import type { DebrisVector3 } from '../fracture/RapierDebris'

export const SOAP_DEBRIS_BODY_LIMIT = 24
export const SOAP_DEBRIS_MAX_CLUSTER_SIZE = 4
export const SOAP_DEBRIS_FLOOR_CLEARANCE = 0.2
export const SOAP_DEBRIS_FADE_POLICY = Object.freeze({
  maximumSimulationSeconds: 2.75,
  sleepFadeDelaySeconds: 0.12,
  fadeDurationSeconds: 0.45,
} satisfies FragmentFadePolicyOptions)

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

export function createSoapDebrisLaunch(
  seed: number,
  normal: DebrisVector3,
) {
  const mixedSeed = hashUint32(seed)
  const lateralX = signedNoise(mixedSeed ^ 0x68bc21eb)
  const lateralZ = signedNoise(mixedSeed ^ 0x967a889b)
  const angularX = signedNoise(mixedSeed ^ 0x02e5be93)
  const angularY = signedNoise(mixedSeed ^ 0xa341316c)
  const angularZ = signedNoise(mixedSeed ^ 0xc8013ea4)

  return {
    linearVelocity: [
      normal[0] * 0.08 + lateralX * 0.025,
      -0.22 + Math.min(0.04, normal[1] * 0.04),
      normal[2] * 0.1 + lateralZ * 0.025,
    ] as DebrisVector3,
    angularVelocity: [
      angularX * 0.16,
      angularY * 0.14,
      angularZ * 0.12,
    ] as DebrisVector3,
    gravityScale: 1.1,
  } as const
}
