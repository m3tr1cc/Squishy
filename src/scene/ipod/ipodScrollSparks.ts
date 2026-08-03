import {
  getResponsiveIpodCameraPose,
  IPOD_MINI_BODY,
  IPOD_PRESENTATION_SCALE,
} from './ipodDefinition'

const UINT32_MAX = 0xffffffff
const IPOD_CAMERA_FOV_DEGREES = 32
const SPARK_STYLE_STRIDE = 4
const SPARK_CENTER_STRIDE = 2
const SPARK_MOTION_STRIDE = 4

export const IPOD_SCROLL_SPARK_CAPACITY = 32
export const IPOD_SCROLL_SPARK_LIFETIME_SECONDS = 1

export type IpodScrollSparkSignals = {
  sequence: number
}

export type IpodScrollSparkSafeRect = Readonly<{
  minX: number
  maxX: number
  minY: number
  maxY: number
}>

export type IpodScrollSparkState = {
  elapsedSeconds: number
  observedSequence: number
  cursor: number
  activeCount: number
  emittedCount: number
  recycledCount: number
  readonly centers: Float32Array
  readonly motion: Float32Array
  readonly style: Float32Array
  readonly sequences: Float64Array
  readonly active: Uint8Array
  readonly placementBounds: Float64Array
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

function randomUnit(seed: number, sequence: number, channel: number) {
  return (
    hashUint32(
      seed ^
        Math.imul(sequence + 1, 0x9e3779b1) ^
        Math.imul(channel + 1, 0x85ebca6b),
    ) / UINT32_MAX
  )
}

export function createIpodScrollSparkSignals(): IpodScrollSparkSignals {
  return { sequence: 0 }
}

export function emitIpodScrollSparks(
  signals: IpodScrollSparkSignals,
  count = 1,
) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('Scroll spark count must be a non-negative integer')
  }
  signals.sequence += count
}

export function createIpodScrollSparkState(): IpodScrollSparkState {
  return {
    elapsedSeconds: 0,
    observedSequence: 0,
    cursor: 0,
    activeCount: 0,
    emittedCount: 0,
    recycledCount: 0,
    centers: new Float32Array(
      IPOD_SCROLL_SPARK_CAPACITY * SPARK_CENTER_STRIDE,
    ),
    motion: new Float32Array(
      IPOD_SCROLL_SPARK_CAPACITY * SPARK_MOTION_STRIDE,
    ),
    style: new Float32Array(
      IPOD_SCROLL_SPARK_CAPACITY * SPARK_STYLE_STRIDE,
    ),
    sequences: new Float64Array(IPOD_SCROLL_SPARK_CAPACITY),
    active: new Uint8Array(IPOD_SCROLL_SPARK_CAPACITY),
    placementBounds: new Float64Array(10),
  }
}

function writeIpodScrollSparkPlacementBounds(
  target: Float64Array,
  width: number,
  height: number,
  sizePixels: number,
) {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const aspect = safeWidth / safeHeight
  const tangent = Math.tan((IPOD_CAMERA_FOV_DEGREES * Math.PI) / 360)
  const fitWidth = 1.02 / (tangent * aspect)
  const fitHeight = 1.72 / tangent
  const cameraDistance = Math.max(fitWidth, fitHeight) + 0.52
  const verticalHalfView = cameraDistance * tangent
  const halfWidth = Math.min(
    0.46,
    (IPOD_MINI_BODY.width * IPOD_PRESENTATION_SCALE) /
      (4 * verticalHalfView * aspect) +
      0.035,
  )
  const halfHeight = Math.min(
    0.47,
    (IPOD_MINI_BODY.height * IPOD_PRESENTATION_SCALE) /
      (4 * verticalHalfView) +
      0.035,
  )
  const radiusX = (sizePixels * 0.58 + 5) / safeWidth
  const radiusY = (sizePixels * 0.58 + 5) / safeHeight

  target[0] = 0.5 - halfWidth
  target[1] = 0.5 + halfWidth
  target[2] = 0.5 - halfHeight
  target[3] = 0.5 + halfHeight
  target[4] = Math.max(0.7, 1 - 126 / safeWidth)
  target[5] = 1
  target[6] = Math.max(0.82, 1 - 82 / safeHeight)
  target[7] = 1
  target[8] = radiusX
  target[9] = radiusY
}

