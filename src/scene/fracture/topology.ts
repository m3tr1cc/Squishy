import * as THREE from 'three'
import { createRoundedCuboidGeometry } from '../createRoundedCuboidGeometry'
import {
  WAX_SURFACE_KIND,
  type CreateWaxTopologyOptions,
  type WaxBond,
  type WaxFragmentMetadata,
  type WaxSourceSurface,
  type WaxSurfaceKind,
  type WaxTopology,
  type WaxTriangleMetadata,
} from './types'

export const DEFAULT_WAX_PLATE_COUNT = 128
export const DEFAULT_WAX_TOPOLOGY_SEED = 0x57a45eed
export const DEFAULT_WAX_INNER_CLEARANCE = 0.006
export const DEFAULT_WAX_OUTER_OFFSET = 0.055

const DISTANCE_EPSILON = 1e-10

type EdgeRecord = {
  a: number
  b: number
  triangleA: number
  triangleB: number
}

type TriangleRecord = {
  a: number
  b: number
  c: number
}

type GraphNeighbor = {
  triangle: number
  distance: number
}

type HeapEntry = {
  distance: number
  triangle: number
  owner: number
}

type TriangleOutput = {
  a: number
  b: number
  c: number
  fragmentId: number
  surfaceKind: WaxSurfaceKind
  sourceTriangleId: number
}

type MutableFragmentMetadata = Omit<
  WaxFragmentMetadata,
  | 'neighborFragmentIds'
  | 'bondIds'
  | 'outerTriangleRange'
  | 'innerTriangleRange'
  | 'sideTriangleRange'
> & {
  neighborFragmentIds: Uint16Array
  bondIds: Uint16Array
  outerTriangleRange: { start: number; count: number }
  innerTriangleRange: { start: number; count: number }
  sideTriangleRange: { start: number; count: number }
}

type BondAccumulator = {
  fragmentA: number
  fragmentB: number
  edges: Array<readonly [number, number]>
}

class MinHeap {
  private readonly entries: HeapEntry[] = []

  get size() {
    return this.entries.length
  }

  push(entry: HeapEntry) {
    let index = this.entries.length
    this.entries.push(entry)

    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (compareHeapEntries(this.entries[parent], entry) <= 0) {
        break
      }
      this.entries[index] = this.entries[parent]
      index = parent
    }

    this.entries[index] = entry
  }

  pop() {
    const root = this.entries[0]
    const last = this.entries.pop()

    if (this.entries.length === 0 || !last) {
      return root
    }

    let index = 0
    while (true) {
      const left = index * 2 + 1
      if (left >= this.entries.length) {
        break
      }

      const right = left + 1
      let child = left
      if (
        right < this.entries.length &&
        compareHeapEntries(this.entries[right], this.entries[left]) < 0
      ) {
        child = right
      }

      if (compareHeapEntries(last, this.entries[child]) <= 0) {
        break
      }

      this.entries[index] = this.entries[child]
      index = child
    }

    this.entries[index] = last
    return root
  }
}

