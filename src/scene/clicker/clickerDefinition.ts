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
  radius: 0.58,
})

export const CLICKER_INNER_GROOVE = Object.freeze({
  inset: 0.23,
  width: CLICKER_HOUSING.width - 0.46,
  height: CLICKER_HOUSING.height - 0.46,
  depth: 0.2,
  radius: CLICKER_HOUSING.radius - 0.23,
  segments: 4,
})

export const CLICKER_KEY_COLORS = Object.freeze([
  '#93F504',
  '#FC04B0',
  '#02E9E3',
  '#9402FB',
  '#FD7802',
  '#FDEB03',
  '#FB0371',
  '#00C8F9',
  '#68F601',
] as const)

export const CLICKER_KEYS = Object.freeze([
  Object.freeze({ id: 'lime', row: 0, column: 0, color: CLICKER_KEY_COLORS[0] }),
  Object.freeze({ id: 'magenta', row: 0, column: 1, color: CLICKER_KEY_COLORS[1] }),
  Object.freeze({ id: 'cyan', row: 0, column: 2, color: CLICKER_KEY_COLORS[2] }),
  Object.freeze({ id: 'purple', row: 1, column: 0, color: CLICKER_KEY_COLORS[3] }),
  Object.freeze({ id: 'orange', row: 1, column: 1, color: CLICKER_KEY_COLORS[4] }),
  Object.freeze({ id: 'yellow', row: 1, column: 2, color: CLICKER_KEY_COLORS[5] }),
  Object.freeze({ id: 'pink', row: 2, column: 0, color: CLICKER_KEY_COLORS[6] }),
  Object.freeze({ id: 'blue', row: 2, column: 1, color: CLICKER_KEY_COLORS[7] }),
  Object.freeze({ id: 'green', row: 2, column: 2, color: CLICKER_KEY_COLORS[8] }),
] as const)

export const CLICKER_KEY_POSITIONS = Object.freeze(
  CLICKER_KEYS.map(({ row, column }) => {
    return Object.freeze([
      (column - 1) * CLICKER_KEY_SPACING,
      (1 - row) * CLICKER_KEY_SPACING,
      0,
    ] as const)
  }),
)

export const CLICKER_CLEAR_HOUSING_MATERIAL = Object.freeze({
  color: '#ffffff',
  clearcoat: 1,
  clearcoatRoughness: 0.035,
  depthWrite: false,
  ior: 1.49,
  metalness: 0,
  opacity: 0.18,
  roughness: 0.08,
  specularIntensity: 1,
  thickness: 0.34,
  transmission: 0,
  transparent: true,
})

export const CLICKER_CLEAR_INSERT_MATERIAL = Object.freeze({
  color: '#f7fbff',
  clearcoat: 1,
  clearcoatRoughness: 0.055,
  depthWrite: false,
  ior: 1.47,
  metalness: 0,
  opacity: 0.07,
  roughness: 0.09,
  specularIntensity: 1,
  thickness: 0.18,
  transmission: 0,
  transparent: true,
})

export const CLICKER_KEY_MATERIAL = Object.freeze({
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  ior: 1.46,
  metalness: 0,
  roughness: 0.105,
  sheen: 0.24,
  sheenColor: '#ffffff',
  specularIntensity: 1,
  thickness: 0.12,
  transmission: 0,
})

export function createClickerSynesthesiaTheme(experienceSeed: number) {
  return createSynesthesiaTheme({
    leadingColor: CLICKER_KEY_COLORS[0],
    complementaryColor: CLICKER_KEY_COLORS[1],
    shadowColor: '#071a25',
    seed: (0x7c10c3e2 ^ experienceSeed) >>> 0,
    idleSpeed: 0.11,
    maximumMotifs: 6,
    colorLoop: {
      colors: CLICKER_KEY_COLORS,
    },
  })
}

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
