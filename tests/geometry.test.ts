import { describe, expect, it } from 'vitest'
import { BUTTER_SIZE } from '../src/scene/constants'
import { createRoundedCuboidGeometry } from '../src/scene/createRoundedCuboidGeometry'

describe('rounded cuboid geometry', () => {
  it('matches the planned bounds and triangle budget', () => {
    const geometry = createRoundedCuboidGeometry()
    const index = geometry.getIndex()

    expect(index).not.toBeNull()
    expect(index!.count / 3).toBe(9856)
    expect(geometry.boundingBox).not.toBeNull()
    expect(geometry.boundingBox!.max.x - geometry.boundingBox!.min.x).toBeCloseTo(
      BUTTER_SIZE.width,
      4,
    )
    expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeCloseTo(
      BUTTER_SIZE.height,
      4,
    )
    expect(geometry.boundingBox!.max.z - geometry.boundingBox!.min.z).toBeCloseTo(
      BUTTER_SIZE.depth,
      4,
    )

    geometry.dispose()
  })

  it('contains finite positions and normalized smooth normals', () => {
    const geometry = createRoundedCuboidGeometry()
    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')

    for (let index = 0; index < positions.count; index += 1) {
      const values = [
        positions.getX(index),
        positions.getY(index),
        positions.getZ(index),
        normals.getX(index),
        normals.getY(index),
        normals.getZ(index),
      ]
      expect(values.every(Number.isFinite)).toBe(true)
      expect(
        Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index)),
      ).toBeCloseTo(1, 3)
    }

    geometry.dispose()
  })
})
