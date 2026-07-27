export type SpringState = {
  value: number
  velocity: number
}

export type SpringOptions = {
  stiffness: number
  damping: number
  mass?: number
}

export const PRESS_SPRING = {
  stiffness: 190,
  damping: 21,
  mass: 1,
} as const

export const INTRO_SPRING = {
  stiffness: 70,
  damping: 14,
  mass: 1,
} as const

export function stepSpring(
  state: SpringState,
  target: number,
  deltaSeconds: number,
  { stiffness, damping, mass = 1 }: SpringOptions,
) {
  const delta = Math.min(1 / 30, Math.max(0, deltaSeconds))
  const displacement = state.value - target
  const acceleration = (-stiffness * displacement - damping * state.velocity) / mass

  state.velocity += acceleration * delta
  state.value += state.velocity * delta

  if (Math.abs(state.value - target) < 1e-5 && Math.abs(state.velocity) < 1e-5) {
    state.value = target
    state.velocity = 0
  }

  return state
}
