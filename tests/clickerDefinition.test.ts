import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { describe, expect, it } from 'vitest'
import {
  CLICKER_CLEAR_HOUSING_MATERIAL,
  CLICKER_CLEAR_INSERT_MATERIAL,
  CLICKER_HOUSING,
  CLICKER_INNER_GROOVE,
  CLICKER_KEY_COUNT,
  CLICKER_KEY_COLORS,
  CLICKER_KEY_MATERIAL,
  CLICKER_KEYS,
  CLICKER_KEY_SIZE,
  createClickerSynesthesiaTheme,
  getClickerKeyPosition,
  getResponsiveClickerCameraPose,
} from '../src/scene/clicker'
import { createRoundedCuboidGeometry } from '../src/scene/createRoundedCuboidGeometry'

describe('clicker definition', () => {
  it('uses nine evenly spaced keys in the reference neon layout', () => {
    expect(CLICKER_KEY_COUNT).toBe(9)
    expect(CLICKER_KEYS.map(({ id }) => id)).toEqual([
      'lime',
      'magenta',
      'cyan',
      'purple',
      'orange',
      'yellow',
      'pink',
      'blue',
      'green',
    ])
    expect(CLICKER_KEYS.map(({ color }) => color)).toEqual([
      '#93F504',
      '#FC04B0',
      '#02E9E3',
      '#9402FB',
      '#FD7802',
      '#FDEB03',
      '#FB0371',
      '#00C8F9',
      '#68F601',
    ])
    expect(new Set(CLICKER_KEY_COLORS).size).toBe(9)
    expect(getClickerKeyPosition(0)[1]).toBeGreaterThan(0)
    expect(getClickerKeyPosition(4)).toEqual([0, 0, 0])
    expect(getClickerKeyPosition(8)[1]).toBeLessThan(0)
    expect(() => getClickerKeyPosition(9)).toThrow(
      'Clicker key index must be between 0 and 8',
    )
  })

  it('defines clear acrylic housing and glossy resin key materials', () => {
    expect(CLICKER_CLEAR_HOUSING_MATERIAL).toMatchObject({
      transmission: 0,
      opacity: 0.18,
      transparent: true,
      roughness: 0.08,
      ior: 1.49,
      clearcoat: 1,
    })
    expect(CLICKER_CLEAR_INSERT_MATERIAL.opacity).toBeLessThan(0.1)
    expect(CLICKER_KEY_MATERIAL.transmission).toBeLessThan(0.1)
    expect(CLICKER_KEY_MATERIAL.clearcoat).toBe(1)
  })

  it('derives a reproducible palette-loop theme from the experience seed', () => {
    const first = createClickerSynesthesiaTheme(0x12345678)
    const second = createClickerSynesthesiaTheme(0x12345678)
    const different = createClickerSynesthesiaTheme(0x87654321)

    expect(first).toEqual(second)
    expect(first.seed).not.toBe(different.seed)
    expect(first.colorLoop?.colors).toEqual(CLICKER_KEY_COLORS)
    expect(Object.isFrozen(first.colorLoop?.colors)).toBe(true)
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