function compareHeapEntries(a: HeapEntry, b: HeapEntry) {
  if (a.distance !== b.distance) {
    return a.distance - b.distance
  }
  if (a.owner !== b.owner) {
    return a.owner - b.owner
  }
  return a.triangle - b.triangle
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function edgeKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function fragmentPairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function hashUint32(value: number) {
  let result = value >>> 0
  result ^= result >>> 16
  result = Math.imul(result, 0x7feb352d)
  result ^= result >>> 15
  result = Math.imul(result, 0x846ca68b)
  result ^= result >>> 16
  return result >>> 0
}

function seededUnitFloat(seed: number, salt: number) {
  return hashUint32((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0) / 0xffffffff
}

function normalizeVector(x: number, y: number, z: number) {
  const length = Math.hypot(x, y, z)
  if (length <= Number.EPSILON) {
    return [0, 1, 0] as const
  }
  return [x / length, y / length, z / length] as const
}

function readSourceSurface(geometry: THREE.BufferGeometry) {
  const positionAttribute = geometry.getAttribute('position')
  const normalAttribute = geometry.getAttribute('normal')
  const indexAttribute = geometry.getIndex()

  if (!positionAttribute || positionAttribute.itemSize !== 3) {
    throw new Error('Wax topology requires a three-component position attribute.')
  }
  if (!normalAttribute || normalAttribute.itemSize !== 3) {
    throw new Error('Wax topology requires smooth source vertex normals.')
  }
  if (!indexAttribute || indexAttribute.count % 3 !== 0) {
    throw new Error('Wax topology requires an indexed triangle geometry.')
  }

  const vertexCount = positionAttribute.count
  const triangleCount = indexAttribute.count / 3
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const indices = new Uint32Array(indexAttribute.count)

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3
    positions[offset] = positionAttribute.getX(vertex)
    positions[offset + 1] = positionAttribute.getY(vertex)
    positions[offset + 2] = positionAttribute.getZ(vertex)
    normals[offset] = normalAttribute.getX(vertex)
    normals[offset + 1] = normalAttribute.getY(vertex)
    normals[offset + 2] = normalAttribute.getZ(vertex)
  }

  for (let index = 0; index < indexAttribute.count; index += 1) {
    indices[index] = indexAttribute.getX(index)
  }

  return { vertexCount, triangleCount, positions, normals, indices }
}

function buildSourceGraph(
  vertexCount: number,
  triangleCount: number,
  positions: Float32Array,
  indices: Uint32Array,
) {
  const triangles: TriangleRecord[] = []
  const triangleCentroids = new Float32Array(triangleCount * 3)
  const triangleNormals = new Float32Array(triangleCount * 3)
  const triangleAreas = new Float32Array(triangleCount)
  const edgeMap = new Map<
    string,
    { a: number; b: number; triangles: number[] }
  >()

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const indexOffset = triangle * 3
    const a = indices[indexOffset]
    const b = indices[indexOffset + 1]
    const c = indices[indexOffset + 2]
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) {
      throw new Error(`Triangle ${triangle} references an out-of-range vertex.`)
    }

    triangles[triangle] = { a, b, c }

    const ax = positions[a * 3]
    const ay = positions[a * 3 + 1]
    const az = positions[a * 3 + 2]
    const bx = positions[b * 3]
    const by = positions[b * 3 + 1]
    const bz = positions[b * 3 + 2]
    const cx = positions[c * 3]
    const cy = positions[c * 3 + 1]
    const cz = positions[c * 3 + 2]

    triangleCentroids[indexOffset] = (ax + bx + cx) / 3
    triangleCentroids[indexOffset + 1] = (ay + by + cy) / 3
    triangleCentroids[indexOffset + 2] = (az + bz + cz) / 3

    const abx = bx - ax
    const aby = by - ay
    const abz = bz - az
    const acx = cx - ax
    const acy = cy - ay
    const acz = cz - az
    const crossX = aby * acz - abz * acy
    const crossY = abz * acx - abx * acz
    const crossZ = abx * acy - aby * acx
    const twiceArea = Math.hypot(crossX, crossY, crossZ)
    const normal = normalizeVector(crossX, crossY, crossZ)
    triangleNormals[indexOffset] = normal[0]
    triangleNormals[indexOffset + 1] = normal[1]
    triangleNormals[indexOffset + 2] = normal[2]
    triangleAreas[triangle] = twiceArea / 2

    const triangleEdges = [
      [a, b],
      [b, c],
      [c, a],
    ] as const
    for (const [edgeA, edgeB] of triangleEdges) {
      const key = edgeKey(edgeA, edgeB)
      const existing = edgeMap.get(key)
      if (existing) {
        existing.triangles.push(triangle)
      } else {
        edgeMap.set(key, {
          a: Math.min(edgeA, edgeB),
          b: Math.max(edgeA, edgeB),
          triangles: [triangle],
        })
      }
    }
  }

  const edgeRecords: EdgeRecord[] = []
  const triangleNeighbors = new Int32Array(triangleCount * 3)
  triangleNeighbors.fill(-1)
  const graph: GraphNeighbor[][] = Array.from(
    { length: triangleCount },
    () => [],
  )

  const sortedEdges = [...edgeMap.values()].sort(
    (left, right) => left.a - right.a || left.b - right.b,
  )
  for (const edge of sortedEdges) {
    if (edge.triangles.length !== 2) {
      throw new Error(
        `Source geometry is not watertight at edge ${edge.a}:${edge.b}.`,
      )
    }

    const triangleA = edge.triangles[0]
    const triangleB = edge.triangles[1]
    edgeRecords.push({ a: edge.a, b: edge.b, triangleA, triangleB })

    const aOffset = triangleA * 3
    const bOffset = triangleB * 3
    const dx =
      triangleCentroids[aOffset] - triangleCentroids[bOffset]
    const dy =
      triangleCentroids[aOffset + 1] - triangleCentroids[bOffset + 1]
    const dz =
      triangleCentroids[aOffset + 2] - triangleCentroids[bOffset + 2]
    const distance = Math.max(Math.hypot(dx, dy, dz), DISTANCE_EPSILON)
    graph[triangleA].push({ triangle: triangleB, distance })
    graph[triangleB].push({ triangle: triangleA, distance })
  }

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    graph[triangle].sort((left, right) => left.triangle - right.triangle)
    if (graph[triangle].length !== 3) {
      throw new Error(
        `Source geometry has a non-manifold triangle at ${triangle}.`,
      )
    }
    for (let neighbor = 0; neighbor < 3; neighbor += 1) {
      triangleNeighbors[triangle * 3 + neighbor] =
        graph[triangle][neighbor].triangle
    }
  }

  return {
    triangles,
    edgeRecords,
    graph,
    triangleCentroids,
    triangleNormals,
    triangleAreas,
    triangleNeighbors,
  }
}

