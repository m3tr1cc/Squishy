export type SlimeTrackIndex = 0 | 1 | 2

export type SlimeShuffleBagState = Readonly<{
  rngState: number
  bag: readonly SlimeTrackIndex[]
  cursor: number
  lastTrack: SlimeTrackIndex | null
}>

const TRACK_INDICES: readonly SlimeTrackIndex[] = [0, 1, 2]
const UINT32_RANGE = 0x100000000
const MULBERRY_INCREMENT = 0x6d2b79f5

function nextRandom(rngState: number) {
  const nextState = (rngState + MULBERRY_INCREMENT) >>> 0
  let value = nextState
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return {
    value: ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE,
    rngState: nextState,
  }
}

function refillBag(
  rngState: number,
  lastTrack: SlimeTrackIndex | null,
) {
  const bag = [...TRACK_INDICES]
  let nextRngState = rngState
  for (let cursor = bag.length - 1; cursor > 0; cursor -= 1) {
    const random = nextRandom(nextRngState)
    nextRngState = random.rngState
    const swapIndex = Math.floor(random.value * (cursor + 1))
    const temporary = bag[cursor]
    bag[cursor] = bag[swapIndex]
    bag[swapIndex] = temporary
  }
  if (lastTrack !== null && bag[0] === lastTrack) {
    const random = nextRandom(nextRngState)
    nextRngState = random.rngState
    const swapIndex = 1 + Math.floor(random.value * 2)
    const temporary = bag[0]
    bag[0] = bag[swapIndex]
    bag[swapIndex] = temporary
  }
  return {
    bag: bag as readonly SlimeTrackIndex[],
    rngState: nextRngState,
  }
}

export function createSlimeShuffleBag(seed: number): SlimeShuffleBagState {
  const refill = refillBag(seed >>> 0, null)
  return {
    rngState: refill.rngState,
    bag: refill.bag,
    cursor: 0,
    lastTrack: null,
  }
}

export function drawSlimeTrack(state: SlimeShuffleBagState) {
  const refill =
    state.cursor >= state.bag.length
      ? refillBag(state.rngState, state.lastTrack)
      : null
  const bag = refill?.bag ?? state.bag
  const cursor = refill ? 0 : state.cursor
  const trackIndex = bag[cursor]
  return {
    trackIndex,
    state: {
      rngState: refill?.rngState ?? state.rngState,
      bag,
      cursor: cursor + 1,
      lastTrack: trackIndex,
    } satisfies SlimeShuffleBagState,
  }
}
