import { describe, expect, it } from 'vitest'
import { createButterLabelGeometry } from '../src/scene/createButterLabelGeometry'

describe('butter label geometry', () => {
  it('conforms to the rounded front instead of remaining a flat overlay', () => {
    const geometry = createButterLabelGeometry()
    const positions = geometry.getAttribute('position')
    let minimumZ = Number.POSITIVE_INFINITY
    let maximumZ = Number.NEGATIVE_INFINITY

    for (let index = 0; index < positions.count; index += 1) {
      minimumZ = Math.min(minimumZ, positions.getZ(index))
      maximumZ = Math.max(maximumZ, positions.getZ(index))
    }

    expect(positions.count).toBe((48 + 1) * (12 + 1))
    expect(maximumZ - minimumZ).toBeGreaterThan(0.005)
    expect(maximumZ).toBeLessThan(0.64)
    geometry.dispose()
  })
})
