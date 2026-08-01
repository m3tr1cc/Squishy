import { describe, expect, it } from 'vitest'
import {
  createClickerKeyRuntime,
  pressClickerKey,
  releaseClickerKey,
  stepClickerKeys,
} from '../src/scene/clicker'

describe('clicker key interaction', () => {
  it('holds a quick tap down for the minimum visible interval', () => {
    const runtime = createClickerKeyRuntime()
    pressClickerKey(runtime, 4, 100)
    releaseClickerKey(runtime, 4, 120)

    stepClickerKeys(runtime, 150, 1 / 60, false)
    expect(runtime.targets[4]).toBe(1)
    expect(runtime.springs[4].value).toBeGreaterThan(0)

    stepClickerKeys(runtime, 170, 1 / 60, false)
    expect(runtime.targets[4]).toBe(0)
  })

  it('keeps a held key depressed until release', () => {
    const runtime = createClickerKeyRuntime()
    pressClickerKey(runtime, 0, 0)
    for (let frame = 0; frame < 30; frame += 1) {
      stepClickerKeys(runtime, frame * 16, 1 / 60, false)
    }
    expect(runtime.targets[0]).toBe(1)
    expect(runtime.springs[0].value).toBeCloseTo(1, 1)

    releaseClickerKey(runtime, 0, 500)
    for (let frame = 0; frame < 30; frame += 1) {
      stepClickerKeys(runtime, 500 + frame * 16, 1 / 60, false)
    }
    expect(runtime.springs[0].value).toBeCloseTo(0, 1)
  })

  it('uses a shallow non-bouncy state under reduced motion', () => {
    const runtime = createClickerKeyRuntime()
    pressClickerKey(runtime, 8, 0)
    stepClickerKeys(runtime, 16, 1 / 60, true)
    expect(runtime.springs[8]).toEqual({ value: 0.35, velocity: 0 })
  })

  it('rejects out-of-range key mutations', () => {
    const runtime = createClickerKeyRuntime()
    expect(() => pressClickerKey(runtime, -1, 0)).toThrow(
      'Clicker key index must be between 0 and 8',
    )
    expect(() => releaseClickerKey(runtime, 9, 0)).toThrow(
      'Clicker key index must be between 0 and 8',
    )
  })
})
