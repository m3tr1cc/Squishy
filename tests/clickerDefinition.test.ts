import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { describe, expect, it } from 'vitest'
import {
  CLICKER_HOUSING,
  CLICKER_INNER_GROOVE,
  CLICKER_KEY_COUNT,
  CLICKER_KEY_ROWS,
  CLICKER_KEY_SIZE,
  getClickerKeyPosition,
  getResponsiveClickerCameraPose,
} from '../src/scene/clicker'
import { createRoundedCuboidGeometry } from '../src/scene/createRoundedCuboidGeometry'

describe('clicker definition', () => {
  it('uses nine evenly spaced keys in yellow, pink, and blue rows', () => {
    expect(CLICKER_KEY_COUNT).toBe(9)
    expect(CLICKER_KEY_ROWS.map(({ id }) => id)).toEqual([
      'yellow',
      'pink',
      'blue',
    ])
    expect(getClickerKeyPosition(0)[1]).toBeGreaterThan(0)
    expect(getClickerKeyPosition(4)).toEqual([0, 0, 0])
    expect(getClickerKeyPosition(8)[1]).toBeLessThan(0)
    expect(() => getClickerKeyPosition(9)).toThrow(
      'Clicker key index must be between 0 and 8',
    )
  })

  it('keeps the inner groove concentric with the molded housing', () => {
    expect(CLICKER_INNER_GROOVE.width).toBeCloseTo(
      CLICKER_HOUSING.width - CLICKER_INNER_GROOVE.inset * 2,
    )
    expect(CLICKER_INNER_GROOVE.height).toBeCloseTo(
      CLICKER_HOUSING.height - CLICKER_INNER_GROOVE.inset * 2,
    )
    expect(CLICKER_INNER_GROOVE.radius).toBeCloseTo(
      CLICKER_HOUSING.radius - CLICKER_INNER_GROOVE.inset,
    )
    expect(CLICKER_INNER_GROOVE.radius).toBeGreaterThan(0)
  })

  it('keeps the complete procedural device below the triangle budget', () => {
    const housing = new RoundedBoxGeometry(
      CLICKER_HOUSING.width,
      CLICKER_HOUSING.height,
      CLICKER_HOUSING.depth,
      4,
      CLICKER_HOUSING.radius,
    )
    const plate = new RoundedBoxGeometry(
      CLICKER_INNER_GROOVE.width,
      CLICKER_INNER_GROOVE.height,
      CLICKER_INNER_GROOVE.depth,
      CLICKER_INNER_GROOVE.segments,
      CLICKER_INNER_GROOVE.radius,
    )
    const key = createRoundedCuboidGeometry({
      width: CLICKER_KEY_SIZE,
      height: CLICKER_KEY_SIZE,
      depth: 0.58,
      radius: 0.285,
      widthSegments: 6,
      heightSegments: 6,
      depthSegments: 3,
    })
    const well = createRoundedCuboidGeometry({
      width: 1.39,
      height: 1.39,
      depth: 0.11,
      radius: 0.24,
      widthSegments: 4,
      heightSegments: 4,
      depthSegments: 1,
    })
    const stem = createRoundedCuboidGeometry({
      width: 0.48,
      height: 0.48,
      depth: 0.34,
      radius: 0.09,
      widthSegments: 2,
      heightSegments: 2,
      depthSegments: 1,
    })

    try {
      const triangles =
        housing.getAttribute('position').count / 3 +
        plate.getAttribute('position').count / 3 +
        (key.getIndex()!.count / 3) * 9 +
        (well.getIndex()!.count / 3) * 9 +
        (stem.getIndex()!.count / 3) * 9 +
        2
      expect(triangles).toBeLessThanOrEqual(12_000)
    } finally {
      housing.dispose()
      plate.dispose()
      key.dispose()
      well.dispose()
      stem.dispose()
    }
  })

  it('fits the full square housing in portrait and landscape cameras', () => {
    for (const [width, height] of [
      [280, 560],
      [390, 844],
      [844, 390],
      [1440, 900],
    ]) {
      const pose = getResponsiveClickerCameraPose(width, height)
      const camera = new THREE.PerspectiveCamera(
        32,
        width / height,
        0.1,
        100,
      )
      camera.position.fromArray(pose.position)
      camera.lookAt(...pose.target)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      for (const x of [-CLICKER_HOUSING.width / 2, CLICKER_HOUSING.width / 2]) {
        for (const y of [
          -CLICKER_HOUSING.height / 2,
          CLICKER_HOUSING.height / 2,
        ]) {
          const projected = new THREE.Vector3(x, y, 0).project(camera)
          expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.9)
          expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.9)
        }
      }
    }
  })
})
