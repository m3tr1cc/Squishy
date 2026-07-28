import {
  BUTTER_SIZE,
  SHELL_OFFSET,
} from '../constants'

export type ButterId = 'yellow' | 'pink' | 'blue'

export type ButterVector3 = readonly [
  x: number,
  y: number,
  z: number,
]

export type ButterWaxPalette = Readonly<{
  outer: string
  attenuation: string
  inner: string
  edge: string
}>

export type ButterDefinition = Readonly<{
  id: ButterId
  bodyColor: string
  position: ButterVector3
  seedSalt: number
  wax: ButterWaxPalette
}>

export const BUTTER_STACK_STEP = 1.62
export const BUTTER_STACK_SHELL_HEIGHT =
  BUTTER_SIZE.height + SHELL_OFFSET * 2
export const BUTTER_STACK_HEIGHT =
  BUTTER_STACK_SHELL_HEIGHT + BUTTER_STACK_STEP * 2
export const BUTTER_STACK_GROUND_Y =
  -BUTTER_STACK_STEP - BUTTER_STACK_SHELL_HEIGHT / 2

export const BUTTER_SOURCE_SEGMENTS = Object.freeze({
  width: 40,
  height: 12,
  depth: 10,
})

export const BUTTER_STACK_PLATE_COUNT = 32
export const BUTTER_DEBRIS_BODY_LIMIT = 24

function waxPalette(
  palette: ButterWaxPalette,
): ButterWaxPalette {
  return Object.freeze({ ...palette })
}

export const BUTTER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'yellow',
    bodyColor: '#f2c94c',
    position: Object.freeze([
      0,
      BUTTER_STACK_STEP,
      0,
    ]) as ButterVector3,
    seedSalt: 0x5d2a13c7,
    wax: waxPalette({
      outer: '#f4e8bd',
      attenuation: '#ead58d',
      inner: '#dac98e',
      edge: '#b7a46a',
    }),
  }),
  Object.freeze({
    id: 'pink',
    bodyColor: '#ef8fb5',
    position: Object.freeze([0, 0, 0]) as ButterVector3,
    seedSalt: 0xa4317be9,
    wax: waxPalette({
      outer: '#f2d6e1',
      attenuation: '#e7b8ca',
      inner: '#d7afbd',
      edge: '#b48798',
    }),
  }),
  Object.freeze({
    id: 'blue',
    bodyColor: '#69b9e9',
    position: Object.freeze([
      0,
      -BUTTER_STACK_STEP,
      0,
    ]) as ButterVector3,
    seedSalt: 0xc8e53f21,
    wax: waxPalette({
      outer: '#d5e7f2',
      attenuation: '#afd4e9',
      inner: '#abc7d8',
      edge: '#7f9fb4',
    }),
  }),
] satisfies readonly ButterDefinition[])

export const BUTTER_STACK_POSITIONS = Object.freeze(
  BUTTER_DEFINITIONS.map(({ position }) => position),
)

export function mixButterSeed(
  coatingSeed: number,
  definition: ButterDefinition | ButterId,
) {
  const resolved =
    typeof definition === 'string'
      ? BUTTER_DEFINITIONS.find(({ id }) => id === definition)
      : definition
  if (!resolved) {
    throw new Error(`Unknown butter definition: ${definition}`)
  }
  return (coatingSeed ^ resolved.seedSalt) >>> 0
}
