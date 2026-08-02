import { describe, expect, it } from 'vitest'
import {
  BUTTER_DEFINITIONS,
  BUTTER_SYNESTHESIA_PALETTE,
} from '../src/scene/butters'
import { CHOCOLATE_SYNESTHESIA_THEME } from '../src/scene/chocolate'
import {
  SOAP_DEFINITIONS,
  SOAP_SYNESTHESIA_PALETTE,
} from '../src/scene/soaps'
import {
  createSquishyVisualSignalMixer,
  createSquishyVisualSignalSources,
  createSquishyVisualSignals,
  createSynesthesiaAnimationState,
  createSynesthesiaTheme,
  createSynesthesiaThemeFromPalette,
  emitSynesthesiaBurst,
  mixSquishyVisualSignals,
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

const COLOR_LOOP_THEME = createSynesthesiaTheme({
  leadingColor: '#93f504',
  complementaryColor: '#fc04b0',
  shadowColor: '#071a25',
  seed: 0x51a7c0de,
  idleSpeed: 1,
  maximumMotifs: SYNESTHESIA_MOTIF_SLOT_COUNT,
  colorLoop: {
    colors: ['#93f504', '#fc04b0', '#02e9e3', '#9402fb'],
  },
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
    expect(() =>
      createSynesthesiaTheme({
        ...TEST_THEME,
        colorLoop: { colors: ['#ffffff'] },
      }),
    ).toThrow('colorLoop.colors must include at least two colors')
    expect(() =>
      createSynesthesiaTheme({
        ...TEST_THEME,
        colorLoop: { colors: ['#ffffff', 'neon'] },
      }),
    ).toThrow('colorLoop color must be a six-digit hex color')
  })

  it('freezes a defensive copy of a valid color-loop palette', () => {
    const source = ['#93f504', '#fc04b0']
    const theme = createSynesthesiaTheme({
      ...TEST_THEME,
      colorLoop: { colors: source },
    })
    source[0] = '#ffffff'

    expect(theme.colorLoop?.colors[0]).toBe('#93f504')
    expect(Object.isFrozen(theme.colorLoop)).toBe(true)
    expect(Object.isFrozen(theme.colorLoop?.colors)).toBe(true)
  })

  it('selects a stable random page color and its paired complement', () => {
    const options = {
      shadowColor: '#110d08',
      seed: 0x78ab31de,
      idleSpeed: 0.12,
      maximumMotifs: 6,
    }
    const first = createSynesthesiaThemeFromPalette(
      BUTTER_SYNESTHESIA_PALETTE,
      options,
    )
    const second = createSynesthesiaThemeFromPalette(
      BUTTER_SYNESTHESIA_PALETTE,
      options,
    )
    const paletteEntry = BUTTER_SYNESTHESIA_PALETTE.find(
      (entry) => entry.leadingColor === first.leadingColor,
    )

    expect(first).toEqual(second)
    expect(paletteEntry?.complementaryColor).toBe(
      first.complementaryColor,
    )
  })

  it('uses every butter and soap body color as a lead option', () => {
    expect(
      BUTTER_SYNESTHESIA_PALETTE.map(
        ({ leadingColor }) => leadingColor,
      ),
    ).toEqual(BUTTER_DEFINITIONS.map(({ bodyColor }) => bodyColor))
    expect(
      SOAP_SYNESTHESIA_PALETTE.map(
        ({ leadingColor }) => leadingColor,
      ),
    ).toEqual(
      SOAP_DEFINITIONS.map(({ style }) => style.bodyColor),
    )
  })

  it('mixes independent page signals without overwriting presses', () => {
    const sources = createSquishyVisualSignalSources(3)
    const mixer = createSquishyVisualSignalMixer(sources.length)
    writeSquishyVisualSignals(sources[0], 0.8, 30, 100, 2)
    writeSquishyVisualSignals(sources[1], 0, 15, 100, 0)
    writeSquishyVisualSignals(sources[2], 0.3, 0, 100, 0)

    const combined = mixSquishyVisualSignals(mixer, sources)
    expect(combined.pressStrength).toBeCloseTo(0.8)
    expect(combined.damageProgress).toBeCloseTo(0.15)
    expect(combined.burstSequence).toBe(1)
    expect(combined.burstStrength).toBeCloseTo(2 / 3)

    mixSquishyVisualSignals(mixer, sources)
    expect(combined.burstSequence).toBe(1)

    writeSquishyVisualSignals(sources[2], 0, 3, 100, 1)
    mixSquishyVisualSignals(mixer, sources)
    expect(combined.burstSequence).toBe(2)
    expect(combined.burstStrength).toBeCloseTo(1 / 3)
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

    expect(signals.burstSequence).toBe(0)
    expect(state.flowSpeed).toBeCloseTo(1.5)
    expect(state.burstEnergy).toBe(0)
    expect(activeMotifCount(state.motifData)).toBe(0)
  })

  it('allows a non-fracture interaction to emit a real visual burst', () => {
    const signals = createSquishyVisualSignals()
    const state = createSynesthesiaAnimationState()
    emitSynesthesiaBurst(signals, 0.72)

    stepSynesthesiaAnimation(state, signals, TEST_THEME, 1 / 60, false)

    expect(signals.damageProgress).toBe(0)
    expect(signals.burstSequence).toBe(1)
    expect(signals.burstStrength).toBeCloseTo(0.72)
    expect(state.burstEnergy).toBeGreaterThan(0)
    expect(activeMotifCount(state.motifData)).toBeGreaterThan(0)
  })

  it('keeps damage monotonic and emits only real break sequences', () => {
    const signals = createSquishyVisualSignals()

    writeSquishyVisualSignals(signals, 0.4, 8, 100, 0)
    expect(signals).toMatchObject({
      pressStrength: 0.4,
      damageProgress: 0.08,
      burstSequence: 0,
    })

    writeSquishyVisualSignals(signals, 0, 6, 100, 0)
    expect(signals.damageProgress).toBeCloseTo(0.08)
    expect(signals.burstSequence).toBe(0)

    writeSquishyVisualSignals(signals, 0, 10, 100, 2)
    expect(signals.damageProgress).toBeCloseTo(0.1)
    expect(signals.burstSequence).toBe(1)
    expect(signals.burstStrength).toBeCloseTo(2 / 3)
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

  it('selects deterministic distinct color pairs without immediate repeats', () => {
    const firstSignals = createSquishyVisualSignals()
    const secondSignals = createSquishyVisualSignals()
    const firstState = createSynesthesiaAnimationState()
    const secondState = createSynesthesiaAnimationState()
    const observedPairs: string[] = []

    for (let step = 0; step < 55; step += 1) {
      stepSynesthesiaAnimation(
        firstState,
        firstSignals,
        COLOR_LOOP_THEME,
        0.1,
        false,
      )
      stepSynesthesiaAnimation(
        secondState,
        secondSignals,
        COLOR_LOOP_THEME,
        0.1,
        false,
      )
      expect(firstState.leadingColorIndex).toBe(
        secondState.leadingColorIndex,
      )
      expect(firstState.complementaryColorIndex).toBe(
        secondState.complementaryColorIndex,
      )
      expect(firstState.leadingColorIndex).not.toBe(
        firstState.complementaryColorIndex,
      )
      const pair = `${firstState.leadingColorIndex}:${firstState.complementaryColorIndex}`
      if (observedPairs.at(-1) !== pair) {
        observedPairs.push(pair)
      }
    }

    expect(observedPairs.length).toBeGreaterThan(4)
    for (let index = 1; index < observedPairs.length; index += 1) {
      expect(observedPairs[index]).not.toBe(observedPairs[index - 1])
    }
  })

  it('keeps palette interpolation continuous across flow loops', () => {
    const signals = createSquishyVisualSignals()
    const state = createSynesthesiaAnimationState()
    stepSynesthesiaAnimation(state, signals, COLOR_LOOP_THEME, 0, false)
    const expectedLeading = state.nextLeadingColorIndex
    const expectedComplementary = state.nextComplementaryColorIndex

    while (state.colorCycle === 0) {
      stepSynesthesiaAnimation(
        state,
        signals,
        COLOR_LOOP_THEME,
        0.1,
        false,
      )
    }

    expect(state.leadingColorIndex).toBe(expectedLeading)
    expect(state.complementaryColorIndex).toBe(expectedComplementary)
    expect(state.colorMix).toBeGreaterThanOrEqual(0)
    expect(state.colorMix).toBeLessThan(0.04)
  })

  it('freezes the seeded palette under reduced motion', () => {
    const signals = createSquishyVisualSignals()
    const state = createSynesthesiaAnimationState()
    stepSynesthesiaAnimation(state, signals, COLOR_LOOP_THEME, 0.1, true)
    const initialPair = [
      state.leadingColorIndex,
      state.complementaryColorIndex,
      state.nextLeadingColorIndex,
      state.nextComplementaryColorIndex,
    ]

    for (let step = 0; step < 20; step += 1) {
      stepSynesthesiaAnimation(
        state,
        signals,
        COLOR_LOOP_THEME,
        0.1,
        true,
      )
    }

    expect(state.flowTime).toBe(0)
    expect(state.colorMix).toBe(0)
    expect([
      state.leadingColorIndex,
      state.complementaryColorIndex,
      state.nextLeadingColorIndex,
      state.nextComplementaryColorIndex,
    ]).toEqual(initialPair)
  })

  it('fades crack energy and motifs back to idle in two seconds', () => {
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

    for (let step = 0; step < 20; step += 1) {
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
      burstSequence: 0,
      burstStrength: 0,
    })
    expect(resetState.flowSpeed).toBe(1)
    expect(resetState.flowTime).toBe(0)
    expect(activeMotifCount(resetState.motifData)).toBe(0)
  })
})
