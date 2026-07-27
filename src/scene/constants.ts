export const BUTTER_SIZE = {
  width: 4.8,
  height: 1.35,
  depth: 1.25,
} as const

export const BUTTER_SEGMENTS = {
  width: 64,
  height: 18,
  depth: 16,
} as const

export const CORNER_RADIUS = 0.24
export const SHELL_OFFSET = 0.055
export const DENT_RADIUS = 0.52
export const DENT_DEPTH = 0.14
export const MAX_DENT_DEPTH = 0.18
export const MAX_ACTIVE_IMPACTS = 4
export const GROUND_Y = -(BUTTER_SIZE.height / 2 + SHELL_OFFSET)
