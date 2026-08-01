import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { describe, expect, it } from 'vitest'
import {
  SLIME_CONTAINER_BASE_Y,
  SLIME_CONTAINER_RADIUS,
  SLIME_CROWN_Y,
  SLIME_DRAW_CALL_BUDGET,
  SLIME_INNER_RADIUS,
  SLIME_TRIANGLE_BUDGET,
  countGeometryTriangles,
  createSlimeContainerGeometries,
  createSlimeGeometry,
  createSlimeLabelGeometry,
} from '../src/scene/slime'

describe('slime presentation geometry', () => {
  it('creates a finite, indexed, watertight slime volume', () => {
    const geometry = createSlimeGeometry()
    const positions = geometry.getAttribute('position')
    expect(geometry.getIndex()).not.toBeNull()
    expect(geometry.getAttribute('normal').count).toBe(positions.count)
    expect(geometry.getAttribute('color').count).toBe(positions.count)
    expect([...positions.array].every(Number.isFinite)).toBe(true)
    expect(countGeometryTriangles(geometry)).toBeLessThan(4_000)

    const positionOnly = geometry.clone()
    positionOnly.deleteAttribute('normal')
    positionOnly.deleteAttribute('uv')
    positionOnly.deleteAttribute('color')
    const welded = mergeVertices(positionOnly, 1e-5)
    const index = welded.getIndex()!
    const edgeCounts = new Map<string, number>()
    for (let offset = 0; offset < index.count; offset += 3) {
      const triangle = [
        index.getX(offset),
        index.getX(offset + 1),
        index.getX(offset + 2),
      ]
      for (let edge = 0; edge < 3; edge += 1) {
        const left = triangle[edge]
        const right = triangle[(edge + 1) % 3]
        if (left === right) {
          continue
        }
        const key = left < right ? `${left}:${right}` : `${right}:${left}`
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1)
      }
    }
    const edgeHistogram = [...edgeCounts.values()].reduce<Record<number, number>>(
      (histogram, count) => {
        histogram[count] = (histogram[count] ?? 0) + 1
        return histogram
      },
      {},
    )
    expect(edgeHistogram).toEqual({ 2: edgeCounts.size })
    welded.dispose()
    positionOnly.dispose()
    geometry.dispose()
  })

  it('fills the rigid tub and stays inside the aggregate scene budget', () => {
    const slime = createSlimeGeometry()
    const container = createSlimeContainerGeometries()
    const label = createSlimeLabelGeometry()
    slime.computeBoundingBox()
    expect(slime.boundingBox!.min.y).toBeGreaterThanOrEqual(
      SLIME_CONTAINER_BASE_Y,
    )
    expect(slime.boundingBox!.max.y).toBeGreaterThan(SLIME_CROWN_Y - 0.08)
    expect(slime.boundingBox!.max.x).toBeLessThan(SLIME_CONTAINER_RADIUS)
    expect(slime.boundingBox!.max.x).toBeGreaterThan(
      SLIME_INNER_RADIUS - 0.12,
    )

    const triangles =
      countGeometryTriangles(slime) +
      countGeometryTriangles(container.wall) +
      countGeometryTriangles(container.base) +
      countGeometryTriangles(container.rim) +
      countGeometryTriangles(container.innerRim) +
      countGeometryTriangles(container.rib) +
      countGeometryTriangles(label) +
      64
    expect(triangles).toBeLessThanOrEqual(SLIME_TRIANGLE_BUDGET)
    expect(9).toBeLessThanOrEqual(SLIME_DRAW_CALL_BUDGET)

    slime.dispose()
    label.dispose()
    Object.values(container).forEach((geometry) => geometry.dispose())
  })
})