export function getIpodScrollSparkSafeRect(
  width: number,
  height: number,
): IpodScrollSparkSafeRect {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const aspect = safeWidth / safeHeight
  const pose = getResponsiveIpodCameraPose(
    safeWidth,
    safeHeight,
    IPOD_CAMERA_FOV_DEGREES,
  )
  const verticalHalfView =
    pose.position[2] *
    Math.tan((IPOD_CAMERA_FOV_DEGREES * Math.PI) / 360)
  const halfWidth = Math.min(
    0.46,
    (IPOD_MINI_BODY.width * IPOD_PRESENTATION_SCALE) /
      (4 * verticalHalfView * aspect) +
      0.035,
  )
  const halfHeight = Math.min(
    0.47,
    (IPOD_MINI_BODY.height * IPOD_PRESENTATION_SCALE) /
      (4 * verticalHalfView) +
      0.035,
  )

  return {
    minX: 0.5 - halfWidth,
    maxX: 0.5 + halfWidth,
    minY: 0.5 - halfHeight,
    maxY: 0.5 + halfHeight,
  }
}

function isInsideExpandedRect(
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  rect: IpodScrollSparkSafeRect,
) {
  return (
    x + radiusX >= rect.minX &&
    x - radiusX <= rect.maxX &&
    y + radiusY >= rect.minY &&
    y - radiusY <= rect.maxY
  )
}

export function isIpodScrollSparkPlacementVisible(
  x: number,
  y: number,
  sizePixels: number,
  width: number,
  height: number,
) {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const radiusX = (sizePixels * 0.58 + 5) / safeWidth
  const radiusY = (sizePixels * 0.58 + 5) / safeHeight
  const bodyRect = getIpodScrollSparkSafeRect(safeWidth, safeHeight)
  const navigationRect = {
    minX: Math.max(0.7, 1 - 126 / safeWidth),
    maxX: 1,
    minY: Math.max(0.82, 1 - 82 / safeHeight),
    maxY: 1,
  }

  return (
    x >= radiusX &&
    x <= 1 - radiusX &&
    y >= radiusY &&
    y <= 1 - radiusY &&
    !isInsideExpandedRect(
      x,
      y,
      radiusX,
      radiusY,
      bodyRect,
    ) &&
    !isInsideExpandedRect(
      x,
      y,
      radiusX,
      radiusY,
      navigationRect,
    )
  )
}

function writeSparkPlacement(
  state: IpodScrollSparkState,
  slot: number,
  seed: number,
  sequence: number,
  sizePixels: number,
  width: number,
  height: number,
) {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  writeIpodScrollSparkPlacementBounds(
    state.placementBounds,
    safeWidth,
    safeHeight,
    sizePixels,
  )
  const bounds = state.placementBounds
  const radiusX = bounds[8]
  const radiusY = bounds[9]
  let x = 0
  let y = 0
  let found = false

  for (let attempt = 0; attempt < 20; attempt += 1) {
    x =
      radiusX +
      randomUnit(seed, sequence, 20 + attempt * 2) *
        (1 - radiusX * 2)
    y =
      radiusY +
      randomUnit(seed, sequence, 21 + attempt * 2) *
        (1 - radiusY * 2)
    const overlapsBody =
      x + radiusX >= bounds[0] &&
      x - radiusX <= bounds[1] &&
      y + radiusY >= bounds[2] &&
      y - radiusY <= bounds[3]
    const overlapsNavigation =
      x + radiusX >= bounds[4] &&
      x - radiusX <= bounds[5] &&
      y + radiusY >= bounds[6] &&
      y - radiusY <= bounds[7]
    if (!overlapsBody && !overlapsNavigation) {
      found = true
      break
    }
  }

  if (!found) {
    const placeOnLeft = sequence % 2 === 0
    x = placeOnLeft
      ? Math.max(radiusX, bounds[0] - radiusX - 0.015)
      : Math.min(1 - radiusX, bounds[1] + radiusX + 0.015)
    y = Math.min(
      1 - radiusY,
      Math.max(
        radiusY,
        0.16 + randomUnit(seed, sequence, 63) * 0.64,
      ),
    )
  }

  const centerOffset = slot * SPARK_CENTER_STRIDE
  state.centers[centerOffset] = x
  state.centers[centerOffset + 1] = y
}

