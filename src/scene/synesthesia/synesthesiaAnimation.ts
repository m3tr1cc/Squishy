const UINT32_MAX = 0xffffffff

export const SYNESTHESIA_MOTIF_SLOT_COUNT = 6
export const SYNESTHESIA_MOTIF_STRIDE = 4
export const SYNESTHESIA_MOTIF_LIFETIME_SECONDS = 2
export const SYNESTHESIA_BURST_HALF_LIFE_SECONDS = 0.35

export type SynesthesiaTheme = Readonly<{
  leadingColor: string
  complementaryColor: string
  shadowColor: string
  seed: number
  idleSpeed: number
  maximumMotifs: number
  colorLoop?: Readonly<{
    colors: readonly string[]
  }>
}>

export type SynesthesiaPaletteEntry = Readonly<{
  leadingColor: string
  complementaryColor: string
}>

export type SquishyVisualSignals = {
  pressStrength: number
  damageProgress: number
  burstSequence: number
  burstStrength: number
}

export type SquishyVisualSignalMixer = {
  readonly combinedSignals: SquishyVisualSignals
  readonly observedBurstSequences: Uint32Array
}

export type SynesthesiaAnimationState = {
  elapsedSeconds: number
  flowTime: number
  flowSpeed: number
  burstEnergy: number
  damageProgress: number
  observedBurstSequence: number
  motifCursor: number
  colorCycle: number
  leadingColorIndex: number
  complementaryColorIndex: number
  nextLeadingColorIndex: number
  nextComplementaryColorIndex: number
  colorMix: number
  readonly motifData: Float32Array
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function assertHexColor(value: string, label: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`${label} must be a six-digit hex color`)
  }
}

function hashUint32(value: number) {
  let hash = value >>> 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

export function createSynesthesiaTheme(
  theme: SynesthesiaTheme,
): SynesthesiaTheme {
  assertHexColor(theme.leadingColor, 'leadingColor')
  assertHexColor(theme.complementaryColor, 'complementaryColor')
  assertHexColor(theme.shadowColor, 'shadowColor')
  if (!Number.isFinite(theme.idleSpeed) || theme.idleSpeed <= 0) {
    throw new Error('idleSpeed must be greater than zero')
  }
  if (
    !Number.isInteger(theme.maximumMotifs) ||
    theme.maximumMotifs < 1 ||
    theme.maximumMotifs > SYNESTHESIA_MOTIF_SLOT_COUNT
  ) {
    throw new Error(
      `maximumMotifs must be between 1 and ${SYNESTHESIA_MOTIF_SLOT_COUNT}`,
    )
  }

  let colorLoop: SynesthesiaTheme['colorLoop']
  if (theme.colorLoop) {
    if (theme.colorLoop.colors.length < 2) {
      throw new Error('colorLoop.colors must include at least two colors')
    }
    for (const color of theme.colorLoop.colors) {
      assertHexColor(color, 'colorLoop color')
    }
    colorLoop = Object.freeze({
      colors: Object.freeze([...theme.colorLoop.colors]),
    })
  }

  return Object.freeze({
    ...theme,
    seed: theme.seed >>> 0,
    ...(colorLoop ? { colorLoop } : {}),
  })
}

export function createSynesthesiaThemeFromPalette(
  palette: readonly SynesthesiaPaletteEntry[],
  options: Readonly<{
    shadowColor: string
    seed: number
    idleSpeed: number
    maximumMotifs: number
  }>,
) {
  if (palette.length === 0) {
    throw new Error('Synesthesia palette must include at least one entry')
  }
  const normalizedSeed = options.seed >>> 0
  const paletteIndex = hashUint32(normalizedSeed) % palette.length
  const selected = palette[paletteIndex]

  return createSynesthesiaTheme({
    leadingColor: selected.leadingColor,
    complementaryColor: selected.complementaryColor,
    shadowColor: options.shadowColor,
    seed: hashUint32(normalizedSeed ^ 0xa53c9e17),
    idleSpeed: options.idleSpeed,
    maximumMotifs: options.maximumMotifs,
  })
}

export function createSquishyVisualSignals(): SquishyVisualSignals {
  return {
    pressStrength: 0,
    damageProgress: 0,
    burstSequence: 0,
    burstStrength: 0,
  }
}

export function createSquishyVisualSignalSources(count: number) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Visual signal source count must be at least one')
  }
  return Array.from(
    { length: count },
    createSquishyVisualSignals,
  )
}

