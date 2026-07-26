import { describe, expect, it } from 'vitest'
import {
  groupConnectedFragments,
  PRESENTATION_ROTATION,
  selectColliderSupportPoints,
  WAX_OUTER_MATERIAL,
} from '../src/scene/ButterSquishy'
import {
  getResponsiveCameraPose,
  SCENE_BACKGROUND,
} from '../src/scene/SquishyScene'

describe('straight black presentation', () => {
  it('uses an identity product pose and centered responsive camera', () => {
    expect(PRESENTATION_ROTATION).toEqual([0, 0, 0])

    for (const [width, height] of [
      [280, 560],
      [390, 844],
      [1264, 569],
      [1440, 900],
    ]) {
      const pose = getResponsiveCameraPose(width, height)
      expect(pose.position[0]).toBe(0)
      expect(pose.position[1]).toBe(0)
      expect(pose.position[2]).toBeGreaterThan(0)
      expect(pose.target).toEqual([0, 0, 0])
    }
  })

  it('uses opaque physical transmission over pure black', () => {
    expect(SCENE_BACKGROUND).toBe('#000000')
    expect(WAX_OUTER_MATERIAL.transparent).toBe(false)
    expect(WAX_OUTER_MATERIAL.opacity).toBe(1)
    expect(WAX_OUTER_MATERIAL.transmission).toBe(0.1)
    expect(WAX_OUTER_MATERIAL.roughness).toBe(0.74)
  })
})

describe('mixed bounded debris', () => {
  const fragments = Array.from({ length: 20 }, (_, index) => ({
    neighborFragmentIds: [
      ...(index > 0 ? [index - 1] : []),
      ...(index < 19 ? [index + 1] : []),
    ],
  }))
  const detached = Array.from({ length: 20 }, (_, index) => index)

  it('is deterministic per coating and produces one-to-four plate groups', () => {
    const first = groupConnectedFragments(
      detached,
      fragments,
      4,
      0xa31f09e2,
    )
    const second = groupConnectedFragments(
      [...detached].reverse(),
      fragments,
      4,
      0xa31f09e2,
    )

    expect(first).toEqual(second)
    expect(first.flat().sort((left, right) => left - right)).toEqual(
      detached,
    )
    expect(first.every((group) => group.length >= 1 && group.length <= 4)).toBe(
      true,
    )
    expect(new Set(first.map((group) => group.length)).size).toBeGreaterThan(1)
  })

  it('limits convex support vertices while retaining axis extrema', () => {
    const vertices = new Float32Array(120 * 3)
    for (let index = 0; index < 120; index += 1) {
      const angle = (index / 120) * Math.PI * 2
      const offset = index * 3
      vertices[offset] = Math.cos(angle) * (1 + (index % 7) * 0.02)
      vertices[offset + 1] = Math.sin(angle)
      vertices[offset + 2] = index / 119 - 0.5
    }

    const support = selectColliderSupportPoints(vertices, 48)
    expect(support.length / 3).toBeLessThanOrEqual(48)
    expect(Math.min(...support)).toBeLessThanOrEqual(-1)
    expect(Math.max(...support)).toBeGreaterThanOrEqual(1)
  })
})
