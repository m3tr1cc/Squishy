import {
  IPOD_MENU_ITEM_COUNT,
  IPOD_WHEEL_DEGREES_PER_MENU_STEP,
  clampIpodMenuIndex,
} from './ipodDefinition'

export type IpodWheelRuntime = Readonly<{
  accumulatedDegrees: number
}>

export type IpodWheelStepResult = Readonly<{
  runtime: IpodWheelRuntime
  selectedIndex: number
  selectionChangeCount: number
}>

export function createIpodWheelRuntime(): IpodWheelRuntime {
  return { accumulatedDegrees: 0 }
}

export function getIpodWheelAngle(x: number, y: number) {
  return (Math.atan2(y, x) * 180) / Math.PI
}

export function getClockwiseWheelDelta(
  previousAngleDegrees: number,
  currentAngleDegrees: number,
) {
  let delta = previousAngleDegrees - currentAngleDegrees
  while (delta > 180) {
    delta -= 360
  }
  while (delta <= -180) {
    delta += 360
  }
  return delta
}

export function stepIpodWheel(
  runtime: IpodWheelRuntime,
  clockwiseDeltaDegrees: number,
  selectedIndex: number,
  itemCount = IPOD_MENU_ITEM_COUNT,
): IpodWheelStepResult {
  if (!Number.isFinite(clockwiseDeltaDegrees) || itemCount <= 0) {
    return {
      runtime,
      selectedIndex,
      selectionChangeCount: 0,
    }
  }

  let accumulatedDegrees =
    runtime.accumulatedDegrees + clockwiseDeltaDegrees
  let nextIndex = clampIpodMenuIndex(selectedIndex)
  let selectionChangeCount = 0

  while (
    Math.abs(accumulatedDegrees) >=
    IPOD_WHEEL_DEGREES_PER_MENU_STEP
  ) {
    const direction = accumulatedDegrees > 0 ? 1 : -1
    accumulatedDegrees -=
      direction * IPOD_WHEEL_DEGREES_PER_MENU_STEP
    const candidateIndex = Math.min(
      itemCount - 1,
      Math.max(0, nextIndex + direction),
    )
    if (candidateIndex !== nextIndex) {
      nextIndex = candidateIndex
      selectionChangeCount += 1
    }
  }

  return {
    runtime: { accumulatedDegrees },
    selectedIndex: nextIndex,
    selectionChangeCount,
  }
}
