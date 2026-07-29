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
  normalBulge: number
  gravitySag: number
  maximumDisplacement: number
}>

export const CHOCOLATE_SLIME_DEFORMATION = Object.freeze({
  pressRadius: 0.95,
  spreadRadius: 1.65,
  depth: 0.42,
  tangentSpread: 0.34,
  normalBulge: 0.14,
  gravitySag: 0.12,
  maximumDisplacement: 0.48,
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
      const annulus = Math.max(
        0,
        spreadFalloff - core,
      )
      const outward = profile.normalBulge * amount * annulus
      displacementX -= normalX * inward
      displacementY -= normalY * inward
      displacementZ -= normalZ * inward
      displacementX += normalX * outward
      displacementY += normalY * outward
      displacementZ += normalZ * outward
      displacementY -=
        profile.gravitySag *
        amount *
        spreadFalloff *
        (0.35 + annulus * 0.65)

      const normalDistance =
        deltaX * impactNormalX +
        deltaY * impactNormalY +
        deltaZ * impactNormalZ
      const tangentX = deltaX - impactNormalX * normalDistance
      const tangentY = deltaY - impactNormalY * normalDistance
      const tangentZ = deltaZ - impactNormalZ * normalDistance
      const tangentLength = Math.hypot(tangentX, tangentY, tangentZ)
      if (tangentLength > 1e-5) {
        const tangentDisplacement =
          annulus * profile.tangentSpread * amount
        displacementX +=
          (tangentX / tangentLength) * tangentDisplacement
        displacementY +=
          (tangentY / tangentLength) * tangentDisplacement
        displacementZ +=
          (tangentZ / tangentLength) * tangentDisplacement
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
