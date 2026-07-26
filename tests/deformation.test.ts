import { describe, expect, it } from 'vitest'
import {
  SHELL_OFFSET,
} from '../src/scene/constants'
import { createRoundedCuboidGeometry } from '../src/scene/createRoundedCuboidGeometry'
import {
  captureDeformationSource,
  smoothDentWeight,
  writeDeformedPositions,
} from '../src/scene/deformation'
import type { DentImpact } from '../src/scene/types'

function findExtremeVertex(
  positions: Float32Array,
  selector: (x: number, y: number, z: number) => number,
) {
  let selectedOffset = 0
  let selectedValue = Number.NEGATIVE_INFINITY

  for (let offset = 0; offset < positions.length; offset += 3) {
    const value = selector(
      positions[offset],
      positions[offset + 1],
      positions[offset + 2],
    )
    if (value > selectedValue) {
      selectedValue = value
      selectedOffset = offset
    }
  }

  return selectedOffset
}

describe('squishy deformation', () => {
  it('uses a smooth bounded falloff', () => {
    expect(smoothDentWeight(0)).toBe(1)
    expect(smoothDentWeight(0.26)).toBeCloseTo(0.5, 5)
    expect(smoothDentWeight(0.52)).toBe(0)
    expect(smoothDentWeight(2)).toBe(0)
  })

  it('dents the hit side while preserving the shell offset', () => {
    const inner = createRoundedCuboidGeometry()
    const shell = inner.clone()
    const source = captureDeformationSource(inner)
    const frontOffset = findExtremeVertex(
      source.positions,
      (x, y, z) => z - Math.abs(x) - Math.abs(y),
    )
    const impact: DentImpact = {
      id: 'front',
      localPoint: [
        source.positions[frontOffset],
        source.positions[frontOffset + 1],
        source.positions[frontOffset + 2],
      ],
      localNormal: [0, 0, 1],
      amount: 1,
      velocity: 0,
    }

    writeDeformedPositions(inner, source, [impact], 0)
    writeDeformedPositions(shell, source, [impact], SHELL_OFFSET)

    const innerPositions = inner.getAttribute('position').array as Float32Array
    const shellPositions = shell.getAttribute('position').array as Float32Array
    const normalZ = source.normals[frontOffset + 2]
    const centerDepth =
      (source.positions[frontOffset + 2] - innerPositions[frontOffset + 2]) /
      normalZ

    expect(centerDepth).toBeGreaterThan(0.12)
    expect(centerDepth).toBeLessThanOrEqual(0.14)

    const gapX = shellPositions[frontOffset] - innerPositions[frontOffset]
    const gapY = shellPositions[frontOffset + 1] - innerPositions[frontOffset + 1]
    const gapZ = shellPositions[frontOffset + 2] - innerPositions[frontOffset + 2]
    expect(Math.hypot(gapX, gapY, gapZ)).toBeCloseTo(SHELL_OFFSET, 4)

    inner.dispose()
    shell.dispose()
  })

  it('does not carry a front press onto the opposite face', () => {
    const geometry = createRoundedCuboidGeometry()
    const source = captureDeformationSource(geometry)
    const frontOffset = findExtremeVertex(
      source.positions,
      (x, y, z) => z - Math.abs(x) - Math.abs(y),
    )
    const backOffset = findExtremeVertex(
      source.positions,
      (x, y, z) => -z - Math.abs(x) - Math.abs(y),
    )
    const originalBackZ = source.positions[backOffset + 2]

    writeDeformedPositions(
      geometry,
      source,
      [
        {
          id: 'front',
          localPoint: [
            source.positions[frontOffset],
            source.positions[frontOffset + 1],
            source.positions[frontOffset + 2],
          ],
          localNormal: [0, 0, 1],
          amount: 1,
          velocity: 0,
        },
      ],
      0,
    )

    const positions = geometry.getAttribute('position').array as Float32Array
    expect(positions[backOffset + 2]).toBeCloseTo(originalBackZ, 6)
    geometry.dispose()
  })
})
