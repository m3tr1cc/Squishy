import * as THREE from 'three'
import { createRoundedCuboidGeometry } from '../createRoundedCuboidGeometry'
import type {
  SoapAtlasUvBounds,
  SoapGeometryDefinition,
  SoapVector3,
} from './types'

export const SOAP_SOURCE_TRIANGLE_BUDGET = 3_000
export const SOAP_DECAL_TRIANGLE_BUDGET = 512

const DECAL_WIDTH_RATIO = 0.72
const DECAL_HEIGHT_RATIO = 0.5
const DECAL_SURFACE_OFFSET = 0.004
const DECAL_WIDTH_SEGMENTS = 16
const DECAL_HEIGHT_SEGMENTS = 6
const SOAP_WAIST_DEPTH = 0.165
const SOAP_END_ROUNDING = 0.115
const SOAP_PUFF_DEPTH = 0.055

export const SOAP_SHARED_SIZE = Object.freeze([
  4,
  1.82,
  1.05,
] as const)
export const SOAP_SHARED_CORNER_RADIUS = 0.49
export const SOAP_SHARED_SEGMENTS = Object.freeze([
  36,
  15,
  4,
] as const)

export function getSoapShapedPosition(
  x: number,
  y: number,
  z: number,
  size: SoapVector3,
): readonly [number, number, number] {
  const [width, height] = size
  const normalizedX = THREE.MathUtils.clamp(
    x / (width * 0.5),
    -1,
    1,
  )
  const normalizedY = THREE.MathUtils.clamp(
    y / (height * 0.5),
    -1,
    1,
  )
  const waist =
    Math.cos(Math.abs(normalizedX) * Math.PI * 0.5) ** 2
  const shoulderProgress = THREE.MathUtils.smoothstep(
    Math.abs(normalizedX),
    0.42,
    1,
  )
  const endRounding =
    SOAP_END_ROUNDING *
    shoulderProgress *
    Math.abs(normalizedY) ** 1.8
  const shapedX = x * (1 - endRounding)
  const shapedY = y * (1 - SOAP_WAIST_DEPTH * waist)
  const shapedNormalizedY = THREE.MathUtils.clamp(
    shapedY / (height * 0.5),
    -1,
    1,
  )
  const puff =
    SOAP_PUFF_DEPTH *
    Math.max(0, 1 - normalizedX * normalizedX) *
    Math.max(0, 1 - shapedNormalizedY * shapedNormalizedY)
  const shapedZ = z + Math.sign(z || 1) * puff

  return [shapedX, shapedY, shapedZ]
}

function applySoapShape(
  geometry: THREE.BufferGeometry,
  size: SoapVector3,
) {
  const positions = geometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute
  for (let index = 0; index < positions.count; index += 1) {
    const shaped = getSoapShapedPosition(
      positions.getX(index),
      positions.getY(index),
      positions.getZ(index),
      size,
    )
    positions.setXYZ(index, shaped[0], shaped[1], shaped[2])
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function roundedFrontZ(
  x: number,
  y: number,
  size: SoapVector3,
  cornerRadius: number,
) {
  const [width, height, depth] = size
  const innerX = width / 2 - cornerRadius
  const innerY = height / 2 - cornerRadius
  const innerZ = depth / 2 - cornerRadius
  const deltaX = Math.max(0, Math.abs(x) - innerX)
  const deltaY = Math.max(0, Math.abs(y) - innerY)
  const radialSquared = Math.max(
    0,
    cornerRadius * cornerRadius -
      deltaX * deltaX -
      deltaY * deltaY,
  )

  return innerZ + Math.sqrt(radialSquared)
}

export function createSoapSourceGeometry({
  size,
  cornerRadius,
  segments,
}: Pick<
  SoapGeometryDefinition,
  'size' | 'cornerRadius' | 'segments'
>) {
  return applySoapShape(createRoundedCuboidGeometry({
    width: size[0],
    height: size[1],
    depth: size[2],
    radius: cornerRadius,
    widthSegments: segments[0],
    heightSegments: segments[1],
    depthSegments: segments[2],
  }), size)
}

export function createSoapDecalGeometry({
  size,
  cornerRadius,
  atlasUvBounds,
}: Pick<SoapGeometryDefinition, 'size' | 'cornerRadius'> & {
  atlasUvBounds: SoapAtlasUvBounds
}) {
  const geometry = new THREE.PlaneGeometry(
    size[0] * DECAL_WIDTH_RATIO,
    size[1] * DECAL_HEIGHT_RATIO,
    DECAL_WIDTH_SEGMENTS,
    DECAL_HEIGHT_SEGMENTS,
  )
  const positions = geometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute
  const uvs = geometry.getAttribute('uv') as THREE.BufferAttribute
  const [minimumU, minimumV, maximumU, maximumV] = atlasUvBounds

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    const shaped = getSoapShapedPosition(
      x,
      y,
      roundedFrontZ(x, y, size, cornerRadius),
      size,
    )
    positions.setXYZ(
      index,
      shaped[0],
      shaped[1],
      shaped[2] + DECAL_SURFACE_OFFSET,
    )

    const localU = uvs.getX(index)
    const localV = uvs.getY(index)
    uvs.setXY(
      index,
      THREE.MathUtils.lerp(minimumU, maximumU, localU),
      THREE.MathUtils.lerp(minimumV, maximumV, localV),
    )
  }

  positions.needsUpdate = true
  uvs.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
