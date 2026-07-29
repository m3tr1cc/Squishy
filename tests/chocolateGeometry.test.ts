import { describe, expect, it } from 'vitest'
import {
  CHOCOLATE_COLUMNS,
  CHOCOLATE_ROWS,
  CHOCOLATE_SIZE,
  CHOCOLATE_TRIANGLE_BUDGET,
  createChocolateShellGeometry,
  createChocolateSlimeGeometry,
  getChocolateCellCoordinates,
  getChocolateCellRelief,
} from '../src/scene/chocolate'

function edgeKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

describe('chocolate bar geometry', () => {
  it('builds one closed mobile-safe shell with 15 raised cells', () => {
    const geometry = createChocolateShellGeometry()
    const index = geometry.getIndex()
    expect(index).not.toBeNull()
    expect(index!.count / 3).toBeLessThanOrEqual(
      CHOCOLATE_TRIANGLE_BUDGET,
    )

    const edgeCounts = new Map<string, number>()
    for (let offset = 0; offset < index!.count; offset += 3) {
      const triangle = [
        index!.getX(offset),
        index!.getX(offset + 1),
        index!.getX(offset + 2),
      ]
      for (let edge = 0; edge < 3; edge += 1) {
        const key = edgeKey(
          triangle[edge],
          triangle[(edge + 1) % 3],
        )
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1)
      }
    }
    expect(
      [...edgeCounts.values()].every((count) => count === 2),
    ).toBe(true)

    const centers = new Set<string>()
    for (let row = 0; row < CHOCOLATE_ROWS; row += 1) {
      for (
        let column = 0;
        column < CHOCOLATE_COLUMNS;
        column += 1
      ) {
        const pitchX = 5.92 / CHOCOLATE_COLUMNS
        const pitchY = 3.3 / CHOCOLATE_ROWS
        const x = -5.92 * 0.5 + (column + 0.5) * pitchX
        const y = -3.3 * 0.5 + (row + 0.5) * pitchY
        expect(getChocolateCellRelief(x, y)).toBeGreaterThan(0.17)
        const cell = getChocolateCellCoordinates(x, y)
        centers.add(`${cell.column}:${cell.row}`)
      }
    }
    expect(centers.size).toBe(15)
    expect(getChocolateCellRelief(0.592, 0)).toBe(0)
    geometry.dispose()
  })

  it('keeps the green slime body inset beneath the chocolate shell', () => {
    const shell = createChocolateShellGeometry()
    const slime = createChocolateSlimeGeometry()
    shell.computeBoundingBox()
    slime.computeBoundingBox()

    expect(shell.boundingBox!.max.x - shell.boundingBox!.min.x).toBeCloseTo(
      CHOCOLATE_SIZE[0],
      3,
    )
    expect(shell.boundingBox!.max.y - shell.boundingBox!.min.y).toBeCloseTo(
      CHOCOLATE_SIZE[1],
      3,
    )
    expect(slime.boundingBox!.max.x).toBeLessThan(
      shell.boundingBox!.max.x,
    )
    expect(slime.boundingBox!.max.y).toBeLessThan(
      shell.boundingBox!.max.y,
    )
    expect(slime.boundingBox!.max.z).toBeLessThan(
      shell.boundingBox!.max.z,
    )
    shell.dispose()
    slime.dispose()
  })
})
