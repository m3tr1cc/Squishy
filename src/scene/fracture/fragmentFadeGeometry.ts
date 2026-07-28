import * as THREE from 'three'

function clampAlpha(value: number) {
  return Math.min(1, Math.max(0, value))
}

function assertFiniteAlpha(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error('alpha must be finite')
  }
}

/**
 * Adds the RGBA color attribute consumed by Three materials with
 * `vertexColors` enabled. Enabling `alphaHash` on those materials provides a
 * depth-writing fade without transparent-object sorting.
 *
 * This helper allocates only while attaching the attribute. Per-frame range
 * writes are handled by `writeFragmentFadeColorAlpha`.
 */
export function attachFragmentFadeColorAttribute(
  geometry: THREE.BufferGeometry,
  initialAlpha = 1,
) {
  assertFiniteAlpha(initialAlpha)
  const positions = geometry.getAttribute('position')
  if (!positions) {
    throw new Error('Fragment geometry requires a position attribute')
  }

  const existing = geometry.getAttribute('color')
  const colors = new Float32Array(positions.count * 4)
  const safeAlpha = clampAlpha(initialAlpha)

  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const offset = vertex * 4
    colors[offset] = existing ? existing.getX(vertex) : 1
    colors[offset + 1] = existing ? existing.getY(vertex) : 1
    colors[offset + 2] = existing ? existing.getZ(vertex) : 1
    colors[offset + 3] = safeAlpha
  }

  const attribute = new THREE.Float32BufferAttribute(colors, 4)
  attribute.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('color', attribute)
  return attribute
}

/**
 * Updates one contiguous fragment vertex range in place. Setting
 * `needsUpdate` uploads the existing buffer and does not allocate update-range
 * objects in the animation loop.
 */
export function writeFragmentFadeColorAlpha(
  attribute: THREE.BufferAttribute,
  vertexStart: number,
  vertexCount: number,
  alpha: number,
) {
  if (attribute.itemSize !== 4) {
    throw new Error('Fragment fade colors must be an RGBA attribute')
  }
  if (
    !Number.isInteger(vertexStart) ||
    vertexStart < 0 ||
    !Number.isInteger(vertexCount) ||
    vertexCount < 0 ||
    vertexStart + vertexCount > attribute.count
  ) {
    throw new Error('Fragment fade vertex range is out of bounds')
  }
  assertFiniteAlpha(alpha)
  if (vertexCount === 0) {
    return attribute
  }

  const safeAlpha = clampAlpha(alpha)
  const end = vertexStart + vertexCount
  for (let vertex = vertexStart; vertex < end; vertex += 1) {
    attribute.setW(vertex, safeAlpha)
  }
  attribute.needsUpdate = true
  return attribute
}
