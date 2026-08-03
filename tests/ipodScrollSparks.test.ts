import { describe, expect, it } from 'vitest'
import {
  countIpodScrollSparkShapes,
  createIpodScrollSparkSignals,
  createIpodScrollSparkState,
  createIpodWheelRuntime,
  emitIpodScrollSparks,
  IPOD_SCROLL_SPARK_CAPACITY,
  IPOD_SCROLL_SPARK_LIFETIME_SECONDS,
  IPOD_WHEEL_DEGREES_PER_MENU_STEP,
  isIpodScrollSparkPlacementVisible,
  stepIpodScrollSparks,
  stepIpodWheel,
} from '../src/scene/ipod'

const EXPERIENCE_SEED = 0x2a17c0de

function consume(
  count: number,
  width = 743,
  height = 851,
) {
  const signals = createIpodScrollSparkSignals()
  const state = createIpodScrollSparkState()
  emitIpodScrollSparks(signals, count)
  stepIpodScrollSparks(
    state,
    signals,
    EXPERIENCE_SEED,
    width,
    height,
    0,
    false,
  )
  return { signals, state }
}

describe('iPod scroll sparks', () => {
  it('emits one event for every successful wheel menu step', () => {
    const wheelResult = stepIpodWheel(
      createIpodWheelRuntime(),
      IPOD_WHEEL_DEGREES_PER_MENU_STEP * 5.2,
      0,
    )
    const signals = createIpodScrollSparkSignals()
    emitIpodScrollSparks(signals, wheelResult.selectionChangeCount)

    expect(wheelResult.selectedIndex).toBe(0)
    expect(wheelResult.selectionChangeCount).toBe(5)
    expect(signals.sequence).toBe(5)
  })

  it('preserves twenty events emitted between render frames', () => {
    const { state } = consume(20)
    let limeCount = 0
    let pinkCount = 0
    for (let slot = 0; slot < 20; slot += 1) {
      if (state.style[slot * 4 + 3] < 0.5) {
        limeCount += 1
      } else {
        pinkCount += 1
      }
    }
    expect(state.activeCount).toBe(20)
    expect(state.emittedCount).toBe(20)
    expect(state.observedSequence).toBe(20)
    expect(countIpodScrollSparkShapes(state)).toEqual({
      stars: 10,
      blobs: 10,
    })
    expect({ limeCount, pinkCount }).toEqual({
      limeCount: 10,
      pinkCount: 10,
    })
  })

  it('produces identical variation from the same seed and sequence', () => {
    const first = consume(12).state
    const second = consume(12).state

    expect(Array.from(first.centers)).toEqual(Array.from(second.centers))
    expect(Array.from(first.motion)).toEqual(Array.from(second.motion))
    expect(Array.from(first.style)).toEqual(Array.from(second.style))
  })

  it('reuses every animation buffer across frame steps', () => {
    const signals = createIpodScrollSparkSignals()
    const state = createIpodScrollSparkState()
    const buffers = {
      active: state.active,
      centers: state.centers,
      motion: state.motion,
      placementBounds: state.placementBounds,
      sequences: state.sequences,
      style: state.style,
    }
    emitIpodScrollSparks(signals, 4)
    stepIpodScrollSparks(
      state,
      signals,
      EXPERIENCE_SEED,
      743,
      851,
      0.016,
      false,
    )

    expect(state.active).toBe(buffers.active)
    expect(state.centers).toBe(buffers.centers)
    expect(state.motion).toBe(buffers.motion)
    expect(state.placementBounds).toBe(buffers.placementBounds)
    expect(state.sequences).toBe(buffers.sequences)
    expect(state.style).toBe(buffers.style)
  })

  it('recycles only the oldest slot after thirty-two overlaps', () => {
    const { state } = consume(IPOD_SCROLL_SPARK_CAPACITY + 1)
    const activeSequences = Array.from(state.sequences).sort(
      (left, right) => left - right,
    )

    expect(state.activeCount).toBe(IPOD_SCROLL_SPARK_CAPACITY)
    expect(state.emittedCount).toBe(IPOD_SCROLL_SPARK_CAPACITY + 1)
    expect(state.recycledCount).toBe(1)
    expect(activeSequences[0]).toBe(2)
    expect(activeSequences.at(-1)).toBe(33)
    expect(countIpodScrollSparkShapes(state)).toEqual({
      stars: 16,
      blobs: 16,
    })
  })

  it('expires every active slot at exactly one second', () => {
    const { signals, state } = consume(20)
    stepIpodScrollSparks(
      state,
      signals,
      EXPERIENCE_SEED,
      743,
      851,
      IPOD_SCROLL_SPARK_LIFETIME_SECONDS - 0.001,
      false,
    )
    expect(state.activeCount).toBe(20)

    stepIpodScrollSparks(
      state,
      signals,
      EXPERIENCE_SEED,
      743,
      851,
      0.001,
      false,
    )
    expect(state.activeCount).toBe(0)
  })

  it.each([
    ['desktop', 743, 851],
    ['mobile', 390, 844],
    ['landscape', 1280, 720],
  ])(
    'keeps every %s spark in the visible perimeter safe zone',
    (_, width, height) => {
      const { state } = consume(32, width, height)
      for (let slot = 0; slot < state.active.length; slot += 1) {
        const centerOffset = slot * 2
        const styleOffset = slot * 4
        expect(
          isIpodScrollSparkPlacementVisible(
            state.centers[centerOffset],
            state.centers[centerOffset + 1],
            state.style[styleOffset + 1],
            width,
            height,
          ),
        ).toBe(true)
      }
    },
  )

  it('consumes reduced-motion events without activating sparks', () => {
    const signals = createIpodScrollSparkSignals()
    const state = createIpodScrollSparkState()
    emitIpodScrollSparks(signals, 20)
    stepIpodScrollSparks(
      state,
      signals,
      EXPERIENCE_SEED,
      390,
      844,
      0.016,
      true,
    )

    expect(state.observedSequence).toBe(20)
    expect(state.activeCount).toBe(0)
    expect(state.emittedCount).toBe(0)
  })
})
