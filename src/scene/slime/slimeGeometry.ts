import * as THREE from 'three'

export const SLIME_CONTAINER_RADIUS = 2.32
export const SLIME_INNER_RADIUS = 2.08
export const SLIME_CONTAINER_HEIGHT = 2.62
export const SLIME_CONTAINER_BASE_Y = -1.38
export const SLIME_RIM_Y = 1.24
export const SLIME_CROWN_Y = 1.71
export const SLIME_TRIANGLE_BUDGET = 12_000
export const SLIME_DRAW_CALL_BUDGET = 10

const RADIAL_SEGMENTS = 64
const WALL_SEGMENTS = 8
const DOME_SEGMENTS = 14

function removeDegenerateTriangles(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const index = geometry.getIndex()
  if (!index) {
    return
  }
  const retained: number[] = []
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset)
    const b = index.getX(offset + 1)
    const c = index.getX(offset + 2)
    const abX = positions.getX(b) - positions.getX(a)
    const abY = positions.getY(b) - positions.getY(a)
    const abZ = positions.getZ(b) - positions.getZ(a)
    const acX = positions.getX(c) - positions.getX(a)
    const acY = positions.getY(c) - positions.getY(a)
    const acZ = positions.getZ(c) - positions.getZ(a)
    const crossX = abY * acZ - abZ * acY
    const crossY = abZ * acX - abX * acZ
    const crossZ = abX * acY - abY * acX
    if (crossX * crossX + crossY * crossY + crossZ * crossZ > 1e-14) {
      retained.push(a, b, c)
    }
  }
  geometry.setIndex(retained)
}

export type SlimeGeometrySources = Readonly<{
  positions: Float32Array
  colors: Float32Array
}>

export function createSlimeGeometry() {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0, SLIME_CONTAINER_BASE_Y + 0.08),
    new THREE.Vector2(
      SLIME_INNER_RADIUS - 0.06,
      SLIME_CONTAINER_BASE_Y + 0.08,
    ),
  ]

  for (let index = 1; index <= WALL_SEGMENTS; index += 1) {
    const progress = index / WALL_SEGMENTS
    const y = THREE.MathUtils.lerp(
      SLIME_CONTAINER_BASE_Y + 0.08,
      SLIME_RIM_Y - 0.08,
      progress,
    )
    const radius =
      SLIME_INNER_RADIUS -
      0.055 +
      Math.sin(progress * Math.PI) * 0.035
    profile.push(new THREE.Vector2(radius, y))
  }

  for (let index = 0; index <= DOME_SEGMENTS; index += 1) {
    const progress = index / DOME_SEGMENTS
    const angle = progress * Math.PI * 0.5
    const radius =
      (SLIME_INNER_RADIUS - 0.035) * Math.cos(angle) ** 0.72
    const y = THREE.MathUtils.lerp(
      SLIME_RIM_Y - 0.06,
      SLIME_CROWN_Y,
      Math.sin(angle) ** 0.82,
    )
    profile.push(new THREE.Vector2(radius, y))
  }

  const geometry = new THREE.LatheGeometry(profile, RADIAL_SEGMENTS)
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    const z = positions.getZ(index)
    if (y < SLIME_RIM_Y - 0.09) {
      continue
    }
    const topWeight = THREE.MathUtils.smoothstep(
      y,
      SLIME_RIM_Y - 0.09,
      SLIME_CROWN_Y,
    )
    const angle = Math.atan2(z, x)
    const lobe = Math.cos(angle * 2 + 0.34) * 0.075 * topWeight
    positions.setY(index, y + lobe)
  }
  positions.needsUpdate = true
  removeDegenerateTriangles(geometry)
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3),
  )
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.name = 'slime-volume'
  return geometry
}

export function captureSlimeGeometrySources(
  geometry: THREE.BufferGeometry,
): SlimeGeometrySources {
  return {
    positions: new Float32Array(
      geometry.getAttribute('position').array,
    ),
    colors: new Float32Array(geometry.getAttribute('color').array),
  }
}

export function createSlimeContainerGeometries() {
  const wall = new THREE.CylinderGeometry(
    SLIME_CONTAINER_RADIUS,
    SLIME_CONTAINER_RADIUS * 0.985,
    SLIME_CONTAINER_HEIGHT,
    RADIAL_SEGMENTS,
    2,
    true,
  )
  const base = new THREE.CylinderGeometry(
    SLIME_CONTAINER_RADIUS,
    SLIME_CONTAINER_RADIUS * 0.985,
    0.13,
    RADIAL_SEGMENTS,
    1,
    false,
  )
  const rim = new THREE.TorusGeometry(
    SLIME_CONTAINER_RADIUS,
    0.105,
    10,
    RADIAL_SEGMENTS,
  )
  const innerRim = new THREE.TorusGeometry(
    SLIME_INNER_RADIUS + 0.045,
    0.055,
    8,
    RADIAL_SEGMENTS,
  )
  const rib = new THREE.TorusGeometry(
    SLIME_CONTAINER_RADIUS + 0.018,
    0.035,
    7,
    RADIAL_SEGMENTS,
  )
  wall.name = 'slime-container-wall'
  base.name = 'slime-container-base'
  rim.name = 'slime-container-rim'
  innerRim.name = 'slime-container-inner-rim'
  rib.name = 'slime-container-rib'
  return { wall, base, rim, innerRim, rib } as const
}

export function countGeometryTriangles(geometry: THREE.BufferGeometry) {
  const index = geometry.getIndex()
  return (index?.count ?? geometry.getAttribute('position').count) / 3
}
