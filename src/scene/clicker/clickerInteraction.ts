import { stepSpring, type SpringState } from '../spring'
import {
  CLICKER_KEY_COUNT,
  CLICKER_MINIMUM_PRESS_MS,
} from './clickerDefinition'

export const CLICKER_PRESS_SPRING = Object.freeze({
  stiffness: 420,
  damping: 29,
  mass: 1,
})

export type ClickerKeyRuntime = {
  readonly springs: SpringState[]
  readonly targets: Uint8Array
  readonly pressedAtMs: Float64Array
  readonly releaseAtMs: Float64Array
}

export function createClickerKeyRuntime(): ClickerKeyRuntime {
  return {
    springs: Array.from({ length: CLICKER_KEY_COUNT }, () => ({
      value: 0,
      velocity: 0,
    })),
    targets: new Uint8Array(CLICKER_KEY_COUNT),
    pressedAtMs: new Float64Array(CLICKER_KEY_COUNT),
    releaseAtMs: new Float64Array(CLICKER_KEY_COUNT),
  }
}

function assertKeyIndex(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= CLICKER_KEY_COUNT) {
    throw new Error('Clicker key index must be between 0 and 8')
  }
}

export function pressClickerKey(
  runtime: ClickerKeyRuntime,
  index: number,
  nowMs: number,
) {
  assertKeyIndex(index)
  runtime.targets[index] = 1
  runtime.pressedAtMs[index] = nowMs
  runtime.releaseAtMs[index] = Number.POSITIVE_INFINITY
}

export function releaseClickerKey(
  runtime: ClickerKeyRuntime,
  index: number,
  nowMs: number,
) {
  assertKeyIndex(index)
  runtime.releaseAtMs[index] = Math.max(
    nowMs,
    runtime.pressedAtMs[index] + CLICKER_MINIMUM_PRESS_MS,
  )
}

export function stepClickerKeys(
  runtime: ClickerKeyRuntime,
  nowMs: number,
  deltaSeconds: number,
  reducedMotion: boolean,
) {
  for (let index = 0; index < CLICKER_KEY_COUNT; index += 1) {
    if (nowMs >= runtime.releaseAtMs[index]) {
      runtime.targets[index] = 0
      runtime.releaseAtMs[index] = 0
    }
    const target = runtime.targets[index]
    const spring = runtime.springs[index]
    if (reducedMotion) {
      spring.value = target * 0.35
      spring.velocity = 0
    } else {
      stepSpring(spring, target, deltaSeconds, CLICKER_PRESS_SPRING)
    }
  }
  return runtime
}
