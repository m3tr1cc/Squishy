import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  BUTTER_DEBRIS_BODY_LIMIT,
  BUTTER_DEFINITIONS,
  BUTTER_SOURCE_SEGMENTS,
  BUTTER_STACK_GROUND_Y,
  BUTTER_STACK_PLATE_COUNT,
  BUTTER_STACK_POSITIONS,
  BUTTER_STACK_SHELL_HEIGHT,
  BUTTER_STACK_STEP,
  mixButterSeed,
} from '../src/scene/butters'
import {
  BUTTER_SIZE,
  SHELL_OFFSET,
} from '../src/scene/constants'
import { createRoundedCuboidGeometry } from '../src/scene/createRoundedCuboidGeometry'
import { createWaxTopology } from '../src/scene/fracture/topology'
import { WAX_SEAM_PROFILE } from '../src/scene/fracture/types'

describe('butter trio catalog', () => {
  it('defines one ordered yellow, pink, and blue stick', () => {
    expect(
      BUTTER_DEFINITIONS.map(({ id }) => id),
    ).toEqual(['yellow', 'pink', 'blue'])
    expect(
      BUTTER_DEFINITIONS.map(({ bodyColor }) => bodyColor),
    ).toEqual(['#f2c94c', '#ef8fb5', '#69b9e9'])
    expect(new Set(BUTTER_DEFINITIONS.map(({ seedSalt }) => seedSalt)).size).toBe(
      3,
    )
    expect(new Set(BUTTER_DEFINITIONS.map(({ wax }) => wax.outer)).size).toBe(3)
  })

  it('keeps the expanded shells centered, ordered, and separated', () => {
    expect(BUTTER_STACK_POSITIONS).toHaveLength(3)
    expect(
      BUTTER_STACK_POSITIONS.map(([, y]) => y),
    ).toEqual([BUTTER_STACK_STEP, 0, -BUTTER_STACK_STEP])

    for (const [x, , z] of BUTTER_STACK_POSITIONS) {
      expect(x).toBe(0)
      expect(z).toBe(0)
    }

    const gap = BUTTER_STACK_STEP - BUTTER_STACK_SHELL_HEIGHT
    expect(gap).toBeGreaterThan(0.1)
    expect(BUTTER_STACK_GROUND_Y).toBeCloseTo(
      -BUTTER_STACK_STEP -
        (BUTTER_SIZE.height + SHELL_OFFSET * 2) / 2,
      8,
    )
  })

  it('derives stable distinct fracture seeds from one coating', () => {
    const coatingSeed = 0xa35f7109
    const first = BUTTER_DEFINITIONS.map((definition) =>
      mixButterSeed(coatingSeed, definition),
    )
    const second = BUTTER_DEFINITIONS.map(({ id }) =>
      mixButterSeed(coatingSeed, id),
    )

    expect(first).toEqual(second)
    expect(new Set(first).size).toBe(3)
    expect(first.every((seed) => seed === (seed >>> 0))).toBe(true)
  })

  it('uses pale shell colors related to their saturated cores', () => {
    for (const definition of BUTTER_DEFINITIONS) {
      const core = new THREE.Color(definition.bodyColor)
      const wax = new THREE.Color(definition.wax.outer)
      const coreHsl = { h: 0, s: 0, l: 0 }
      const waxHsl = { h: 0, s: 0, l: 0 }
      core.getHSL(coreHsl)
      wax.getHSL(waxHsl)
      const hueDistance = Math.min(
        Math.abs(coreHsl.h - waxHsl.h),
        1 - Math.abs(coreHsl.h - waxHsl.h),
      )

      expect(hueDistance).toBeLessThan(0.08)
      expect(waxHsl.l).toBeGreaterThan(coreHsl.l)
      expect(waxHsl.s).toBeLessThan(coreHsl.s)
    }
  })

  it('bounds aggregate geometry and mobile debris for three live sticks', () => {
    const geometry = createRoundedCuboidGeometry({
      widthSegments: BUTTER_SOURCE_SEGMENTS.width,
      heightSegments: BUTTER_SOURCE_SEGMENTS.height,
      depthSegments: BUTTER_SOURCE_SEGMENTS.depth,
    })
    expect(geometry.getIndex()!.count / 3).toBe(4_000)
    expect(
      (geometry.getIndex()!.count / 3) * BUTTER_DEFINITIONS.length,
    ).toBeLessThan(14_000)
    expect(BUTTER_STACK_PLATE_COUNT).toBe(32)
    expect(BUTTER_DEBRIS_BODY_LIMIT).toBe(24)
    geometry.dispose()
  })

  it('builds each reduced stick as 32 clean connected wax plates', () => {
    const geometry = createRoundedCuboidGeometry({
      widthSegments: BUTTER_SOURCE_SEGMENTS.width,
      heightSegments: BUTTER_SOURCE_SEGMENTS.height,
      depthSegments: BUTTER_SOURCE_SEGMENTS.depth,
    })
    const topology = createWaxTopology({
      sourceGeometry: geometry,
      plateCount: BUTTER_STACK_PLATE_COUNT,
      seamProfile: WAX_SEAM_PROFILE.long,
      seed: mixButterSeed(0x12ab34cd, 'yellow'),
    })
    try {
      expect(topology.plateCount).toBe(32)
      expect(topology.fragments).toHaveLength(32)
      expect(topology.bonds.length).toBeGreaterThan(31)
      expect(topology.source.triangleCount).toBe(4_000)
      expect(topology.triangleFragmentIds.length).toBeLessThan(18_000)
    } finally {
      topology.geometry.dispose()
      geometry.dispose()
    }
  })
})
