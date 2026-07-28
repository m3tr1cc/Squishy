import { describe, expect, it } from 'vitest'
import {
  getResponsiveSoapCameraPose,
  getSoapGridPosition,
  resolveSoapLayout,
} from '../src/scene/SoapScene'

describe('soap grid presentation', () => {
  it('uses two columns and four rows in portrait viewports', () => {
    expect(resolveSoapLayout(390, 844)).toBe('portrait')
    const positions = Array.from({ length: 8 }, (_, index) =>
      getSoapGridPosition(index, 'portrait'),
    )

    expect(new Set(positions.map(([x]) => x)).size).toBe(2)
    expect(new Set(positions.map(([, y]) => y)).size).toBe(4)
    expect(new Set(positions.map((position) => position.join(':'))).size).toBe(
      8,
    )
  })

  it('uses four columns and two rows in landscape viewports', () => {
    expect(resolveSoapLayout(1440, 900)).toBe('landscape')
    const positions = Array.from({ length: 8 }, (_, index) =>
      getSoapGridPosition(index, 'landscape'),
    )

    expect(new Set(positions.map(([x]) => x)).size).toBe(4)
    expect(new Set(positions.map(([, y]) => y)).size).toBe(2)
    expect(new Set(positions.map((position) => position.join(':'))).size).toBe(
      8,
    )
  })

  it('keeps both responsive cameras straight-on and centered', () => {
    for (const [width, height] of [
      [390, 844],
      [1440, 900],
    ]) {
      const pose = getResponsiveSoapCameraPose(width, height)
      expect(pose.position[0]).toBe(0)
      expect(pose.position[1]).toBe(0)
      expect(pose.position[2]).toBeGreaterThan(0)
      expect(pose.target).toEqual([0, 0, 0])
    }
  })
})
