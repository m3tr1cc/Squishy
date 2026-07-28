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
const DECAL_HEIGHT_RATIO = 0.44
const DECAL_SURFACE_OFFSET = 0.004
const DECAL_WIDTH_SEGMENTS = 16
const DECAL_HEIGHT_SEGMENTS = 6

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
  return createRoundedCuboidGeometry({
    width: size[0],
    height: size[1],
    depth: size[2],
    radius: cornerRadius,
    widthSegments: segments[0],
    heightSegments: segments[1],
    depthSegments: segments[2],
  })
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
    positions.setZ(
      index,
      roundedFrontZ(x, y, size, cornerRadius) +
        DECAL_SURFACE_OFFSET,
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
