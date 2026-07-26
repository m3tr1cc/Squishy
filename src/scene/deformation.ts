import * as THREE from 'three'
import {
  DENT_DEPTH,
  DENT_RADIUS,
  MAX_DENT_DEPTH,
} from './constants'
import type { DentImpact } from './types'

export type DeformationSource = {
  positions: Float32Array
  normals: Float32Array
}

export function captureDeformationSource(geometry: THREE.BufferGeometry): DeformationSource {
  const positions = geometry.getAttribute('position')
  const normals = geometry.getAttribute('normal')

  return {
    positions: new Float32Array(positions.array),
    normals: new Float32Array(normals.array),
  }
}

export function smoothDentWeight(distance: number, radius = DENT_RADIUS) {
  if (distance >= radius) {
    return 0
  }

  const t = Math.max(0, 1 - distance / radius)
  return t * t * (3 - 2 * t)
}

export function sampleDentDepthValues(
  x: number,
  y: number,
  z: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  impacts: readonly DentImpact[],
) {
  let dent = 0

  for (const impact of impacts) {
    const deltaX = x - impact.localPoint[0]
    const deltaY = y - impact.localPoint[1]
    const deltaZ = z - impact.localPoint[2]
    const distance = Math.hypot(deltaX, deltaY, deltaZ)

    if (distance >= DENT_RADIUS) {
      continue
    }

    const alignment = Math.max(
      0,
      normalX * impact.localNormal[0] +
        normalY * impact.localNormal[1] +
        normalZ * impact.localNormal[2],
    )

    if (alignment <= 0.15) {
      continue
    }

    dent +=
      DENT_DEPTH *
      impact.amount *
      smoothDentWeight(distance) *
      alignment *
      alignment
  }

  return Math.min(MAX_DENT_DEPTH, Math.max(-0.012, dent))
}

export function sampleDentDepth(
  position: readonly [number, number, number],
  normal: readonly [number, number, number],
  impacts: readonly DentImpact[],
) {
  return sampleDentDepthValues(
    position[0],
    position[1],
    position[2],
    normal[0],
    normal[1],
    normal[2],
    impacts,
  )
}

export function writeDeformedPositions(
  geometry: THREE.BufferGeometry,
  source: DeformationSource,
  impacts: readonly DentImpact[],
  surfaceOffset: number,
) {
  const attribute = geometry.getAttribute('position') as THREE.BufferAttribute
  const target = attribute.array as Float32Array
  const { positions, normals } = source

  for (let offset = 0; offset < positions.length; offset += 3) {
    const x = positions[offset]
    const y = positions[offset + 1]
    const z = positions[offset + 2]
    const normalX = normals[offset]
    const normalY = normals[offset + 1]
    const normalZ = normals[offset + 2]
    const dent = sampleDentDepthValues(
      x,
      y,
      z,
      normalX,
      normalY,
      normalZ,
      impacts,
    )
    const normalDistance = surfaceOffset - dent
    target[offset] = x + normalX * normalDistance
    target[offset + 1] = y + normalY * normalDistance
    target[offset + 2] = z + normalZ * normalDistance
  }

  attribute.needsUpdate = true
  geometry.computeVertexNormals()
}
