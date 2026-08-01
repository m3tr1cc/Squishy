import { createSynesthesiaTheme } from '../synesthesia'

export const CLICKER_KEY_COUNT = 9
export const CLICKER_COLUMN_COUNT = 3
export const CLICKER_ROW_COUNT = 3
export const CLICKER_KEY_SIZE = 1.28
export const CLICKER_KEY_DEPTH = 0.58
export const CLICKER_KEY_SPACING = 1.48
export const CLICKER_KEY_TRAVEL = 0.2
export const CLICKER_MINIMUM_PRESS_MS = 70

export const CLICKER_HOUSING = Object.freeze({
  width: 5.35,
  height: 5.35,
  depth: 0.72,
  radius: 0.34,
})

export const CLICKER_KEY_ROWS = Object.freeze([
  Object.freeze({ id: 'yellow', color: '#f3e7a4', y: CLICKER_KEY_SPACING }),
  Object.freeze({ id: 'pink', color: '#f3a9ca', y: 0 }),
  Object.freeze({ id: 'blue', color: '#8cdeef', y: -CLICKER_KEY_SPACING }),
] as const)

export const CLICKER_KEY_POSITIONS = Object.freeze(
  Array.from({ length: CLICKER_KEY_COUNT }, (_, index) => {
    const row = Math.floor(index / CLICKER_COLUMN_COUNT)
    const column = index % CLICKER_COLUMN_COUNT
    return Object.freeze([
      (column - 1) * CLICKER_KEY_SPACING,
      CLICKER_KEY_ROWS[row].y,
      0,
    ] as const)
  }),
)

export const CLICKER_SYNESTHESIA_THEME = createSynesthesiaTheme({
  leadingColor: '#f3e7a4',
  complementaryColor: '#f3a9ca',
  shadowColor: '#071a25',
  seed: 0x7c10c3e2,
  idleSpeed: 0.11,
  maximumMotifs: 6,
})

export function getClickerKeyIndex(row: number, column: number) {
  return row * CLICKER_COLUMN_COUNT + column
}

export function getClickerKeyPosition(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= CLICKER_KEY_COUNT) {
    throw new Error('Clicker key index must be between 0 and 8')
  }
  return CLICKER_KEY_POSITIONS[index]
}

export function getResponsiveClickerCameraPose(
  width: number,
  height: number,
  fieldOfViewDegrees = 32,
) {
  const aspect = Math.max(0.25, width / Math.max(1, height))
  const verticalFov = (fieldOfViewDegrees * Math.PI) / 180
  const paddedHalfWidth = 3.18
  const paddedHalfHeight = 3.18
  const fitWidth =
    paddedHalfWidth / (Math.tan(verticalFov / 2) * aspect)
  const fitHeight = paddedHalfHeight / Math.tan(verticalFov / 2)
  const distance = Math.max(fitWidth, fitHeight) + 0.7

  return {
    position: [0, 0.08, distance] as const,
    target: [0, 0.08, 0] as const,
  }
}