function updateNearestSeedDistances(
  seedTriangle: number,
  graph: GraphNeighbor[][],
  nearestDistances: Float64Array,
) {
  const distances = new Float64Array(graph.length)
  distances.fill(Number.POSITIVE_INFINITY)
  distances[seedTriangle] = 0
  const heap = new MinHeap()
  heap.push({ distance: 0, triangle: seedTriangle, owner: 0 })

  while (heap.size > 0) {
    const current = heap.pop()
    if (!current || current.distance !== distances[current.triangle]) {
      continue
    }
    if (current.distance >= nearestDistances[current.triangle]) {
      continue
    }

    nearestDistances[current.triangle] = current.distance
    for (const neighbor of graph[current.triangle]) {
      const distance = current.distance + neighbor.distance
      if (
        distance < distances[neighbor.triangle] &&
        distance < nearestDistances[neighbor.triangle]
      ) {
        distances[neighbor.triangle] = distance
        heap.push({
          distance,
          triangle: neighbor.triangle,
          owner: 0,
        })
      }
    }
  }
}

function chooseSeeds(
  graph: GraphNeighbor[][],
  plateCount: number,
  seed: number,
) {
  const seeds: number[] = []
  const selected = new Uint8Array(graph.length)
  const nearestDistances = new Float64Array(graph.length)
  nearestDistances.fill(Number.POSITIVE_INFINITY)

  let nextSeed = hashUint32(seed) % graph.length
  for (let fragment = 0; fragment < plateCount; fragment += 1) {
    seeds.push(nextSeed)
    selected[nextSeed] = 1
    updateNearestSeedDistances(nextSeed, graph, nearestDistances)

    if (fragment === plateCount - 1) {
      break
    }

    let farthestTriangle = -1
    let farthestDistance = -1
    for (let triangle = 0; triangle < graph.length; triangle += 1) {
      if (selected[triangle]) {
        continue
      }
      const distance = nearestDistances[triangle]
      if (
        distance > farthestDistance + DISTANCE_EPSILON ||
        (Math.abs(distance - farthestDistance) <= DISTANCE_EPSILON &&
          triangle < farthestTriangle)
      ) {
        farthestTriangle = triangle
        farthestDistance = distance
      }
    }

    if (farthestTriangle < 0 || !Number.isFinite(farthestDistance)) {
      throw new Error('Unable to choose the requested number of wax plates.')
    }
    nextSeed = farthestTriangle
  }

  return seeds
}

function partitionTriangles(graph: GraphNeighbor[][], seeds: number[]) {
  const distances = new Float64Array(graph.length)
  distances.fill(Number.POSITIVE_INFINITY)
  const owners = new Uint16Array(graph.length)
  owners.fill(0xffff)
  const heap = new MinHeap()

  for (let fragment = 0; fragment < seeds.length; fragment += 1) {
    const triangle = seeds[fragment]
    distances[triangle] = 0
    owners[triangle] = fragment
    heap.push({ distance: 0, triangle, owner: fragment })
  }

  while (heap.size > 0) {
    const current = heap.pop()
    if (
      !current ||
      current.distance !== distances[current.triangle] ||
      current.owner !== owners[current.triangle]
    ) {
      continue
    }

    for (const neighbor of graph[current.triangle]) {
      const distance = current.distance + neighbor.distance
      const existingDistance = distances[neighbor.triangle]
      const existingOwner = owners[neighbor.triangle]
      if (
        distance < existingDistance - DISTANCE_EPSILON ||
        (Math.abs(distance - existingDistance) <= DISTANCE_EPSILON &&
          current.owner < existingOwner)
      ) {
        distances[neighbor.triangle] = distance
        owners[neighbor.triangle] = current.owner
        heap.push({
          distance,
          triangle: neighbor.triangle,
          owner: current.owner,
        })
      }
    }
  }

  return owners
}

