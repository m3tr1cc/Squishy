import * as THREE from 'three'
import {
  BUTTER_SIZE,
  CORNER_RADIUS,
} from './constants'

const LABEL_WIDTH = 3.72
const LABEL_HEIGHT = 1.02
const LABEL_OFFSET = 0.0035

function roundedFrontZ(x: number, y: number) {
  const innerX = BUTTER_SIZE.width / 2 - CORNER_RADIUS
  const innerY = BUTTER_SIZE.height / 2 - CORNER_RADIUS
  const innerZ = BUTTER_SIZE.depth / 2 - CORNER_RADIUS
  const deltaX = Math.max(0, Math.abs(x) - innerX)
  const deltaY = Math.max(0, Math.abs(y) - innerY)
  const radialSquared = Math.max(
    0,
    CORNER_RADIUS * CORNER_RADIUS - deltaX * deltaX - deltaY * deltaY,
  )

  return innerZ + Math.sqrt(radialSquared)
}

export function createButterLabelGeometry() {
  const geometry = new THREE.PlaneGeometry(
    LABEL_WIDTH,
    LABEL_HEIGHT,
    48,
    12,
  )
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    positions.setZ(index, roundedFrontZ(x, y) + LABEL_OFFSET)
  }

  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
