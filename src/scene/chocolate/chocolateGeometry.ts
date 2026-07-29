import * as THREE from 'three'
import { createRoundedCuboidGeometry } from '../createRoundedCuboidGeometry'

export const CHOCOLATE_COLUMNS = 5
export const CHOCOLATE_ROWS = 3
export const CHOCOLATE_SIZE = Object.freeze([
  6.4,
  3.8,
  0.72,
] as const)
export const CHOCOLATE_SEGMENTS = Object.freeze([
  60,
  36,
  4,
] as const)
export const CHOCOLATE_TRIANGLE_BUDGET = 12_000
export const CHOCOLATE_CORNER_RADIUS = 0.28

const CELL_FIELD_WIDTH = 5.92
const CELL_FIELD_HEIGHT = 3.3
const CELL_RELIEF = 0.18

function smoothStep(minimum: number, maximum: number, value: number) {
  const t = THREE.MathUtils.clamp(
    (value - minimum) / (maximum - minimum),
    0,
    1,
  )
  return t * t * (3 - 2 * t)
}

export function getChocolateCellCoordinates(x: number, y: number) {
  const pitchX = CELL_FIELD_WIDTH / CHOCOLATE_COLUMNS
  const pitchY = CELL_FIELD_HEIGHT / CHOCOLATE_ROWS
  const column = THREE.MathUtils.clamp(
    Math.floor((x + CELL_FIELD_WIDTH * 0.5) / pitchX),
    0,
    CHOCOLATE_COLUMNS - 1,
  )
  const row = THREE.MathUtils.clamp(
    Math.floor((y + CELL_FIELD_HEIGHT * 0.5) / pitchY),
    0,
    CHOCOLATE_ROWS - 1,
  )
  const centerX =
    -CELL_FIELD_WIDTH * 0.5 + (column + 0.5) * pitchX
  const centerY =
    -CELL_FIELD_HEIGHT * 0.5 + (row + 0.5) * pitchY
  return {
    column,
    row,
    localX: x - centerX,
    localY: y - centerY,
    pitchX,
    pitchY,
  }
}

export function getChocolateCellRelief(x: number, y: number) {
  if (
    Math.abs(x) >= CELL_FIELD_WIDTH * 0.5 ||
    Math.abs(y) >= CELL_FIELD_HEIGHT * 0.5
  ) {
    return 0
  }

  const cell = getChocolateCellCoordinates(x, y)
  const normalizedX =
    Math.abs(cell.localX) / (cell.pitchX * 0.43)
  const normalizedY =
    Math.abs(cell.localY) / (cell.pitchY * 0.4)
  const roundedRectangle =
    normalizedX ** 4 + normalizedY ** 4
  return (
    CELL_RELIEF *
    (1 - smoothStep(0.56, 1.08, roundedRectangle))
  )
}

export function isChocolateGutter(
  x: number,
  y: number,
  z: number,
) {
  if (z < 0.18) {
    return false
  }
  const cell = getChocolateCellCoordinates(x, y)
  return (
    Math.abs(cell.localX) > cell.pitchX * 0.37 ||
    Math.abs(cell.localY) > cell.pitchY * 0.34
  )
}

export function createChocolateShellGeometry() {
  const geometry = createRoundedCuboidGeometry({
    width: CHOCOLATE_SIZE[0],
    height: CHOCOLATE_SIZE[1],
    depth: CHOCOLATE_SIZE[2],
    radius: CHOCOLATE_CORNER_RADIUS,
    widthSegments: CHOCOLATE_SEGMENTS[0],
    heightSegments: CHOCOLATE_SEGMENTS[1],
    depthSegments: CHOCOLATE_SEGMENTS[2],
  })
  const positions = geometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    const z = positions.getZ(index)
    if (z <= 0) {
      continue
    }
    const frontBlend = smoothStep(0.16, 0.34, z)
    positions.setZ(
      index,
      z + getChocolateCellRelief(x, y) * frontBlend,
    )
  }

  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function createChocolateSlimeGeometry() {
  return createRoundedCuboidGeometry({
    width: 6.18,
    height: 3.58,
    depth: 0.64,
    radius: 0.36,
    widthSegments: 58,
    heightSegments: 34,
    depthSegments: 4,
  })
}
