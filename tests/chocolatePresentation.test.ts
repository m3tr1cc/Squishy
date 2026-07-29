import { describe, expect, it } from 'vitest'
import {
  createChocolateStaticColliders,
  getResponsiveChocolateCameraPose,
} from '../src/scene/ChocolateScene'

describe('chocolate presentation', () => {
  it('keeps desktop and mobile framing straight-on', () => {
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ]) {
      const pose = getResponsiveChocolateCameraPose(width, height)
      expect(pose.position[0]).toBe(0)
      expect(pose.position[2]).toBeGreaterThan(0)
      expect(pose.target[0]).toBe(0)
      expect(pose.target[2]).toBe(0)
    }
  })

  it('retains one body collider and a lower debris floor', () => {
    const colliders = createChocolateStaticColliders()
    expect(colliders).toHaveLength(2)
    expect(colliders[0]!.kind).toBe('round-cuboid')
    expect(colliders[1]!.kind).toBe('cuboid')
    expect(colliders[1]!.position![1]).toBeLessThan(
      colliders[0]!.position![1],
    )
  })
})