function activateSpark(
  state: IpodScrollSparkState,
  seed: number,
  sequence: number,
  width: number,
  height: number,
) {
  const slot = state.cursor
  const styleOffset = slot * SPARK_STYLE_STRIDE
  const motionOffset = slot * SPARK_MOTION_STRIDE
  const minimumDimension = Math.min(Math.max(1, width), Math.max(1, height))
  const sizePixels = Math.min(
    68,
    Math.max(
      22,
      minimumDimension *
        (0.057 + randomUnit(seed, sequence, 2) * 0.043),
    ),
  )

  if (state.active[slot] === 1) {
    state.recycledCount += 1
  } else {
    state.activeCount += 1
  }
  state.active[slot] = 1
  state.sequences[slot] = sequence
  writeSparkPlacement(
    state,
    slot,
    seed,
    sequence,
    sizePixels,
    width,
    height,
  )
  state.motion[motionOffset] =
    (randomUnit(seed, sequence, 4) * 2 - 1) * 34
  state.motion[motionOffset + 1] =
    (randomUnit(seed, sequence, 5) * 2 - 1) * 28
  state.motion[motionOffset + 2] =
    randomUnit(seed, sequence, 6) * Math.PI * 2
  state.motion[motionOffset + 3] =
    (randomUnit(seed, sequence, 7) * 2 - 1) * 1.25
  state.style[styleOffset] = state.elapsedSeconds
  state.style[styleOffset + 1] = sizePixels
  state.style[styleOffset + 2] = sequence % 2
  state.style[styleOffset + 3] =
    Math.floor((sequence - 1) / 2) % 2
  state.cursor = (slot + 1) % IPOD_SCROLL_SPARK_CAPACITY
  state.emittedCount += 1
}

function clearAllSparks(state: IpodScrollSparkState) {
  state.active.fill(0)
  state.activeCount = 0
  for (
    let slot = 0;
    slot < IPOD_SCROLL_SPARK_CAPACITY;
    slot += 1
  ) {
    state.style[slot * SPARK_STYLE_STRIDE] = -2
  }
}

function clearExpiredSparks(state: IpodScrollSparkState) {
  for (
    let slot = 0;
    slot < IPOD_SCROLL_SPARK_CAPACITY;
    slot += 1
  ) {
    if (state.active[slot] === 0) {
      continue
    }
    const startTime = state.style[slot * SPARK_STYLE_STRIDE]
    if (
      state.elapsedSeconds - startTime >=
      IPOD_SCROLL_SPARK_LIFETIME_SECONDS
    ) {
      state.active[slot] = 0
      state.style[slot * SPARK_STYLE_STRIDE] = -2
      state.activeCount -= 1
    }
  }
}

export function stepIpodScrollSparks(
  state: IpodScrollSparkState,
  signals: IpodScrollSparkSignals,
  seed: number,
  width: number,
  height: number,
  deltaSeconds: number,
  reducedMotion: boolean,
) {
  state.elapsedSeconds += Math.max(0, deltaSeconds)
  if (signals.sequence < state.observedSequence) {
    state.observedSequence = signals.sequence
  }
  const pendingCount = signals.sequence - state.observedSequence

  if (reducedMotion) {
    state.observedSequence = signals.sequence
    clearAllSparks(state)
    return 0
  }

  clearExpiredSparks(state)
  for (let offset = 1; offset <= pendingCount; offset += 1) {
    activateSpark(
      state,
      seed >>> 0,
      state.observedSequence + offset,
      width,
      height,
    )
  }
  state.observedSequence = signals.sequence
  return pendingCount
}

export function countIpodScrollSparkShapes(
  state: IpodScrollSparkState,
) {
  let stars = 0
  let blobs = 0
  for (
    let slot = 0;
    slot < IPOD_SCROLL_SPARK_CAPACITY;
    slot += 1
  ) {
    if (state.active[slot] === 0) {
      continue
    }
    if (state.style[slot * SPARK_STYLE_STRIDE + 2] < 0.5) {
      stars += 1
    } else {
      blobs += 1
    }
  }
  return { stars, blobs }
}
