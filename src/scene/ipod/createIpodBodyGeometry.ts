import * as THREE from 'three'

export type IpodBodyGeometryOptions = Readonly<{
  width: number
  height: number
  depth: number
  sideSegments?: number
}>

type CrossSectionPoint = Readonly<{
  x: number
  z: number
  normalX: number
  normalZ: number
}>

function createSlotCrossSection(
  width: number,
  depth: number,
  sideSegments: number,
) {
  const radius = depth / 2
  const straightHalfWidth = width / 2 - radius
  const points: CrossSectionPoint[] = [
    {
      x: -straightHalfWidth,
      z: radius,
      normalX: 0,
      normalZ: 1,
    },
    {
      x: straightHalfWidth,
      z: radius,
      normalX: 0,
      normalZ: 1,
    },
  ]

  for (let step = 1; step <= sideSegments; step += 1) {
    const angle = Math.PI / 2 - (Math.PI * step) / sideSegments
    points.push({
      x: straightHalfWidth + Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      normalX: Math.cos(angle),
      normalZ: Math.sin(angle),
    })
  }

  points.push({
    x: -straightHalfWidth,
    z: -radius,
    normalX: 0,
    normalZ: -1,
  })

  for (let step = 1; step < sideSegments; step += 1) {
    const angle = -Math.PI / 2 - (Math.PI * step) / sideSegments
    points.push({
      x: -straightHalfWidth + Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      normalX: Math.cos(angle),
      normalZ: Math.sin(angle),
    })
  }

  return points
}

export function createIpodBodyGeometry({
  width,
  height,
  depth,
  sideSegments = 24,
}: IpodBodyGeometryOptions) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(depth) ||
    width <= depth ||
    height <= 0 ||
    depth <= 0 ||
    !Number.isInteger(sideSegments) ||
    sideSegments < 2
  ) {
    throw new RangeError('Invalid iPod body geometry dimensions')
  }

  const crossSection = createSlotCrossSection(
    width,
    depth,
    sideSegments,
  )
  const ringVertexCount = crossSection.length
  const halfHeight = height / 2
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  for (const y of [-halfHeight, halfHeight]) {
    for (const point of crossSection) {
      positions.push(point.x, y, point.z)
      normals.push(point.normalX, 0, point.normalZ)
    }
  }

  for (let index = 0; index < ringVertexCount; index += 1) {
    const nextIndex = (index + 1) % ringVertexCount
    const bottom = index
    const bottomNext = nextIndex
    const top = ringVertexCount + index
    const topNext = ringVertexCount + nextIndex
    indices.push(bottom, bottomNext, topNext, bottom, topNext, top)
  }

  const topCenterIndex = positions.length / 3
  positions.push(0, halfHeight, 0)
  normals.push(0, 1, 0)
  const topRingStart = positions.length / 3
  for (const point of crossSection) {
    positions.push(point.x, halfHeight, point.z)
    normals.push(0, 1, 0)
  }

  const bottomCenterIndex = positions.length / 3
  positions.push(0, -halfHeight, 0)
  normals.push(0, -1, 0)
  const bottomRingStart = positions.length / 3
  for (const point of crossSection) {
    positions.push(point.x, -halfHeight, point.z)
    normals.push(0, -1, 0)
  }

  for (let index = 0; index < ringVertexCount; index += 1) {
    const nextIndex = (index + 1) % ringVertexCount
    indices.push(
      topCenterIndex,
      topRingStart + index,
      topRingStart + nextIndex,
      bottomCenterIndex,
      bottomRingStart + nextIndex,
      bottomRingStart + index,
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(normals, 3),
  )
  geometry.setIndex(indices)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
