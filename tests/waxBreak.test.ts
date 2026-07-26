import { describe, expect, it } from 'vitest'
import { createWaxShardGeometry } from '../src/scene/createWaxBreakAssets'

describe('wax break geometry', () => {
  it('creates finite raised plates with visible shell thickness', () => {
    const geometry = createWaxShardGeometry(7919)
    const positions = geometry.getAttribute('position')
    let minimumZ = Number.POSITIVE_INFINITY
    let maximumZ = Number.NEGATIVE_INFINITY

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index)
      const y = positions.getY(index)
      const z = positions.getZ(index)
      expect([x, y, z].every(Number.isFinite)).toBe(true)
      minimumZ = Math.min(minimumZ, z)
      maximumZ = Math.max(maximumZ, z)
    }

    expect(positions.count).toBe(7 * 12 * 3)
    expect(maximumZ).toBeGreaterThan(0.07)
    expect(maximumZ - minimumZ).toBeGreaterThan(0.04)
    geometry.dispose()
  })
})
