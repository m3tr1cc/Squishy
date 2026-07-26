import * as THREE from 'three'
import { createRoundedCuboidGeometry } from '../createRoundedCuboidGeometry'
import {
  WAX_FRACTURE_ROLE,
  WAX_SURFACE_KIND,
  type CreateWaxTopologyOptions,
  type WaxBond,
  type WaxFractureRole,
  type WaxFragmentMetadata,
  type WaxSourceSurface,
  type WaxSurfaceKind,
  type WaxTopology,
  type WaxTriangleMetadata,
} from './types'

export const DEFAULT_WAX_PLATE_COUNT = 48
export const DEFAULT_WAX_TOPOLOGY_SEED = 0x57a45eed
export const DEFAULT_WAX_INNER_CLEARANCE = 0.006
export const DEFAULT_WAX_OUTER_OFFSET = 0.055
export const SEED_CANDIDATE_MINIMUM_DISTANCE_RATIO = 0.78
export const WAX_GROWTH_SPEED_MODES = [0.78, 1, 1.28] as const

const DISTANCE_EPSILON = 1e-10
const MINIMUM_SLIVER_TRIANGLE_COUNT = 12

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
  const selectionDistanceRatios: number[] = [1]
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

    let farthestDistance = -1
    for (let triangle = 0; triangle < graph.length; triangle += 1) {
      if (selected[triangle]) {
        continue
      }
      const distance = nearestDistances[triangle]
      if (distance > farthestDistance) {
        farthestDistance = distance
      }
    }

    if (!Number.isFinite(farthestDistance)) {
      throw new Error('Unable to choose the requested number of wax plates.')
    }

    const minimumCandidateDistance =
      farthestDistance * SEED_CANDIDATE_MINIMUM_DISTANCE_RATIO
    const candidates: number[] = []
    for (let triangle = 0; triangle < graph.length; triangle += 1) {
      if (
        !selected[triangle] &&
        nearestDistances[triangle] + DISTANCE_EPSILON >=
          minimumCandidateDistance
      ) {
        candidates.push(triangle)
      }
    }
    if (candidates.length === 0) {
      throw new Error('Unable to find a separated wax plate seed.')
    }

    const candidateHash = hashUint32(
      normalizedSeedSalt(seed, fragment, nextSeed),
    )
    nextSeed = candidates[candidateHash % candidates.length]
    selectionDistanceRatios.push(
      nearestDistances[nextSeed] / farthestDistance,
    )
  }

  return { seeds, selectionDistanceRatios }
}

function normalizedSeedSalt(seed: number, index: number, value: number) {
  return (
    seed ^
    Math.imul(index + 1, 0x9e3779b1) ^
    Math.imul(value + 1, 0x85ebca6b)
  ) >>> 0
}

function createGrowthSpeeds(plateCount: number, seed: number) {
  const modeIndices = Array.from(
    { length: plateCount },
    (_, index) => index % WAX_GROWTH_SPEED_MODES.length,
  )
  for (let index = modeIndices.length - 1; index > 0; index -= 1) {
    const swapIndex =
      hashUint32(normalizedSeedSalt(seed, index, modeIndices[index])) %
      (index + 1)
    const temporary = modeIndices[index]
    modeIndices[index] = modeIndices[swapIndex]
    modeIndices[swapIndex] = temporary
  }

  return Float32Array.from(
    modeIndices,
    (modeIndex) => WAX_GROWTH_SPEED_MODES[modeIndex],
  )
}

