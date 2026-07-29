import { describe, expect, it } from 'vitest'
import {
  CHOCOLATE_RUNTIME_CONFIG,
  CHOCOLATE_SLIME_DEFORMATION,
  createChocolateSlimeGeometry,
  createSlimeDisplacementSampler,
} from '../src/scene/chocolate'
import {
  captureDeformationSource,
  makeImpactPermanent,
  type MutableSurfaceDisplacement,
  writeDisplacedPositions,
} from '../src/scene/deformation'
import type { DentImpact } from '../src/scene/types'

const sampler = createSlimeDisplacementSampler()
const impact: DentImpact = {
  id: 'press',
  localPoint: [0, 0, 0.32],
  localNormal: [0, 0, 1],
  amount: 1,
  velocity: 0,
}

function sample(
  x: number,
  y: number,
  z: number,
  normal: readonly [number, number, number] = [0, 0, 1],
  amount = 1,
) {
  const output: MutableSurfaceDisplacement = { x: 0, y: 0, z: 0 }
  sampler(
    x,
    y,
    z,
    normal[0],
    normal[1],
    normal[2],
    [{ ...impact, amount }],
    output,
  )
  return output
}

describe('chocolate slime displacement', () => {
  it('presses inward at contact and spreads outward around it', () => {
    const center = sample(0, 0, 0.32)
    const shoulder = sample(0.64, 0, 0.32)

    expect(center.z).toBeCloseTo(
      -CHOCOLATE_SLIME_DEFORMATION.depth,
      3,
    )
    expect(shoulder.x).toBeGreaterThan(0.01)
    expect(shoulder.y).toBeLessThan(0)
    expect(shoulder.z).toBeLessThan(0)
    expect(
      Math.hypot(shoulder.x, shoulder.y, shoulder.z),
    ).toBeLessThanOrEqual(
      CHOCOLATE_SLIME_DEFORMATION.maximumDisplacement,
    )
  })

  it('does not transfer a front press onto the opposite face', () => {
    expect(sample(0, 0, -0.32, [0, 0, -1])).toEqual({
      x: 0,
      y: 0,
      z: 0,
    })
  })

  it('creates an outward volume ridge beyond the pressed pocket', () => {
    const ridge = sample(1.12, 0, 0.32)
    expect(ridge.x).toBeGreaterThan(0)
    expect(ridge.y).toBeLessThan(0)
    expect(ridge.z).toBeGreaterThan(0)
  })

  it('carries sidewall vertices beyond the original body bounds', () => {
    const sidewall = sample(0, -1.79, 0.28, [0, -1, 0])
    expect(sidewall.y).toBeLessThan(-0.1)

    const geometry = createChocolateSlimeGeometry()
    geometry.computeBoundingBox()
    const originalMinimumY = geometry.boundingBox!.min.y
    const source = captureDeformationSource(geometry)
    writeDisplacedPositions(geometry, source, [impact], sampler)
    geometry.computeBoundingBox()

    expect(geometry.boundingBox!.min.y).toBeLessThan(
      originalMinimumY - 0.1,
    )
    geometry.dispose()
  })

  it('locks a released chocolate press into permanent deformation', () => {
    const plasticImpact: DentImpact = {
      ...impact,
      amount: 0.12,
      velocity: 2.4,
    }
    makeImpactPermanent(
      plasticImpact,
      CHOCOLATE_RUNTIME_CONFIG.minimumPermanentImpact!,
    )

    expect(plasticImpact.permanent).toBe(true)
    expect(plasticImpact.amount).toBe(
      CHOCOLATE_RUNTIME_CONFIG.minimumPermanentImpact,
    )
    expect(plasticImpact.velocity).toBe(0)
    const first = sample(
      0,
      0,
      0.32,
      [0, 0, 1],
      plasticImpact.amount,
    )
    const later = sample(
      0,
      0,
      0.32,
      [0, 0, 1],
      plasticImpact.amount,
    )
    expect(later).toEqual(first)
  })
})