function getOffsetPosition(
  sourceVertex: number,
  offset: number,
  positions: Float32Array,
  normals: Float32Array,
) {
  const sourceOffset = sourceVertex * 3
  return [
    positions[sourceOffset] + normals[sourceOffset] * offset,
    positions[sourceOffset + 1] + normals[sourceOffset + 1] * offset,
    positions[sourceOffset + 2] + normals[sourceOffset + 2] * offset,
  ] as const
}

function appendVertex(
  outputPositions: number[],
  outputNormals: number[],
  outputFragmentIds: number[],
  outputSurfaceKinds: number[],
  outputSourceVertexIds: number[],
  outputShellOffsets: number[],
  position: readonly [number, number, number],
  normal: readonly [number, number, number],
  fragmentId: number,
  surfaceKind: WaxSurfaceKind,
  sourceVertexId: number,
  shellOffset: number,
) {
  const vertex = outputPositions.length / 3
  outputPositions.push(position[0], position[1], position[2])
  outputNormals.push(normal[0], normal[1], normal[2])
  outputFragmentIds.push(fragmentId)
  outputSurfaceKinds.push(surfaceKind)
  outputSourceVertexIds.push(sourceVertexId)
  outputShellOffsets.push(shellOffset)
  return vertex
}

function createBondMetadata(
  accumulators: BondAccumulator[],
  fragments: MutableFragmentMetadata[],
  source: WaxSourceSurface,
  outerOffset: number,
  seed: number,
) {
  const neighborSets = Array.from(
    { length: fragments.length },
    () => new Set<number>(),
  )
  const bondIdSets = Array.from(
    { length: fragments.length },
    () => new Set<number>(),
  )

  const bonds: WaxBond[] = accumulators.map((accumulator, id) => {
    const sortedEdges = [...accumulator.edges].sort(
      (left, right) => left[0] - right[0] || left[1] - right[1],
    )
    const boundaryEdges = new Uint32Array(sortedEdges.length * 2)
    const boundaryVertices = new Set<number>()
    let length = 0
    let weightedMidpointX = 0
    let weightedMidpointY = 0
    let weightedMidpointZ = 0

    for (let edgeIndex = 0; edgeIndex < sortedEdges.length; edgeIndex += 1) {
      const [a, b] = sortedEdges[edgeIndex]
      boundaryEdges[edgeIndex * 2] = a
      boundaryEdges[edgeIndex * 2 + 1] = b
      boundaryVertices.add(a)
      boundaryVertices.add(b)

      const pointA = getOffsetPosition(
        a,
        outerOffset,
        source.positions,
        source.normals,
      )
      const pointB = getOffsetPosition(
        b,
        outerOffset,
        source.positions,
        source.normals,
      )
      const edgeLength = Math.hypot(
        pointB[0] - pointA[0],
        pointB[1] - pointA[1],
        pointB[2] - pointA[2],
      )
      length += edgeLength
      weightedMidpointX += ((pointA[0] + pointB[0]) / 2) * edgeLength
      weightedMidpointY += ((pointA[1] + pointB[1]) / 2) * edgeLength
      weightedMidpointZ += ((pointA[2] + pointB[2]) / 2) * edgeLength
    }

    const normalA = fragments[accumulator.fragmentA].averageNormal
    const normalB = fragments[accumulator.fragmentB].averageNormal
    const normalDot = clamp(
      normalA[0] * normalB[0] +
        normalA[1] * normalB[1] +
        normalA[2] * normalB[2],
      -1,
      1,
    )

    neighborSets[accumulator.fragmentA].add(accumulator.fragmentB)
    neighborSets[accumulator.fragmentB].add(accumulator.fragmentA)
    bondIdSets[accumulator.fragmentA].add(id)
    bondIdSets[accumulator.fragmentB].add(id)

    return {
      id,
      fragmentA: accumulator.fragmentA,
      fragmentB: accumulator.fragmentB,
      boundaryEdges,
      boundaryVertexIndices: Uint32Array.from(
        [...boundaryVertices].sort((a, b) => a - b),
      ),
      length,
      midpoint: [
        weightedMidpointX / length,
        weightedMidpointY / length,
        weightedMidpointZ / length,
      ],
      restAngle: Math.acos(normalDot),
      toughness: 0.88 + seededUnitFloat(seed, id) * 0.24,
    }
  })

  for (let fragment = 0; fragment < fragments.length; fragment += 1) {
    fragments[fragment].neighborFragmentIds = Uint16Array.from(
      [...neighborSets[fragment]].sort((a, b) => a - b),
    )
    fragments[fragment].bondIds = Uint16Array.from(
      [...bondIdSets[fragment]].sort((a, b) => a - b),
    )
  }

  return bonds
}