export function createSquishyVisualSignalMixer(
  sourceCount: number,
): SquishyVisualSignalMixer {
  if (!Number.isInteger(sourceCount) || sourceCount < 1) {
    throw new Error('Visual signal source count must be at least one')
  }
  return {
    combinedSignals: createSquishyVisualSignals(),
    observedBurstSequences: new Uint32Array(sourceCount),
  }
}

export function mixSquishyVisualSignals(
  mixer: SquishyVisualSignalMixer,
  sources: readonly SquishyVisualSignals[],
) {
  if (sources.length !== mixer.observedBurstSequences.length) {
    throw new Error('Visual signal source count changed after initialization')
  }

  let pressStrength = 0
  let damageProgress = 0
  let burstStrength = 0
  let hasNewBurst = false

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]
    pressStrength = Math.max(pressStrength, source.pressStrength)
    damageProgress += source.damageProgress
    if (
      source.burstSequence !==
      mixer.observedBurstSequences[index]
    ) {
      mixer.observedBurstSequences[index] = source.burstSequence
      burstStrength = Math.max(
        burstStrength,
        source.burstStrength,
      )
      hasNewBurst = true
    }
  }

  const combined = mixer.combinedSignals
  combined.pressStrength = pressStrength
  combined.damageProgress = damageProgress / sources.length
  if (hasNewBurst) {
    combined.burstSequence += 1
    combined.burstStrength = burstStrength
  }
  return combined
}

export function writeSquishyVisualSignals(
  signals: SquishyVisualSignals,
  pressStrength: number,
  brokenBondCount: number,
  totalBondCount: number,
  newlyBrokenBondCount: number,
) {
  signals.pressStrength = clamp01(pressStrength)
  const nextDamage =
    totalBondCount > 0
      ? clamp01(brokenBondCount / totalBondCount)
      : 0
  signals.damageProgress = Math.max(
    signals.damageProgress,
    nextDamage,
  )

  if (newlyBrokenBondCount > 0) {
    emitSynesthesiaBurst(signals, newlyBrokenBondCount / 3)
  }
}

export function emitSynesthesiaBurst(
  signals: SquishyVisualSignals,
  strength: number,
) {
  signals.burstSequence += 1
  signals.burstStrength = clamp01(strength)
}

export function createSynesthesiaAnimationState():
  SynesthesiaAnimationState {
  return {
    elapsedSeconds: 0,
    flowTime: 0,
    flowSpeed: 1,
    burstEnergy: 0,
    damageProgress: 0,
    observedBurstSequence: 0,
    motifCursor: 0,
    colorCycle: -1,
    leadingColorIndex: 0,
    complementaryColorIndex: 1,
    nextLeadingColorIndex: 0,
    nextComplementaryColorIndex: 1,
    colorMix: 0,
    motifData: new Float32Array(
      SYNESTHESIA_MOTIF_SLOT_COUNT *
        SYNESTHESIA_MOTIF_STRIDE,
    ),
  }
}

function selectRawLeadingColorIndex(
  theme: SynesthesiaTheme,
  cycle: number,
) {
  const colorCount = theme.colorLoop?.colors.length ?? 0
  return (
    hashUint32(
      theme.seed ^ Math.imul(cycle + 1, 0x9e3779b1),
    ) % colorCount
  )
}

function selectRawComplementaryColorIndex(
  theme: SynesthesiaTheme,
  cycle: number,
  leadingColorIndex: number,
) {
  const colorCount = theme.colorLoop?.colors.length ?? 0
  const complementaryCandidate =
    hashUint32(
      theme.seed ^ Math.imul(cycle + 1, 0x85ebca6b),
    ) %
    (colorCount - 1)
  const complementaryColorIndex =
    complementaryCandidate >= leadingColorIndex
      ? complementaryCandidate + 1
      : complementaryCandidate
  return complementaryColorIndex
}

function writeNextColorPair(
  state: SynesthesiaAnimationState,
  theme: SynesthesiaTheme,
  cycle: number,
) {
  const leadingColorIndex = selectRawLeadingColorIndex(theme, cycle)
  let complementaryColorIndex = selectRawComplementaryColorIndex(
    theme,
    cycle,
    leadingColorIndex,
  )
  if (
    leadingColorIndex === state.leadingColorIndex &&
    complementaryColorIndex === state.complementaryColorIndex
  ) {
    complementaryColorIndex =
      (complementaryColorIndex + 1) %
      theme.colorLoop!.colors.length
    if (complementaryColorIndex === leadingColorIndex) {
      complementaryColorIndex =
        (complementaryColorIndex + 1) %
        theme.colorLoop!.colors.length
    }
  }
  state.nextLeadingColorIndex = leadingColorIndex
  state.nextComplementaryColorIndex = complementaryColorIndex
}

