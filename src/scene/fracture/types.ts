import type * as THREE from 'three'

export const WAX_SURFACE_KIND = {
  outer: 0,
  inner: 1,
  side: 2,
} as const

export type WaxSurfaceKind =
  (typeof WAX_SURFACE_KIND)[keyof typeof WAX_SURFACE_KIND]

export const WAX_FRACTURE_ROLE = {
  trunk: 0,
  branch: 1,
  ordinary: 2,
} as const

export type WaxFractureRole =
  (typeof WAX_FRACTURE_ROLE)[keyof typeof WAX_FRACTURE_ROLE]

export type TriangleRange = {
  start: number
  count: number
}

export type VertexRange = {
  start: number
  count: number
}

export type WaxFragmentMetadata = {
  id: number
  seedTriangleId: number
  growthSpeed: number
  sourceTriangleIndices: Uint32Array
  sourceVertexIndices: Uint32Array
  neighborFragmentIds: Uint16Array
  bondIds: Uint16Array
  centroid: readonly [number, number, number]
  averageNormal: readonly [number, number, number]
  surfaceArea: number
  vertexRange: VertexRange
  outerVertexRange: VertexRange
  innerVertexRange: VertexRange
  sideVertexRange: VertexRange
  outerTriangleRange: TriangleRange
  innerTriangleRange: TriangleRange
  sideTriangleRange: TriangleRange
}

export type WaxBond = {
  id: number
  fragmentA: number
  fragmentB: number
  boundaryEdges: Uint32Array
  boundaryVertexIndices: Uint32Array
  length: number
  midpoint: readonly [number, number, number]
  restAngle: number
  fractureRole: WaxFractureRole
  toughness: number
}

export type WaxSourceSurface = {
  vertexCount: number
  triangleCount: number
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  triangleCentroids: Float32Array
  triangleNormals: Float32Array
  triangleAreas: Float32Array
  triangleNeighbors: Int32Array
}

export type WaxTriangleMetadata = {
  fragmentId: number
  surfaceKind: WaxSurfaceKind
  sourceTriangleId: number | null
}

export type WaxTopology = {
  geometry: THREE.BufferGeometry
  seed: number
  plateCount: number
  innerClearance: number
  outerOffset: number
  thickness: number
  source: WaxSourceSurface
  seedTriangleIds: Uint32Array
  seedSelectionDistanceRatios: Float32Array
  growthSpeeds: Float32Array
  sourceTriangleFragmentIds: Uint16Array
  triangleFragmentIds: Uint16Array
  triangleSurfaceKinds: Uint8Array
  triangleSourceTriangleIds: Int32Array
  fragments: WaxFragmentMetadata[]
  bonds: WaxBond[]
}

export type CreateWaxTopologyOptions = {
  sourceGeometry?: THREE.BufferGeometry
  plateCount?: number
  seed?: number
  innerClearance?: number
  outerOffset?: number
}