function partitionTriangles(
  graph: GraphNeighbor[][],
  seeds: number[],
  growthSpeeds: Float32Array,
) {
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
      const distance =
        current.distance +
        neighbor.distance / growthSpeeds[current.owner]
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

function partitionTrianglesWithSliverGuard(
  graph: GraphNeighbor[][],
  seeds: number[],
  growthSpeeds: Float32Array,
) {
  const minimumTriangleCount = Math.min(
    MINIMUM_SLIVER_TRIANGLE_COUNT,
    Math.max(1, Math.floor(graph.length / seeds.length / 8)),
  )
  let owners = partitionTriangles(graph, seeds, growthSpeeds)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const triangleCounts = new Uint32Array(seeds.length)
    for (const owner of owners) {
      triangleCounts[owner] += 1
    }
    const slivers: number[] = []
    for (let owner = 0; owner < triangleCounts.length; owner += 1) {
      if (triangleCounts[owner] < minimumTriangleCount) {
        slivers.push(owner)
      }
    }
    if (slivers.length === 0) {
      return owners
    }

    for (const owner of slivers) {
      growthSpeeds[owner] =
        WAX_GROWTH_SPEED_MODES[WAX_GROWTH_SPEED_MODES.length - 1]
    }
    owners = partitionTriangles(graph, seeds, growthSpeeds)
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

function fragmentDistance(
  fragmentA: WaxFragmentMetadata,
  fragmentB: WaxFragmentMetadata,
) {
  return Math.hypot(
    fragmentB.centroid[0] - fragmentA.centroid[0],
    fragmentB.centroid[1] - fragmentA.centroid[1],
    fragmentB.centroid[2] - fragmentA.centroid[2],
  )
}

function createFragmentBondAdjacency(
  bonds: WaxBond[],
  fragmentCount: number,
) {
  const adjacency: number[][] = Array.from(
    { length: fragmentCount },
    () => [],
  )
  for (const bond of bonds) {
    adjacency[bond.fragmentA].push(bond.id)
    adjacency[bond.fragmentB].push(bond.id)
  }
  for (const bondIds of adjacency) {
    bondIds.sort((left, right) => left - right)
  }
  return adjacency
}

function otherBondFragment(bond: WaxBond, fragment: number) {
  return bond.fragmentA === fragment ? bond.fragmentB : bond.fragmentA
}

function correlatedFractureField(
  point: readonly [number, number, number],
  seed: number,
) {
  const phaseX = seededUnitFloat(seed, 0x101) * Math.PI * 2
  const phaseY = seededUnitFloat(seed, 0x202) * Math.PI * 2
  const phaseZ = seededUnitFloat(seed, 0x303) * Math.PI * 2
  return clamp(
    0.5 +
      Math.sin(point[0] * 1.37 + phaseX) * 0.24 +
      Math.sin(point[1] * 2.41 + phaseY) * 0.16 +
      Math.sin((point[0] + point[2]) * 0.93 + phaseZ) * 0.1,
    0,
    1,
  )
}

function findVisibleCorridor(
  bonds: WaxBond[],
  fragments: MutableFragmentMetadata[],
  adjacency: number[][],
  visibility: Float32Array,
  start: number,
  end: number,
  targetY: number,
  seed: number,
  salt: number,
  excludedFragments: ReadonlySet<number> = new Set(),
) {
  const distances = new Float64Array(fragments.length)
  distances.fill(Number.POSITIVE_INFINITY)
  const previousBond = new Int32Array(fragments.length)
  previousBond.fill(-1)
  const heap = new MinHeap()
  distances[start] = 0
  heap.push({ distance: 0, triangle: start, owner: 0 })

  let minimumY = Number.POSITIVE_INFINITY
  let maximumY = Number.NEGATIVE_INFINITY
  for (const fragment of fragments) {
    minimumY = Math.min(minimumY, fragment.centroid[1])
    maximumY = Math.max(maximumY, fragment.centroid[1])
  }
  const yRange = Math.max(maximumY - minimumY, 0.1)

  while (heap.size > 0) {
    const current = heap.pop()
    if (
      !current ||
      current.distance !== distances[current.triangle]
    ) {
      continue
    }
    if (current.triangle === end) {
      break
    }

    for (const bondId of adjacency[current.triangle]) {
      const bond = bonds[bondId]
      const next = otherBondFragment(bond, current.triangle)
      if (
        next !== end &&
        next !== start &&
        excludedFragments.has(next)
      ) {
        continue
      }

      const stepDistance = fragmentDistance(
        fragments[current.triangle],
        fragments[next],
      )
      const sharedVisibility = Math.min(
        visibility[current.triangle],
        visibility[next],
      )
      const verticalTravel = Math.abs(
        fragments[next].centroid[1] -
          fragments[current.triangle].centroid[1],
      )
      const horizontalTravel = Math.abs(
        fragments[next].centroid[0] -
          fragments[current.triangle].centroid[0],
      )
      const midpointY =
        (fragments[next].centroid[1] +
          fragments[current.triangle].centroid[1]) /
        2
      const seededVariation =
        0.82 +
        seededUnitFloat(seed, bond.id + salt) * 0.36
      const stepCost =
        stepDistance *
        (1 + (1 - sharedVisibility) * 5.5) *
        (1 + (verticalTravel / (horizontalTravel + 0.12)) * 0.12) *
        (1 + (Math.abs(midpointY - targetY) / yRange) * 1.35) *
        seededVariation
      const nextDistance = current.distance + stepCost
      if (
        nextDistance < distances[next] - DISTANCE_EPSILON ||
        (Math.abs(nextDistance - distances[next]) <=
          DISTANCE_EPSILON &&
          bond.id < previousBond[next])
      ) {
        distances[next] = nextDistance
        previousBond[next] = bond.id
        heap.push({ distance: nextDistance, triangle: next, owner: 0 })
      }
    }
  }

  const corridorBonds = new Set<number>()
  const corridorFragments = new Set<number>([start])
  let cursor = end
  while (cursor !== start && previousBond[cursor] >= 0) {
    const bondId = previousBond[cursor]
    corridorBonds.add(bondId)
    corridorFragments.add(cursor)
    cursor = otherBondFragment(bonds[bondId], cursor)
  }
  if (cursor !== start) {
    return {
      bonds: new Set<number>(),
      fragments: new Set<number>(),
    }
  }
  corridorFragments.add(start)
  return { bonds: corridorBonds, fragments: corridorFragments }
}

function assignFractureRoles(
  bonds: WaxBond[],
  fragments: MutableFragmentMetadata[],
  seed: number,
) {
  if (bonds.length === 0 || fragments.length < 2) {
    return
  }

  const adjacency = createFragmentBondAdjacency(bonds, fragments.length)
  let minimumZ = Number.POSITIVE_INFINITY
  let maximumZ = Number.NEGATIVE_INFINITY
  for (const fragment of fragments) {
    minimumZ = Math.min(minimumZ, fragment.centroid[2])
    maximumZ = Math.max(maximumZ, fragment.centroid[2])
  }
  const zRange = Math.max(maximumZ - minimumZ, DISTANCE_EPSILON)
  const visibility = Float32Array.from(fragments, (fragment) => {
    const normalVisibility = clamp(
      (fragment.averageNormal[2] - 0.15) / 0.85,
      0,
      1,
    )
    const positionVisibility = clamp(
      (fragment.centroid[2] - minimumZ) / zRange,
      0,
      1,
    )
    return normalVisibility * 0.72 + positionVisibility * 0.28
  })

  let visibleFragments = fragments
    .filter((fragment) => visibility[fragment.id] >= 0.58)
    .map((fragment) => fragment.id)
  if (visibleFragments.length < 2) {
    visibleFragments = fragments
      .map((fragment) => fragment.id)
      .sort(
        (left, right) =>
          visibility[right] - visibility[left] || left - right,
      )
      .slice(0, Math.max(2, Math.ceil(fragments.length / 4)))
  }
  let minimumX = Number.POSITIVE_INFINITY
  let maximumX = Number.NEGATIVE_INFINITY
  for (const fragmentId of visibleFragments) {
    minimumX = Math.min(minimumX, fragments[fragmentId].centroid[0])
    maximumX = Math.max(maximumX, fragments[fragmentId].centroid[0])
  }
  const xRange = Math.max(maximumX - minimumX, DISTANCE_EPSILON)
  const leftCandidates = visibleFragments.filter(
    (fragment) =>
      fragments[fragment].centroid[0] <= minimumX + xRange * 0.175,
  )
  const rightCandidates = visibleFragments.filter(
    (fragment) =>
      fragments[fragment].centroid[0] >= maximumX - xRange * 0.175,
  )
  const byUpperBand = (left: number, right: number) =>
    fragments[right].centroid[1] - fragments[left].centroid[1] ||
    left - right
  const byLowerBand = (left: number, right: number) =>
    fragments[left].centroid[1] - fragments[right].centroid[1] ||
    left - right
  leftCandidates.sort(byUpperBand)
  rightCandidates.sort(byUpperBand)
  const upperStart = leftCandidates[0] ?? visibleFragments[0]
  const upperEnd =
    rightCandidates[0] ?? visibleFragments[visibleFragments.length - 1]
  leftCandidates.sort(byLowerBand)
  rightCandidates.sort(byLowerBand)
  const lowerStart = leftCandidates[0] ?? visibleFragments[0]
  const lowerEnd =
    rightCandidates[0] ?? visibleFragments[visibleFragments.length - 1]

  const upperCorridor = findVisibleCorridor(
    bonds,
    fragments,
    adjacency,
    visibility,
    upperStart,
    upperEnd,
    (fragments[upperStart].centroid[1] +
      fragments[upperEnd].centroid[1]) /
      2,
    seed,
    0x401,
  )
  const lowerCorridor = findVisibleCorridor(
    bonds,
    fragments,
    adjacency,
    visibility,
    lowerStart,
    lowerEnd,
    (fragments[lowerStart].centroid[1] +
      fragments[lowerEnd].centroid[1]) /
      2,
    seed,
    0x701,
    upperCorridor.fragments,
  )
  const trunkBondIds = new Set<number>([
    ...upperCorridor.bonds,
    ...lowerCorridor.bonds,
  ])

  const parents = Int32Array.from(
    { length: fragments.length },
    (_, index) => index,
  )
  const ranks = new Uint8Array(fragments.length)
  const findRoot = (fragment: number) => {
    let root = fragment
    while (parents[root] !== root) {
      root = parents[root]
    }
    let cursor = fragment
    while (parents[cursor] !== cursor) {
      const parent = parents[cursor]
      parents[cursor] = root
      cursor = parent
    }
    return root
  }
  const connect = (fragmentA: number, fragmentB: number) => {
    const rootA = findRoot(fragmentA)
    const rootB = findRoot(fragmentB)
    if (rootA === rootB) {
      return false
    }
    if (ranks[rootA] < ranks[rootB]) {
      parents[rootA] = rootB
    } else {
      parents[rootB] = rootA
      if (ranks[rootA] === ranks[rootB]) {
        ranks[rootA] += 1
      }
    }
    return true
  }
  for (const bondId of trunkBondIds) {
    const bond = bonds[bondId]
    connect(bond.fragmentA, bond.fragmentB)
  }

  const branchBondIds = new Set<number>()
  const branchCandidates = bonds
    .filter((bond) => !trunkBondIds.has(bond.id))
    .map((bond) => ({
      bond,
      cost:
        fragmentDistance(
          fragments[bond.fragmentA],
          fragments[bond.fragmentB],
        ) *
        (0.82 + correlatedFractureField(bond.midpoint, seed) * 0.36),
    }))
    .sort(
      (left, right) =>
        left.cost - right.cost || left.bond.id - right.bond.id,
    )
  for (const candidate of branchCandidates) {
    const { bond } = candidate
    if (connect(bond.fragmentA, bond.fragmentB)) {
      branchBondIds.add(bond.id)
    }
  }
  const networkRoot = findRoot(0)
  for (let fragment = 1; fragment < fragments.length; fragment += 1) {
    if (findRoot(fragment) !== networkRoot) {
      throw new Error('Unable to construct a connected wax weakness network.')
    }
  }

  for (const bond of bonds) {
    const field = correlatedFractureField(bond.midpoint, seed)
    let fractureRole: WaxFractureRole
    let toughness: number
    if (trunkBondIds.has(bond.id)) {
      fractureRole = WAX_FRACTURE_ROLE.trunk
      toughness = 0.5 + field * 0.18
    } else if (branchBondIds.has(bond.id)) {
      fractureRole = WAX_FRACTURE_ROLE.branch
      toughness = 0.7 + field * 0.16
    } else {
      fractureRole = WAX_FRACTURE_ROLE.ordinary
      toughness = 1 + field * 0.24
    }
    bond.fractureRole = fractureRole
    bond.toughness = toughness
  }
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
      fractureRole: WAX_FRACTURE_ROLE.ordinary,
      toughness: 1,
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

  assignFractureRoles(bonds, fragments, seed)
  return bonds
}

function assembleGeometry(
  source: WaxSourceSurface,
  triangles: TriangleRecord[],
  edgeRecords: EdgeRecord[],
  edgeRecordMap: ReadonlyMap<string, EdgeRecord>,
  sourceTriangleFragmentIds: Uint16Array,
  seedTriangleIds: Uint32Array,
  growthSpeeds: Float32Array,
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
      seedTriangleId: seedTriangleIds[fragment],
      growthSpeed: growthSpeeds[fragment],
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
    const seedSelection = chooseSeeds(
      graphData.graph,
      roundedPlateCount,
      normalizedSeed,
    )
    const { seeds } = seedSelection
    const seedTriangleIds = Uint32Array.from(seeds)
    const seedSelectionDistanceRatios = Float32Array.from(
      seedSelection.selectionDistanceRatios,
    )
    const growthSpeeds = createGrowthSpeeds(
      roundedPlateCount,
      normalizedSeed,
    )
    const sourceTriangleFragmentIds = partitionTrianglesWithSliverGuard(
      graphData.graph,
      seeds,
      growthSpeeds,
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
      seedTriangleIds,
      growthSpeeds,
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
      seedTriangleIds,
      seedSelectionDistanceRatios,
      growthSpeeds,
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