function updateSynesthesiaColorLoop(
  state: SynesthesiaAnimationState,
  theme: SynesthesiaTheme,
) {
  if (!theme.colorLoop) {
    return
  }

  if (state.colorCycle < 0) {
    state.leadingColorIndex = selectRawLeadingColorIndex(theme, 0)
    state.complementaryColorIndex =
      selectRawComplementaryColorIndex(
        theme,
        0,
        state.leadingColorIndex,
      )
    writeNextColorPair(state, theme, 1)
    state.colorCycle = 0
  }

  const targetCycle = Math.floor(state.flowTime)
  while (state.colorCycle < targetCycle) {
    state.leadingColorIndex = state.nextLeadingColorIndex
    state.complementaryColorIndex =
      state.nextComplementaryColorIndex
    state.colorCycle += 1
    writeNextColorPair(
      state,
      theme,
      state.colorCycle + 1,
    )
  }

  const fraction = state.flowTime - targetCycle
  state.colorMix = fraction * fraction * (3 - 2 * fraction)
}

function clearExpiredMotifs(state: SynesthesiaAnimationState) {
  for (
    let slot = 0;
    slot < SYNESTHESIA_MOTIF_SLOT_COUNT;
    slot += 1
  ) {
    const offset = slot * SYNESTHESIA_MOTIF_STRIDE
    const strength = state.motifData[offset + 2]
    if (
      strength > 0 &&
      state.elapsedSeconds - state.motifData[offset + 1] >
        SYNESTHESIA_MOTIF_LIFETIME_SECONDS
    ) {
      state.motifData[offset + 2] = 0
    }
  }
}

function activateMotifs(
  state: SynesthesiaAnimationState,
  theme: SynesthesiaTheme,
  sequence: number,
  strength: number,
) {
  const count = Math.min(3, 1 + Math.floor(strength * 2))
  for (let motifIndex = 0; motifIndex < count; motifIndex += 1) {
    const slot = state.motifCursor
    const offset = slot * SYNESTHESIA_MOTIF_STRIDE
    const seed = hashUint32(
      theme.seed ^
        Math.imul(sequence + 1, 0x9e3779b1) ^
        Math.imul(motifIndex + 1, 0x85ebca6b),
    )
    state.motifData[offset] = seed / UINT32_MAX
    state.motifData[offset + 1] = state.elapsedSeconds
    state.motifData[offset + 2] = strength
    state.motifData[offset + 3] = seed % 3
    state.motifCursor = (slot + 1) % theme.maximumMotifs
  }
}

export function stepSynesthesiaAnimation(
  state: SynesthesiaAnimationState,
  signals: SquishyVisualSignals,
  theme: SynesthesiaTheme,
  deltaSeconds: number,
  reducedMotion: boolean,
) {
  const delta = Math.min(0.1, Math.max(0, deltaSeconds))
  state.damageProgress = clamp01(signals.damageProgress)

  if (reducedMotion) {
    state.flowSpeed = 0
    state.burstEnergy = 0
    state.observedBurstSequence = signals.burstSequence
    state.motifData.fill(0)
    updateSynesthesiaColorLoop(state, theme)
    return
  }

  state.elapsedSeconds += delta
  const sequenceChanged =
    signals.burstSequence !== state.observedBurstSequence
  if (sequenceChanged) {
    const strength = clamp01(signals.burstStrength)
    state.observedBurstSequence = signals.burstSequence
    state.burstEnergy = Math.max(state.burstEnergy, strength)
    activateMotifs(
      state,
      theme,
      signals.burstSequence,
      strength,
    )
  }

  state.burstEnergy *= Math.pow(
    0.5,
    delta / SYNESTHESIA_BURST_HALF_LIFE_SECONDS,
  )
  state.flowSpeed =
    1 +
    state.damageProgress * 1.25 +
    clamp01(signals.pressStrength) * 0.5 +
    state.burstEnergy * 1.75
  state.flowTime += delta * theme.idleSpeed * state.flowSpeed
  updateSynesthesiaColorLoop(state, theme)
  clearExpiredMotifs(state)
}
