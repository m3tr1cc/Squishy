import { describe, expect, it } from 'vitest'
import { CHOCOLATE_SYNESTHESIA_THEME } from '../src/scene/chocolate'
import {
  createSquishyVisualSignals,
  createSynesthesiaAnimationState,
  createSynesthesiaTheme,
  stepSynesthesiaAnimation,
  SYNESTHESIA_MOTIF_SLOT_COUNT,
  writeSquishyVisualSignals,
} from '../src/scene/synesthesia'

const TEST_THEME = createSynesthesiaTheme({
  leadingColor: '#a9ef75',
  complementaryColor: '#ef5b62',
  shadowColor: '#160a08',
  seed: 0x12345678,
  idleSpeed: 0.12,
  maximumMotifs: SYNESTHESIA_MOTIF_SLOT_COUNT,
})

function activeMotifCount(motifData: Float32Array) {
  let count = 0
  for (
    let offset = 2;
    offset < motifData.length;
    offset += 4
  ) {
    if (motifData[offset] > 0) {
      count += 1
    }
  }
  return count
}

describe('synesthesia animation', () => {
  it('locks the chocolate theme to the filling-led palette', () => {
    expect(CHOCOLATE_SYNESTHESIA_THEME).toMatchObject({
      leadingColor: '#a9ef75',
      complementaryColor: '#ef5b62',
      shadowColor: '#160a08',
      maximumMotifs: 6,
    })
    expect(Object.isFrozen(CHOCOLATE_SYNESTHESIA_THEME)).toBe(true)
  })

  it('validates reusable theme limits', () => {
    expect(() =>
      createSynesthesiaTheme({
        ...TEST_THEME,
        leadingColor: 'green',
      }),
    ).toThrow('leadingColor must be a six-digit hex color')
    expect(() =>
      createSynesthesiaTheme({
        ...TEST_THEME,
        maximumMotifs: SYNESTHESIA_MOTIF_SLOT_COUNT + 1,
      }),
    ).toThrow('maximumMotifs must be between')
  })

  it('accelerates for a press without inventing a crack burst', () => {
    const signals = createSquishyVisualSignals()
    const state = createSynesthesiaAnimationState()

    writeSquishyVisualSignals(signals, 1, 0, 100, 0)
    stepSynesthesiaAnimation(
      state,
      signals,
      TEST_THEME,
      1 / 60,
      false,
    )

    expect(signals.crackSequence).toBe(0)
    expect(state.flowSpeed).toBeCloseTo(1.5)
    expect(state.burstEnergy).toBe(0)
    expect(activeMotifCount(state.motifData)).toBe(0)
  })

  it('keeps damage monotonic and emits only real break sequences', () => {
    const signals = createSquishyVisualSignals()

    writeSquishyVisualSignals(signals, 0.4, 8, 100, 0)
    expect(signals).toMatchObject({
      pressStrength: 0.4,
      damageProgress: 0.08,
      crackSequence: 0,
    })

    writeSquishyVisualSignals(signals, 0, 6, 100, 0)
    expect(signals.damageProgress).toBeCloseTo(0.08)
    expect(signals.crackSequence).toBe(0)

    writeSquishyVisualSignals(signals, 0, 10, 100, 2)
    expect(signals.damageProgress).toBeCloseTo(0.1)
    expect(signals.crackSequence).toBe(1)
    expect(signals.crackStrength).toBeCloseTo(2 / 3)
  })

  it('selects bounded crack motifs deterministically', () => {
    const firstSignals = createSquishyVisualSignals()
    const secondSignals = createSquishyVisualSignals()
    const firstState = createSynesthesiaAnimationState()
    const secondState = createSynesthesiaAnimationState()

    writeSquishyVisualSignals(firstSignals, 0, 3, 100, 3)
    writeSquishyVisualSignals(secondSignals, 0, 3, 100, 3)
    stepSynesthesiaAnimation(
      firstState,
      firstSignals,
      TEST_THEME,
      1 / 60,
      false,
    )
    stepSynesthesiaAnimation(
      secondState,
      secondSignals,
      TEST_THEME,
      1 / 60,
      false,
    )

    expect(activeMotifCount(firstState.motifData)).toBe(3)
    expect(Array.from(firstState.motifData)).toEqual(
      Array.from(secondState.motifData),
    )
    expect(firstState.motifCursor).toBeLessThan(
      SYNESTHESIA_MOTIF_SLOT_COUNT,
    )
  })

  it('layers cumulative energy and retires transient motifs', () => {
    const signals = createSquishyVisualSignals()
    const state = createSynesthesiaAnimationState()
    writeSquishyVisualSignals(signals, 0, 100, 100, 3)

    stepSynesthesiaAnimation(
      state,
      signals,
      TEST_THEME,
      0.01,
      false,
    )
    expect(state.flowSpeed).toBeGreaterThan(2.25)
    expect(state.flowSpeed).toBeLessThanOrEqual(4)

    for (let step = 0; step < 34; step += 1) {
      stepSynesthesiaAnimation(
        state,
        signals,
        TEST_THEME,
        0.1,
        false,
      )
    }

    expect(state.burstEnergy).toBeLessThan(0.02)
    expect(state.flowSpeed).toBeCloseTo(2.25, 1)
    expect(activeMotifCount(state.motifData)).toBe(0)
  })

  it('freezes time and suppresses motifs for reduced motion', () => {
    const signals = createSquishyVisualSignals()
    const state = createSynesthesiaAnimationState()
    writeSquishyVisualSignals(signals, 1, 50, 100, 2)
    stepSynesthesiaAnimation(
      state,
      signals,
      TEST_THEME,
      0.1,
      false,
    )
    const flowTime = state.flowTime

    stepSynesthesiaAnimation(
      state,
      signals,
      TEST_THEME,
      0.1,
      true,
    )

    expect(state.flowTime).toBe(flowTime)
    expect(state.flowSpeed).toBe(0)
    expect(state.damageProgress).toBe(0.5)
    expect(activeMotifCount(state.motifData)).toBe(0)
  })

  it('returns to pristine values with a fresh reset state', () => {
    const resetSignals = createSquishyVisualSignals()
    const resetState = createSynesthesiaAnimationState()

    expect(resetSignals).toEqual({
      pressStrength: 0,
      damageProgress: 0,
      crackSequence: 0,
      crackStrength: 0,
    })
    expect(resetState.flowSpeed).toBe(1)
    expect(resetState.flowTime).toBe(0)
    expect(activeMotifCount(resetState.motifData)).toBe(0)
  })
})
