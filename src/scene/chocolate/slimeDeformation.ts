import { smoothDentWeight } from '../deformation'
import type {
  MutableSurfaceDisplacement,
  SurfaceDisplacementSampler,
} from '../deformation'

export type SlimeDeformationProfile = Readonly<{
  pressRadius: number
  spreadRadius: number
  depth: number
  tangentSpread: number
  maximumDisplacement: number
}>

export const CHOCOLATE_SLIME_DEFORMATION = Object.freeze({
  pressRadius: 0.85,
  spreadRadius: 1.22,
  depth: 0.26,
  tangentSpread: 0.18,
  maximumDisplacement: 0.3,
} satisfies SlimeDeformationProfile)

export function createSlimeDisplacementSampler(
  profile: SlimeDeformationProfile = CHOCOLATE_SLIME_DEFORMATION,
): SurfaceDisplacementSampler {
  return (
    x,
    y,
    z,
    normalX,
    normalY,
    normalZ,
    impacts,
    output: MutableSurfaceDisplacement,
  ) => {
    let displacementX = 0
    let displacementY = 0
    let displacementZ = 0

    for (const impact of impacts) {
      const deltaX = x - impact.localPoint[0]
      const deltaY = y - impact.localPoint[1]
      const deltaZ = z - impact.localPoint[2]
      const distance = Math.hypot(deltaX, deltaY, deltaZ)
      if (distance >= profile.spreadRadius) {
        continue
      }

      const impactNormalX = impact.localNormal[0]
      const impactNormalY = impact.localNormal[1]
      const impactNormalZ = impact.localNormal[2]
      const alignment = Math.max(
        0,
        normalX * impactNormalX +
          normalY * impactNormalY +
          normalZ * impactNormalZ,
      )
      if (alignment <= 0.12) {
        continue
      }

      const amount = Math.max(0, impact.amount) * alignment * alignment
      const core = smoothDentWeight(distance, profile.pressRadius)
      const spreadFalloff = smoothDentWeight(
        distance,
        profile.spreadRadius,
      )
      const inward = profile.depth * amount * core
      displacementX -= normalX * inward
      displacementY -= normalY * inward
      displacementZ -= normalZ * inward

      const normalDistance =
        deltaX * impactNormalX +
        deltaY * impactNormalY +
        deltaZ * impactNormalZ
      const tangentX = deltaX - impactNormalX * normalDistance
      const tangentY = deltaY - impactNormalY * normalDistance
      const tangentZ = deltaZ - impactNormalZ * normalDistance
      const tangentLength = Math.hypot(tangentX, tangentY, tangentZ)
      if (tangentLength > 1e-5) {
        const annulus =
          Math.max(0, spreadFalloff - core * 0.45) *
          profile.tangentSpread *
          amount
        displacementX += (tangentX / tangentLength) * annulus
        displacementY += (tangentY / tangentLength) * annulus
        displacementZ += (tangentZ / tangentLength) * annulus
      }
    }

    const displacementLength = Math.hypot(
      displacementX,
      displacementY,
      displacementZ,
    )
    if (displacementLength > profile.maximumDisplacement) {
      const scale =
        profile.maximumDisplacement / displacementLength
      displacementX *= scale
      displacementY *= scale
      displacementZ *= scale
    }

    output.x = displacementX
    output.y = displacementY
    output.z = displacementZ
  }
}
