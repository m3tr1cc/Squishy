export const FRAGMENT_FADE_PHASE = {
  ATTACHED: 0,
  SIMULATING: 1,
  WAITING_AFTER_SLEEP: 2,
  FADING: 3,
  RETIRED: 4,
} as const

export type FragmentFadePhase =
  (typeof FRAGMENT_FADE_PHASE)[keyof typeof FRAGMENT_FADE_PHASE]

export const DEFAULT_FRAGMENT_FADE_POLICY = {
  maximumSimulationSeconds: 1.5,
  sleepFadeDelaySeconds: 0.15,
  fadeDurationSeconds: 0.45,
} as const

export type FragmentFadePolicyOptions = Readonly<{
  maximumSimulationSeconds?: number
  sleepFadeDelaySeconds?: number
  fadeDurationSeconds?: number
}>

export type FragmentFadePolicy = Readonly<{
  maximumSimulationSeconds: number
  sleepFadeDelaySeconds: number
  fadeDurationSeconds: number
}>

/**
 * All mutable lifecycle data is stored in fixed-size typed arrays. The two
 * index buffers are caller-owned scratch: only entries below their matching
 * count belong to the current step.
 */
export type FragmentFadeState = {
  readonly fragmentCount: number
  readonly policy: FragmentFadePolicy
  readonly phase: Uint8Array
  readonly detachedAgeSeconds: Float64Array
  readonly sleepAgeSeconds: Float64Array
  readonly fadeAgeSeconds: Float64Array
  readonly alpha: Float32Array
  readonly fadeStartedIndices: Uint32Array
  readonly retiredIndices: Uint32Array
  fadeStartedCount: number
  retiredCount: number
}

function assertNonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`)
  }
}

function resolvePolicy(
  options: FragmentFadePolicyOptions,
): FragmentFadePolicy {
  const maximumSimulationSeconds =
    options.maximumSimulationSeconds ??
    DEFAULT_FRAGMENT_FADE_POLICY.maximumSimulationSeconds
  const sleepFadeDelaySeconds =
    options.sleepFadeDelaySeconds ??
    DEFAULT_FRAGMENT_FADE_POLICY.sleepFadeDelaySeconds
  const fadeDurationSeconds =
    options.fadeDurationSeconds ??
    DEFAULT_FRAGMENT_FADE_POLICY.fadeDurationSeconds

  assertNonNegativeFinite(
    maximumSimulationSeconds,
    'maximumSimulationSeconds',
  )
  assertNonNegativeFinite(
    sleepFadeDelaySeconds,
    'sleepFadeDelaySeconds',
  )
  if (
    !Number.isFinite(fadeDurationSeconds) ||
    fadeDurationSeconds <= 0
  ) {
    throw new Error('fadeDurationSeconds must be finite and greater than zero')
  }

  return {
    maximumSimulationSeconds,
    sleepFadeDelaySeconds,
    fadeDurationSeconds,
  }
}

function assertFragmentIndex(
  state: FragmentFadeState,
  fragmentIndex: number,
) {
  if (
    !Number.isInteger(fragmentIndex) ||
    fragmentIndex < 0 ||
    fragmentIndex >= state.fragmentCount
  ) {
    throw new Error(
      `fragmentIndex must be an integer between 0 and ${
        state.fragmentCount - 1
      }`,
    )
  }
}

function clampAlpha(value: number) {
  return Math.min(1, Math.max(0, value))
}

function retireFragment(
  state: FragmentFadeState,
  fragmentIndex: number,
) {
  if (
    state.phase[fragmentIndex] ===
    FRAGMENT_FADE_PHASE.RETIRED
  ) {
    return
  }

  state.phase[fragmentIndex] = FRAGMENT_FADE_PHASE.RETIRED
  state.alpha[fragmentIndex] = 0
  state.retiredIndices[state.retiredCount] = fragmentIndex
  state.retiredCount += 1
}

function beginFade(
  state: FragmentFadeState,
  fragmentIndex: number,
  elapsedFadeSeconds: number,
) {
  state.phase[fragmentIndex] = FRAGMENT_FADE_PHASE.FADING
  state.fadeAgeSeconds[fragmentIndex] = elapsedFadeSeconds
  state.fadeStartedIndices[state.fadeStartedCount] = fragmentIndex
  state.fadeStartedCount += 1

  const progress =
    elapsedFadeSeconds / state.policy.fadeDurationSeconds
  state.alpha[fragmentIndex] = clampAlpha(1 - progress)
  if (progress >= 1) {
    retireFragment(state, fragmentIndex)
  }
}

export function createFragmentFadeState(
  fragmentCount: number,
  options: FragmentFadePolicyOptions = DEFAULT_FRAGMENT_FADE_POLICY,
): FragmentFadeState {
  if (!Number.isInteger(fragmentCount) || fragmentCount < 0) {
    throw new Error('fragmentCount must be a non-negative integer')
  }

  const state: FragmentFadeState = {
    fragmentCount,
    policy: resolvePolicy(options),
    phase: new Uint8Array(fragmentCount),
    detachedAgeSeconds: new Float64Array(fragmentCount),
    sleepAgeSeconds: new Float64Array(fragmentCount),
    fadeAgeSeconds: new Float64Array(fragmentCount),
    alpha: new Float32Array(fragmentCount),
    fadeStartedIndices: new Uint32Array(fragmentCount),
    retiredIndices: new Uint32Array(fragmentCount),
    fadeStartedCount: 0,
    retiredCount: 0,
  }
  state.alpha.fill(1)
  return state
}

export function resetFragmentFadeState(state: FragmentFadeState) {
  state.phase.fill(FRAGMENT_FADE_PHASE.ATTACHED)
  state.detachedAgeSeconds.fill(0)
  state.sleepAgeSeconds.fill(0)
  state.fadeAgeSeconds.fill(0)
  state.alpha.fill(1)
  state.fadeStartedCount = 0
  state.retiredCount = 0
  return state
}

export function resetFragmentFadeFragment(
  state: FragmentFadeState,
  fragmentIndex: number,
) {
  assertFragmentIndex(state, fragmentIndex)
  state.phase[fragmentIndex] = FRAGMENT_FADE_PHASE.ATTACHED
  state.detachedAgeSeconds[fragmentIndex] = 0
  state.sleepAgeSeconds[fragmentIndex] = 0
  state.fadeAgeSeconds[fragmentIndex] = 0
  state.alpha[fragmentIndex] = 1
  return state
}

/**
 * Starts one fragment's detached lifecycle. Repeated calls do not rewind an
 * already detached, fading, or retired fragment.
 */
export function detachFragmentForFade(
  state: FragmentFadeState,
  fragmentIndex: number,
) {
  assertFragmentIndex(state, fragmentIndex)
  if (
    state.phase[fragmentIndex] !==
    FRAGMENT_FADE_PHASE.ATTACHED
  ) {
    return state
  }

  state.phase[fragmentIndex] = FRAGMENT_FADE_PHASE.SIMULATING
  state.detachedAgeSeconds[fragmentIndex] = 0
  state.sleepAgeSeconds[fragmentIndex] = 0
  state.fadeAgeSeconds[fragmentIndex] = 0
  state.alpha[fragmentIndex] = 1
  return state
}

/**
 * Records Rapier's sleeping decision. Sleeping fragments retain full opacity
 * for the configured delay, then fade without resuming simulation.
 */
export function markFragmentSleepingForFade(
  state: FragmentFadeState,
  fragmentIndex: number,
) {
  assertFragmentIndex(state, fragmentIndex)
  if (
    state.phase[fragmentIndex] ===
    FRAGMENT_FADE_PHASE.SIMULATING
  ) {
    state.phase[fragmentIndex] =
      FRAGMENT_FADE_PHASE.WAITING_AFTER_SLEEP
    state.sleepAgeSeconds[fragmentIndex] = 0
  }
  return state
}

export function shouldSimulateFragment(
  state: FragmentFadeState,
  fragmentIndex: number,
) {
  assertFragmentIndex(state, fragmentIndex)
  return (
    state.phase[fragmentIndex] ===
    FRAGMENT_FADE_PHASE.SIMULATING
  )
}

export function isFragmentRetired(
  state: FragmentFadeState,
  fragmentIndex: number,
) {
  assertFragmentIndex(state, fragmentIndex)
  return (
    state.phase[fragmentIndex] ===
    FRAGMENT_FADE_PHASE.RETIRED
  )
}

/**
 * Advances every active fragment without creating arrays, event objects, or
 * callbacks. Large deltas carry their overshoot through policy boundaries, so
 * the result is deterministic for regular and irregular frame partitions.
 */
export function stepFragmentFade(
  state: FragmentFadeState,
  deltaSeconds: number,
  reducedMotion: boolean,
) {
  assertNonNegativeFinite(deltaSeconds, 'deltaSeconds')
  state.fadeStartedCount = 0
  state.retiredCount = 0

  for (
    let fragmentIndex = 0;
    fragmentIndex < state.fragmentCount;
    fragmentIndex += 1
  ) {
    const phase = state.phase[fragmentIndex] as FragmentFadePhase
    if (
      phase === FRAGMENT_FADE_PHASE.ATTACHED ||
      phase === FRAGMENT_FADE_PHASE.RETIRED
    ) {
      continue
    }

    if (reducedMotion) {
      retireFragment(state, fragmentIndex)
      continue
    }

    state.detachedAgeSeconds[fragmentIndex] += deltaSeconds

    if (phase === FRAGMENT_FADE_PHASE.SIMULATING) {
      const fadeOvershoot =
        state.detachedAgeSeconds[fragmentIndex] -
        state.policy.maximumSimulationSeconds
      if (fadeOvershoot >= 0) {
        beginFade(state, fragmentIndex, fadeOvershoot)
      }
      continue
    }

    if (
      phase === FRAGMENT_FADE_PHASE.WAITING_AFTER_SLEEP
    ) {
      state.sleepAgeSeconds[fragmentIndex] += deltaSeconds
      const fadeOvershoot =
        state.sleepAgeSeconds[fragmentIndex] -
        state.policy.sleepFadeDelaySeconds
      if (fadeOvershoot >= 0) {
        beginFade(state, fragmentIndex, fadeOvershoot)
      }
      continue
    }

    const nextFadeAge =
      state.fadeAgeSeconds[fragmentIndex] + deltaSeconds
    state.fadeAgeSeconds[fragmentIndex] = nextFadeAge
    const progress =
      nextFadeAge / state.policy.fadeDurationSeconds
    state.alpha[fragmentIndex] = clampAlpha(1 - progress)
    if (progress >= 1) {
      retireFragment(state, fragmentIndex)
    }
  }

  return state
}