function assembleGeometry(
  source: WaxSourceSurface,
  triangles: TriangleRecord[],
  edgeRecords: EdgeRecord[],
  edgeRecordMap: ReadonlyMap<string, EdgeRecord>,
  sourceTriangleFragmentIds: Uint16Array,
  plateCount: number,
  innerClearance: number,
  outerOffset: number,
  seed: number,
) {
  const fragmentTriangles: number[][] = Array.from(
    { length: plateCount },
    () => [],
  )
  for (
    let triangle = 0;
    triangle < sourceTriangleFragmentIds.length;
    triangle += 1
  ) {
    fragmentTriangles[sourceTriangleFragmentIds[triangle]].push(triangle)
  }

  const directedBoundaryEdges: Array<
    Array<{ a: number; b: number; sourceTriangleId: number }>
  > = Array.from({ length: plateCount }, () => [])

  const bondMap = new Map<string, BondAccumulator>()
  for (const edge of edgeRecords) {
    const fragmentA = sourceTriangleFragmentIds[edge.triangleA]
    const fragmentB = sourceTriangleFragmentIds[edge.triangleB]
    if (fragmentA === fragmentB) {
      continue
    }

    const key = fragmentPairKey(fragmentA, fragmentB)
    const existing = bondMap.get(key)
    const boundaryEdge = [edge.a, edge.b] as const
    if (existing) {
      existing.edges.push(boundaryEdge)
    } else {
      bondMap.set(key, {
        fragmentA: Math.min(fragmentA, fragmentB),
        fragmentB: Math.max(fragmentA, fragmentB),
        edges: [boundaryEdge],
      })
    }
  }

  for (let triangleId = 0; triangleId < triangles.length; triangleId += 1) {
    const triangle = triangles[triangleId]
    const fragment = sourceTriangleFragmentIds[triangleId]
    const edges = [
      [triangle.a, triangle.b],
      [triangle.b, triangle.c],
      [triangle.c, triangle.a],
    ] as const

    for (const [a, b] of edges) {
      const record = edgeRecordMap.get(edgeKey(a, b))
      if (!record) {
        throw new Error(`Missing source edge ${a}:${b}.`)
      }
      const neighbor =
        record.triangleA === triangleId
          ? record.triangleB
          : record.triangleA
      if (sourceTriangleFragmentIds[neighbor] !== fragment) {
        directedBoundaryEdges[fragment].push({
          a,
          b,
          sourceTriangleId: triangleId,
        })
      }
    }
  }

  const outputPositions: number[] = []
  const outputNormals: number[] = []
  const outputFragmentIds: number[] = []
  const outputSurfaceKinds: number[] = []
  const outputSourceVertexIds: number[] = []
  const outputShellOffsets: number[] = []
  const outerTriangles: TriangleOutput[] = []
  const innerTriangles: TriangleOutput[] = []
  const sideTriangles: TriangleOutput[] = []
  const fragments: MutableFragmentMetadata[] = []

  for (let fragment = 0; fragment < plateCount; fragment += 1) {
    const sourceTriangleIds = fragmentTriangles[fragment]
    if (sourceTriangleIds.length === 0) {
      throw new Error(`Wax fragment ${fragment} has no source triangles.`)
    }

    const sourceVertexSet = new Set<number>()
    let weightedCentroidX = 0
    let weightedCentroidY = 0
    let weightedCentroidZ = 0
    let weightedNormalX = 0
    let weightedNormalY = 0
    let weightedNormalZ = 0
    let surfaceArea = 0

    for (const triangleId of sourceTriangleIds) {
      const triangle = triangles[triangleId]
      sourceVertexSet.add(triangle.a)
      sourceVertexSet.add(triangle.b)
      sourceVertexSet.add(triangle.c)
      const area = source.triangleAreas[triangleId]
      const offset = triangleId * 3
      surfaceArea += area
      weightedCentroidX += source.triangleCentroids[offset] * area
      weightedCentroidY += source.triangleCentroids[offset + 1] * area
      weightedCentroidZ += source.triangleCentroids[offset + 2] * area
      weightedNormalX += source.triangleNormals[offset] * area
      weightedNormalY += source.triangleNormals[offset + 1] * area
      weightedNormalZ += source.triangleNormals[offset + 2] * area
    }

    const sourceVertexIds = [...sourceVertexSet].sort((a, b) => a - b)
    const vertexStart = outputPositions.length / 3
    const outerVertexStart = vertexStart
    const outerVertexMap = new Map<number, number>()
    const innerVertexMap = new Map<number, number>()

    for (const sourceVertex of sourceVertexIds) {
      const sourceOffset = sourceVertex * 3
      const position = getOffsetPosition(
        sourceVertex,
        outerOffset,
        source.positions,
        source.normals,
      )
      const normal = [
        source.normals[sourceOffset],
        source.normals[sourceOffset + 1],
        source.normals[sourceOffset + 2],
      ] as const
      outerVertexMap.set(
        sourceVertex,
        appendVertex(
          outputPositions,
          outputNormals,
          outputFragmentIds,
          outputSurfaceKinds,
          outputSourceVertexIds,
          outputShellOffsets,
          position,
          normal,
          fragment,
          WAX_SURFACE_KIND.outer,
          sourceVertex,
          outerOffset,
        ),
      )
    }

    const innerVertexStart = outputPositions.length / 3
    for (const sourceVertex of sourceVertexIds) {
      const sourceOffset = sourceVertex * 3
      const position = getOffsetPosition(
        sourceVertex,
        innerClearance,
        source.positions,
        source.normals,
      )
      const normal = [
        -source.normals[sourceOffset],
        -source.normals[sourceOffset + 1],
        -source.normals[sourceOffset + 2],
      ] as const
      innerVertexMap.set(
        sourceVertex,
        appendVertex(
          outputPositions,
          outputNormals,
          outputFragmentIds,
          outputSurfaceKinds,
          outputSourceVertexIds,
          outputShellOffsets,
          position,
          normal,
          fragment,
          WAX_SURFACE_KIND.inner,
          sourceVertex,
          innerClearance,
        ),
      )
    }

    const outerTriangleStart = outerTriangles.length
    const innerTriangleStart = innerTriangles.length
    for (const triangleId of sourceTriangleIds) {
      const triangle = triangles[triangleId]
      outerTriangles.push({
        a: outerVertexMap.get(triangle.a)!,
        b: outerVertexMap.get(triangle.b)!,
        c: outerVertexMap.get(triangle.c)!,
        fragmentId: fragment,
        surfaceKind: WAX_SURFACE_KIND.outer,
        sourceTriangleId: triangleId,
      })
      innerTriangles.push({
        a: innerVertexMap.get(triangle.c)!,
        b: innerVertexMap.get(triangle.b)!,
        c: innerVertexMap.get(triangle.a)!,
        fragmentId: fragment,
        surfaceKind: WAX_SURFACE_KIND.inner,
        sourceTriangleId: triangleId,
      })
    }

    const sideTriangleStart = sideTriangles.length
    const sideVertexStart = outputPositions.length / 3
    const sideOuterOffset = outerOffset
    for (const boundary of directedBoundaryEdges[fragment]) {
      const outerA = getOffsetPosition(
        boundary.a,
        sideOuterOffset,
        source.positions,
        source.normals,
      )
      const outerB = getOffsetPosition(
        boundary.b,
        sideOuterOffset,
        source.positions,
        source.normals,
      )
      const innerA = getOffsetPosition(
        boundary.a,
        innerClearance,
        source.positions,
        source.normals,
      )
      const innerB = getOffsetPosition(
        boundary.b,
        innerClearance,
        source.positions,
        source.normals,
      )
      const firstX = innerA[0] - outerA[0]
      const firstY = innerA[1] - outerA[1]
      const firstZ = innerA[2] - outerA[2]
      const secondX = innerB[0] - outerA[0]
      const secondY = innerB[1] - outerA[1]
      const secondZ = innerB[2] - outerA[2]
      const sideNormal = normalizeVector(
        firstY * secondZ - firstZ * secondY,
        firstZ * secondX - firstX * secondZ,
        firstX * secondY - firstY * secondX,
      )
      const sideStart = outputPositions.length / 3
      appendVertex(
        outputPositions,
        outputNormals,
        outputFragmentIds,
        outputSurfaceKinds,
        outputSourceVertexIds,
        outputShellOffsets,
        outerA,
        sideNormal,
        fragment,
        WAX_SURFACE_KIND.side,
        boundary.a,
        sideOuterOffset,
      )
      appendVertex(
        outputPositions,
        outputNormals,
        outputFragmentIds,
        outputSurfaceKinds,
        outputSourceVertexIds,
        outputShellOffsets,
        innerA,
        sideNormal,
        fragment,
        WAX_SURFACE_KIND.side,
        boundary.a,
        innerClearance,
      )
      appendVertex(
        outputPositions,
        outputNormals,
        outputFragmentIds,
        outputSurfaceKinds,
        outputSourceVertexIds,
        outputShellOffsets,
        innerB,
        sideNormal,
        fragment,
        WAX_SURFACE_KIND.side,
        boundary.b,
        innerClearance,
      )
      appendVertex(
        outputPositions,
        outputNormals,
        outputFragmentIds,
        outputSurfaceKinds,
        outputSourceVertexIds,
        outputShellOffsets,
        outerB,
        sideNormal,
        fragment,
        WAX_SURFACE_KIND.side,
        boundary.b,
        sideOuterOffset,
      )
      sideTriangles.push(
        {
          a: sideStart,
          b: sideStart + 1,
          c: sideStart + 2,
          fragmentId: fragment,
          surfaceKind: WAX_SURFACE_KIND.side,
          sourceTriangleId: -1,
        },
        {
          a: sideStart,
          b: sideStart + 2,
          c: sideStart + 3,
          fragmentId: fragment,
          surfaceKind: WAX_SURFACE_KIND.side,
          sourceTriangleId: -1,
        },
      )
    }

    const vertexEnd = outputPositions.length / 3
    const averageNormal = normalizeVector(
      weightedNormalX,
      weightedNormalY,
      weightedNormalZ,
    )
    fragments.push({
      id: fragment,
      sourceTriangleIndices: Uint32Array.from(sourceTriangleIds),
      sourceVertexIndices: Uint32Array.from(sourceVertexIds),
      neighborFragmentIds: new Uint16Array(),
      bondIds: new Uint16Array(),
      centroid: [
        weightedCentroidX / surfaceArea,
        weightedCentroidY / surfaceArea,
        weightedCentroidZ / surfaceArea,
      ],
      averageNormal,
      surfaceArea,
      vertexRange: { start: vertexStart, count: vertexEnd - vertexStart },
      outerVertexRange: {
        start: outerVertexStart,
        count: sourceVertexIds.length,
      },
      innerVertexRange: {
        start: innerVertexStart,
        count: sourceVertexIds.length,
      },
      sideVertexRange: {
        start: sideVertexStart,
        count: vertexEnd - sideVertexStart,
      },
      outerTriangleRange: {
        start: outerTriangleStart,
        count: sourceTriangleIds.length,
      },
      innerTriangleRange: {
        start: innerTriangleStart,
        count: sourceTriangleIds.length,
      },
      sideTriangleRange: {
        start: sideTriangleStart,
        count: sideTriangles.length - sideTriangleStart,
      },
    })
  }

  const outerTriangleCount = outerTriangles.length
  const innerTriangleCount = innerTriangles.length
  for (const fragment of fragments) {
    fragment.innerTriangleRange.start += outerTriangleCount
    fragment.sideTriangleRange.start +=
      outerTriangleCount + innerTriangleCount
  }

  const orderedTriangles = [
    ...outerTriangles,
    ...innerTriangles,
    ...sideTriangles,
  ]
  const outputIndices: number[] = []
  const triangleFragmentIds = new Uint16Array(orderedTriangles.length)
  const triangleSurfaceKinds = new Uint8Array(orderedTriangles.length)
  const triangleSourceTriangleIds = new Int32Array(orderedTriangles.length)

  for (let triangle = 0; triangle < orderedTriangles.length; triangle += 1) {
    const record = orderedTriangles[triangle]
    outputIndices.push(record.a, record.b, record.c)
    triangleFragmentIds[triangle] = record.fragmentId
    triangleSurfaceKinds[triangle] = record.surfaceKind
    triangleSourceTriangleIds[triangle] = record.sourceTriangleId
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(outputPositions, 3),
  )
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(outputNormals, 3),
  )
  geometry.setAttribute(
    'fragmentId',
    new THREE.Uint16BufferAttribute(outputFragmentIds, 1),
  )
  geometry.setAttribute(
    'surfaceKind',
    new THREE.Uint8BufferAttribute(outputSurfaceKinds, 1),
  )
  geometry.setAttribute(
    'sourceVertexId',
    new THREE.Uint32BufferAttribute(outputSourceVertexIds, 1),
  )
  geometry.setAttribute(
    'shellOffset',
    new THREE.Float32BufferAttribute(outputShellOffsets, 1),
  )
  geometry.setIndex(outputIndices)
  geometry.clearGroups()
  geometry.addGroup(0, outerTriangleCount * 3, 0)
  geometry.addGroup(
    outerTriangleCount * 3,
    innerTriangleCount * 3,
    1,
  )
  geometry.addGroup(
    (outerTriangleCount + innerTriangleCount) * 3,
    sideTriangles.length * 3,
    2,
  )
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const bondAccumulators = [...bondMap.values()].sort(
    (left, right) =>
      left.fragmentA - right.fragmentA ||
      left.fragmentB - right.fragmentB,
  )
  const bonds = createBondMetadata(
    bondAccumulators,
    fragments,
    source,
    outerOffset,
    seed,
  )

  return {
    geometry,
    triangleFragmentIds,
    triangleSurfaceKinds,
    triangleSourceTriangleIds,
    fragments,
    bonds,
  }
}

