import { describe, expect, it } from 'vitest'
import {
  PRESS_SPRING,
  stepSpring,
} from '../src/scene/spring'

describe('spring integration', () => {
  it.each([30, 60, 120])('settles consistently at %i Hz', (frequency) => {
    const state = { value: 1, velocity: 0 }
    const frames = frequency * 2

    for (let frame = 0; frame < frames; frame += 1) {
      stepSpring(state, 0, 1 / frequency, PRESS_SPRING)
    }

    expect(Math.abs(state.value)).toBeLessThan(0.001)
    expect(Math.abs(state.velocity)).toBeLessThan(0.001)
  })

  it('clamps large frame deltas', () => {
    const delayed = { value: 1, velocity: 0 }
    const clamped = { value: 1, velocity: 0 }

    stepSpring(delayed, 0, 0.5, PRESS_SPRING)
    stepSpring(clamped, 0, 1 / 30, PRESS_SPRING)

    expect(delayed).toEqual(clamped)
  })
})
