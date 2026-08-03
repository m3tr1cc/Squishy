import { describe, expect, it } from 'vitest'
import {
  createIpodWheelRuntime,
  getClockwiseWheelDelta,
  getIpodWheelAngle,
  IPOD_WHEEL_DEGREES_PER_MENU_STEP,
  stepIpodWheel,
} from '../src/scene/ipod'

describe('iPod click-wheel interaction', () => {
  it('measures wheel angles and preserves direction across the seam', () => {
    expect(getIpodWheelAngle(1, 0)).toBeCloseTo(0)
    expect(getIpodWheelAngle(0, 1)).toBeCloseTo(90)
    expect(getClockwiseWheelDelta(170, -170)).toBe(-20)
    expect(getClockwiseWheelDelta(-170, 170)).toBe(20)
  })

  it('moves one row per 18.75 degrees of clockwise travel', () => {
    const partial = stepIpodWheel(
      createIpodWheelRuntime(),
      IPOD_WHEEL_DEGREES_PER_MENU_STEP - 0.1,
      0,
    )
    expect(partial.selectedIndex).toBe(0)

    const completed = stepIpodWheel(
      partial.runtime,
      0.1,
      partial.selectedIndex,
    )
    expect(completed.selectedIndex).toBe(1)
    expect(completed.selectionChangeCount).toBe(1)
    expect(completed.runtime.accumulatedDegrees).toBeCloseTo(0)
  })

  it('supports multiple increments and counter-clockwise travel', () => {
    const clockwise = stepIpodWheel(
      createIpodWheelRuntime(),
      IPOD_WHEEL_DEGREES_PER_MENU_STEP * 2.2,
      1,
    )
    expect(clockwise.selectedIndex).toBe(3)
    expect(clockwise.selectionChangeCount).toBe(2)

    const counterClockwise = stepIpodWheel(
      clockwise.runtime,
      -IPOD_WHEEL_DEGREES_PER_MENU_STEP * 1.3,
      clockwise.selectedIndex,
    )
    expect(counterClockwise.selectedIndex).toBe(2)
    expect(counterClockwise.selectionChangeCount).toBe(1)
  })

  it('wraps continuously across both menu bounds', () => {
    const top = stepIpodWheel(
      createIpodWheelRuntime(),
      -IPOD_WHEEL_DEGREES_PER_MENU_STEP,
      0,
    )
    expect(top.selectedIndex).toBe(4)
    expect(top.selectionChangeCount).toBe(1)

    const bottom = stepIpodWheel(
      createIpodWheelRuntime(),
      IPOD_WHEEL_DEGREES_PER_MENU_STEP,
      4,
    )
    expect(bottom.selectedIndex).toBe(0)
    expect(bottom.selectionChangeCount).toBe(1)

    const multipleTurns = stepIpodWheel(
      createIpodWheelRuntime(),
      IPOD_WHEEL_DEGREES_PER_MENU_STEP * 12,
      4,
    )
    expect(multipleTurns.selectedIndex).toBe(1)
    expect(multipleTurns.selectionChangeCount).toBe(12)
  })
})