export function createWaxTopology({
  sourceGeometry,
  plateCount = DEFAULT_WAX_PLATE_COUNT,
  seed = DEFAULT_WAX_TOPOLOGY_SEED,
  innerClearance = DEFAULT_WAX_INNER_CLEARANCE,
  outerOffset = DEFAULT_WAX_OUTER_OFFSET,
}: CreateWaxTopologyOptions = {}): WaxTopology {
  const normalizedSeed = seed >>> 0
  if (!Number.isInteger(plateCount) || plateCount < 1) {
    throw new Error('Wax topology plateCount must be a positive integer.')
  }
  const roundedPlateCount = plateCount
  if (
    !Number.isFinite(innerClearance) ||
    !Number.isFinite(outerOffset) ||
    innerClearance < 0 ||
    outerOffset <= innerClearance
  ) {
    throw new Error(
      'Wax topology offsets must satisfy 0 <= innerClearance < outerOffset.',
    )
  }

  const ownsSourceGeometry = !sourceGeometry
  const sourceMesh = sourceGeometry ?? createRoundedCuboidGeometry()

  try {
    const sourceData = readSourceSurface(sourceMesh)
    if (roundedPlateCount > sourceData.triangleCount || roundedPlateCount > 0xffff) {
      throw new Error(
        'Wax topology plateCount cannot exceed the source triangle count or 65,535.',
      )
    }

    const graphData = buildSourceGraph(
      sourceData.vertexCount,
      sourceData.triangleCount,
      sourceData.positions,
      sourceData.indices,
    )
    const edgeRecordMap = new Map(
      graphData.edgeRecords.map((edge) => [edgeKey(edge.a, edge.b), edge]),
    )
    const seeds = chooseSeeds(
      graphData.graph,
      roundedPlateCount,
      normalizedSeed,
    )
    const sourceTriangleFragmentIds = partitionTriangles(
      graphData.graph,
      seeds,
    )
    const source: WaxSourceSurface = {
      vertexCount: sourceData.vertexCount,
      triangleCount: sourceData.triangleCount,
      positions: sourceData.positions,
      normals: sourceData.normals,
      indices: sourceData.indices,
      triangleCentroids: graphData.triangleCentroids,
      triangleNormals: graphData.triangleNormals,
      triangleAreas: graphData.triangleAreas,
      triangleNeighbors: graphData.triangleNeighbors,
    }
    const assembled = assembleGeometry(
      source,
      graphData.triangles,
      graphData.edgeRecords,
      edgeRecordMap,
      sourceTriangleFragmentIds,
      roundedPlateCount,
      innerClearance,
      outerOffset,
      normalizedSeed,
    )

    return {
      ...assembled,
      seed: normalizedSeed,
      plateCount: roundedPlateCount,
      innerClearance,
      outerOffset,
      thickness: outerOffset - innerClearance,
      source,
      sourceTriangleFragmentIds,
    }
  } finally {
    if (ownsSourceGeometry) {
      sourceMesh.dispose()
    }
  }
}

export const createWaxShellTopology = createWaxTopology

export function getWaxTriangleMetadata(
  topology: WaxTopology,
  faceIndex: number,
): WaxTriangleMetadata | null {
  if (
    !Number.isInteger(faceIndex) ||
    faceIndex < 0 ||
    faceIndex >= topology.triangleFragmentIds.length
  ) {
    return null
  }

  const sourceTriangleId = topology.triangleSourceTriangleIds[faceIndex]
  return {
    fragmentId: topology.triangleFragmentIds[faceIndex],
    surfaceKind: topology.triangleSurfaceKinds[
      faceIndex
    ] as WaxSurfaceKind,
    sourceTriangleId: sourceTriangleId >= 0 ? sourceTriangleId : null,
  }
}
