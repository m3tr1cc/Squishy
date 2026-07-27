import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  BUTTER_SEGMENTS,
  BUTTER_SIZE,
  CORNER_RADIUS,
} from './constants'

export type RoundedCuboidOptions = {
  width?: number
  height?: number
  depth?: number
  radius?: number
  widthSegments?: number
  heightSegments?: number
  depthSegments?: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function createRoundedCuboidGeometry({
  width = BUTTER_SIZE.width,
  height = BUTTER_SIZE.height,
  depth = BUTTER_SIZE.depth,
  radius = CORNER_RADIUS,
  widthSegments = BUTTER_SEGMENTS.width,
  heightSegments = BUTTER_SEGMENTS.height,
  depthSegments = BUTTER_SEGMENTS.depth,
}: RoundedCuboidOptions = {}) {
  const maximumRadius = Math.min(width, height, depth) / 2
  const safeRadius = clamp(radius, 0.001, maximumRadius - 0.001)
  const geometry = new THREE.BoxGeometry(
    width,
    height,
    depth,
    widthSegments,
    heightSegments,
    depthSegments,
  )

  geometry.deleteAttribute('normal')
  geometry.deleteAttribute('uv')

  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const innerX = width / 2 - safeRadius
  const innerY = height / 2 - safeRadius
  const innerZ = depth / 2 - safeRadius

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    const z = positions.getZ(index)
    const nearestX = clamp(x, -innerX, innerX)
    const nearestY = clamp(y, -innerY, innerY)
    const nearestZ = clamp(z, -innerZ, innerZ)
    const deltaX = x - nearestX
    const deltaY = y - nearestY
    const deltaZ = z - nearestZ
    const length = Math.hypot(deltaX, deltaY, deltaZ)
    const scale = safeRadius / Math.max(length, Number.EPSILON)

    positions.setXYZ(
      index,
      nearestX + deltaX * scale,
      nearestY + deltaY * scale,
      nearestZ + deltaZ * scale,
    )
  }

  const merged = mergeVertices(geometry, 1e-5)
  geometry.dispose()
  merged.computeVertexNormals()
  merged.computeBoundingBox()
  merged.computeBoundingSphere()

  if (merged.boundingSphere) {
    merged.boundingSphere.radius += 0.2
  }

  return merged
}
