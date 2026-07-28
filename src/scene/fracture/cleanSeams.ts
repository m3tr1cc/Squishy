import * as THREE from 'three'
import {
  WAX_SEAM_PROFILE,
  type WaxSeamProfile,
  type WaxSourceSurface,
} from './types'

const DISTANCE_EPSILON = 1e-10

type CleanSeamSettings = Readonly<{
  tolerance: number
  maximumDisplacement: number
  minimumAreaRatio: number
  normalCosine: number
  processClosedChains: boolean
  applyPerChain: boolean
}>

const STANDARD_SEAM_SETTINGS: CleanSeamSettings = Object.freeze({
  tolerance: 0.085,
  maximumDisplacement: 0.09,
  minimumAreaRatio: 0.15,
  normalCosine: Math.cos(THREE.MathUtils.degToRad(7)),
  processClosedChains: false,
  applyPerChain: false,
})

const LONG_SEAM_SETTINGS: CleanSeamSettings = Object.freeze({
  tolerance: 0.24,
  maximumDisplacement: 0.24,
  minimumAreaRatio: 0.15,
  normalCosine: Math.cos(THREE.MathUtils.degToRad(24)),
  processClosedChains: true,
  applyPerChain: true,
})

type BoundaryEdgeRecord = {
  a: number
  b: number
  triangleA: number
  triangleB: number
}

type BoundaryAccumulator = {
  fragmentA: number
  fragmentB: number
  edges: Array<readonly [number, number]>
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

function buildBoundaryChains(
  edges: readonly (readonly [number, number])[],
) {
  const adjacency = new Map<number, number[]>()
  const remainingEdges = new Set<string>()

  for (const [a, b] of edges) {
    const neighborsA = adjacency.get(a)
    if (neighborsA) {
      neighborsA.push(b)
    } else {
      adjacency.set(a, [b])
    }
    const neighborsB = adjacency.get(b)
    if (neighborsB) {
      neighborsB.push(a)
    } else {
      adjacency.set(b, [a])
    }
    remainingEdges.add(edgeKey(a, b))
  }
  for (const neighbors of adjacency.values()) {
    neighbors.sort((a, b) => a - b)
  }

  const chains: number[][] = []
  const walkChain = (start: number, firstNeighbor: number) => {
    const chain = [start]
    let previous = start
    let current = firstNeighbor
    remainingEdges.delete(edgeKey(previous, current))
    chain.push(current)

    while ((adjacency.get(current)?.length ?? 0) === 2) {
      const neighbors = adjacency.get(current)!
      const next = neighbors[0] === previous ? neighbors[1] : neighbors[0]
      const key = edgeKey(current, next)
      if (!remainingEdges.has(key)) {
        break
      }
      remainingEdges.delete(key)
      chain.push(next)
      previous = current
      current = next
    }
    return chain
  }

  const boundaryStarts = [...adjacency.entries()]
    .filter(([, neighbors]) => neighbors.length !== 2)
    .map(([vertex]) => vertex)
    .sort((a, b) => a - b)
  for (const start of boundaryStarts) {
    for (const neighbor of adjacency.get(start) ?? []) {
      if (remainingEdges.has(edgeKey(start, neighbor))) {
        chains.push(walkChain(start, neighbor))
      }
    }
  }

  while (remainingEdges.size > 0) {
    const firstKey = [...remainingEdges].sort()[0]
    const separator = firstKey.indexOf(':')
    const start = Number(firstKey.slice(0, separator))
    const neighbor = Number(firstKey.slice(separator + 1))
    chains.push(walkChain(start, neighbor))
  }

  return chains
}

function splitClosedBoundaryChain(chain: readonly number[]) {
  const terminal = chain.length - 1
  if (
    terminal < 3 ||
    chain[0] !== chain[terminal]
  ) {
    return [chain]
  }

  const ring = chain.slice(0, terminal)
  let start = 0
  for (let index = 1; index < ring.length; index += 1) {
    if (ring[index] < ring[start]) {
      start = index
    }
  }
  const ordered = [
    ...ring.slice(start),
    ...ring.slice(0, start),
  ]
  const opposite = Math.floor(ordered.length / 2)
  return [
    ordered.slice(0, opposite + 1),
    [...ordered.slice(opposite), ordered[0]],
  ]
}

function dotSourceNormals(
  sourceNormals: Float32Array,
  vertexA: number,
  vertexB: number,
) {
  const offsetA = vertexA * 3
  const offsetB = vertexB * 3
  return (
    sourceNormals[offsetA] * sourceNormals[offsetB] +
    sourceNormals[offsetA + 1] * sourceNormals[offsetB + 1] +
    sourceNormals[offsetA + 2] * sourceNormals[offsetB + 2]
  )
}

function pointToSegmentDistance(
  positions: Float32Array,
  pointVertex: number,
  startVertex: number,
  endVertex: number,
) {
  const pointOffset = pointVertex * 3
  const startOffset = startVertex * 3
  const endOffset = endVertex * 3
  const segmentX = positions[endOffset] - positions[startOffset]
  const segmentY = positions[endOffset + 1] - positions[startOffset + 1]
  const segmentZ = positions[endOffset + 2] - positions[startOffset + 2]
  const segmentLengthSquared =
    segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ
  const interpolation =
    segmentLengthSquared > DISTANCE_EPSILON
      ? clamp(
          ((positions[pointOffset] - positions[startOffset]) * segmentX +
            (positions[pointOffset + 1] - positions[startOffset + 1]) *
              segmentY +
            (positions[pointOffset + 2] - positions[startOffset + 2]) *
              segmentZ) /
            segmentLengthSquared,
          0,
          1,
        )
      : 0
  return Math.hypot(
    positions[pointOffset] -
      (positions[startOffset] + segmentX * interpolation),
    positions[pointOffset + 1] -
      (positions[startOffset + 1] + segmentY * interpolation),
    positions[pointOffset + 2] -
      (positions[startOffset + 2] + segmentZ * interpolation),
  )
}

function addSimplifiedBoundaryAnchors(
  chain: readonly number[],
  start: number,
  end: number,
  positions: Float32Array,
  anchors: Set<number>,
  tolerance: number,
) {
  if (end - start < 2) {
    return
  }

  let furthestIndex = -1
  let furthestDistance = tolerance
  for (let index = start + 1; index < end; index += 1) {
    const distance = pointToSegmentDistance(
      positions,
      chain[index],
      chain[start],
      chain[end],
    )
    if (distance > furthestDistance) {
      furthestDistance = distance
      furthestIndex = index
    }
  }
  if (furthestIndex < 0) {
    return
  }

  anchors.add(furthestIndex)
  addSimplifiedBoundaryAnchors(
    chain,
    start,
    furthestIndex,
    positions,
    anchors,
    tolerance,
  )
  addSimplifiedBoundaryAnchors(
    chain,
    furthestIndex,
    end,
    positions,
    anchors,
    tolerance,
  )
}

function createLinearizedBoundaryUpdates(
  chain: readonly number[],
  source: WaxSourceSurface,
  junctionVertices: ReadonlySet<number>,
  settings: CleanSeamSettings,
) {
  const forcedAnchors = new Set<number>([0, chain.length - 1])
  let normalSpanStart = 0

  for (let index = 1; index < chain.length - 1; index += 1) {
    if (junctionVertices.has(chain[index])) {
      forcedAnchors.add(index)
      normalSpanStart = index
      continue
    }
    if (
      dotSourceNormals(
        source.normals,
        chain[normalSpanStart],
        chain[index + 1],
      ) < settings.normalCosine
    ) {
      forcedAnchors.add(index)
      normalSpanStart = index
    }
  }

  const normalAnchors = [...forcedAnchors].sort((a, b) => a - b)
  const anchors = new Set(normalAnchors)
  for (let index = 0; index < normalAnchors.length - 1; index += 1) {
    addSimplifiedBoundaryAnchors(
      chain,
      normalAnchors[index],
      normalAnchors[index + 1],
      source.positions,
      anchors,
      settings.tolerance,
    )
  }

  const orderedAnchors = [...anchors].sort((a, b) => a - b)
  const updates = new Map<number, readonly [number, number, number]>()
  for (let anchorIndex = 0; anchorIndex < orderedAnchors.length - 1; anchorIndex += 1) {
    const start = orderedAnchors[anchorIndex]
    const end = orderedAnchors[anchorIndex + 1]
    if (end - start < 2) {
      continue
    }

    const cumulativeLengths = new Float64Array(end - start + 1)
    let totalLength = 0
    for (let index = start + 1; index <= end; index += 1) {
      const previousOffset = chain[index - 1] * 3
      const currentOffset = chain[index] * 3
      totalLength += Math.hypot(
        source.positions[currentOffset] -
          source.positions[previousOffset],
        source.positions[currentOffset + 1] -
          source.positions[previousOffset + 1],
        source.positions[currentOffset + 2] -
          source.positions[previousOffset + 2],
      )
      cumulativeLengths[index - start] = totalLength
    }
    if (totalLength <= DISTANCE_EPSILON) {
      continue
    }

    const startOffset = chain[start] * 3
    const endOffset = chain[end] * 3
    for (let index = start + 1; index < end; index += 1) {
      const vertex = chain[index]
      if (junctionVertices.has(vertex)) {
        continue
      }
      const interpolation = cumulativeLengths[index - start] / totalLength
      const vertexOffset = vertex * 3
      let targetX =
        source.positions[startOffset] +
        (source.positions[endOffset] - source.positions[startOffset]) *
          interpolation
      let targetY =
        source.positions[startOffset + 1] +
        (source.positions[endOffset + 1] -
          source.positions[startOffset + 1]) *
          interpolation
      let targetZ =
        source.positions[startOffset + 2] +
        (source.positions[endOffset + 2] -
          source.positions[startOffset + 2]) *
          interpolation
      const displacementX = targetX - source.positions[vertexOffset]
      const displacementY = targetY - source.positions[vertexOffset + 1]
      const displacementZ = targetZ - source.positions[vertexOffset + 2]
      const displacement = Math.hypot(
        displacementX,
        displacementY,
        displacementZ,
      )
      if (displacement > settings.maximumDisplacement) {
        const scale = settings.maximumDisplacement / displacement
        targetX =
          source.positions[vertexOffset] + displacementX * scale
        targetY =
          source.positions[vertexOffset + 1] + displacementY * scale
        targetZ =
          source.positions[vertexOffset + 2] + displacementZ * scale
      }
      updates.set(vertex, [targetX, targetY, targetZ])
    }
  }
  return updates
}

function applyBoundaryUpdates(
  source: WaxSourceSurface,
  updates: ReadonlyMap<number, readonly [number, number, number]>,
  incidentTriangles: readonly number[][],
  scale: number,
  minimumAreaRatio: number,
) {
  if (updates.size === 0) {
    return true
  }

  const affectedTriangles = new Set<number>()
  for (const [vertex, target] of updates) {
    if (!target.every(Number.isFinite)) {
      return false
    }
    for (const triangle of incidentTriangles[vertex]) {
      affectedTriangles.add(triangle)
    }
  }

  const coordinate = (vertex: number, axis: number) => {
    const sourceCoordinate = source.positions[vertex * 3 + axis]
    const target = updates.get(vertex)
    return target
      ? sourceCoordinate + (target[axis] - sourceCoordinate) * scale
      : sourceCoordinate
  }
  for (const triangle of affectedTriangles) {
    const triangleOffset = triangle * 3
    const vertexA = source.indices[triangleOffset]
    const vertexB = source.indices[triangleOffset + 1]
    const vertexC = source.indices[triangleOffset + 2]
    const abX = coordinate(vertexB, 0) - coordinate(vertexA, 0)
    const abY = coordinate(vertexB, 1) - coordinate(vertexA, 1)
    const abZ = coordinate(vertexB, 2) - coordinate(vertexA, 2)
    const acX = coordinate(vertexC, 0) - coordinate(vertexA, 0)
    const acY = coordinate(vertexC, 1) - coordinate(vertexA, 1)
    const acZ = coordinate(vertexC, 2) - coordinate(vertexA, 2)
    const crossX = abY * acZ - abZ * acY
    const crossY = abZ * acX - abX * acZ
    const crossZ = abX * acY - abY * acX
    const area = Math.hypot(crossX, crossY, crossZ) * 0.5
    const normalOffset = triangle * 3
    const orientation =
      crossX * source.triangleNormals[normalOffset] +
      crossY * source.triangleNormals[normalOffset + 1] +
      crossZ * source.triangleNormals[normalOffset + 2]
    if (
      orientation <= DISTANCE_EPSILON ||
      area <
        source.triangleAreas[triangle] *
          minimumAreaRatio
    ) {
      return false
    }
  }

  for (const [vertex, target] of updates) {
    const offset = vertex * 3
    source.positions[offset] +=
      (target[0] - source.positions[offset]) * scale
    source.positions[offset + 1] +=
      (target[1] - source.positions[offset + 1]) * scale
    source.positions[offset + 2] +=
      (target[2] - source.positions[offset + 2]) * scale
  }
  return true
}

function expandBoundaryUpdates(
  source: WaxSourceSurface,
  boundaryUpdates: ReadonlyMap<
    number,
    readonly [number, number, number]
  >,
  boundaryVertices: ReadonlySet<number>,
  sourceNeighbors: readonly ReadonlySet<number>[],
) {
  const accumulatedDisplacements = new Float64Array(
    source.positions.length,
  )
  const accumulatedWeights = new Float32Array(source.vertexCount)
  const addDisplacement = (
    vertex: number,
    displacementX: number,
    displacementY: number,
    displacementZ: number,
    falloff: number,
  ) => {
    if (boundaryVertices.has(vertex)) {
      return
    }
    const offset = vertex * 3
    accumulatedDisplacements[offset] += displacementX * falloff
    accumulatedDisplacements[offset + 1] += displacementY * falloff
    accumulatedDisplacements[offset + 2] += displacementZ * falloff
    accumulatedWeights[vertex] += 1
  }

  for (const [vertex, target] of boundaryUpdates) {
    const offset = vertex * 3
    const displacementX = target[0] - source.positions[offset]
    const displacementY = target[1] - source.positions[offset + 1]
    const displacementZ = target[2] - source.positions[offset + 2]
    for (const firstNeighbor of sourceNeighbors[vertex]) {
      addDisplacement(
        firstNeighbor,
        displacementX,
        displacementY,
        displacementZ,
        0.65,
      )
      for (const secondNeighbor of sourceNeighbors[firstNeighbor]) {
        if (secondNeighbor !== vertex) {
          addDisplacement(
            secondNeighbor,
            displacementX,
            displacementY,
            displacementZ,
            0.25,
          )
        }
      }
    }
  }

  const expanded = new Map(boundaryUpdates)
  for (let vertex = 0; vertex < source.vertexCount; vertex += 1) {
    const weight = accumulatedWeights[vertex]
    if (weight <= 0) {
      continue
    }
    const offset = vertex * 3
    expanded.set(vertex, [
      source.positions[offset] +
        accumulatedDisplacements[offset] / weight,
      source.positions[offset + 1] +
        accumulatedDisplacements[offset + 1] / weight,
      source.positions[offset + 2] +
        accumulatedDisplacements[offset + 2] / weight,
    ])
  }
  return expanded
}

function refreshTriangleMetrics(source: WaxSourceSurface) {
  for (let triangle = 0; triangle < source.triangleCount; triangle += 1) {
    const indexOffset = triangle * 3
    const a = source.indices[indexOffset] * 3
    const b = source.indices[indexOffset + 1] * 3
    const c = source.indices[indexOffset + 2] * 3
    const abX = source.positions[b] - source.positions[a]
    const abY = source.positions[b + 1] - source.positions[a + 1]
    const abZ = source.positions[b + 2] - source.positions[a + 2]
    const acX = source.positions[c] - source.positions[a]
    const acY = source.positions[c + 1] - source.positions[a + 1]
    const acZ = source.positions[c + 2] - source.positions[a + 2]
    const crossX = abY * acZ - abZ * acY
    const crossY = abZ * acX - abX * acZ
    const crossZ = abX * acY - abY * acX
    const crossLength = Math.hypot(crossX, crossY, crossZ)
    const metricOffset = triangle * 3
    source.triangleCentroids[metricOffset] =
      (source.positions[a] +
        source.positions[b] +
        source.positions[c]) /
      3
    source.triangleCentroids[metricOffset + 1] =
      (source.positions[a + 1] +
        source.positions[b + 1] +
        source.positions[c + 1]) /
      3
    source.triangleCentroids[metricOffset + 2] =
      (source.positions[a + 2] +
        source.positions[b + 2] +
        source.positions[c + 2]) /
      3
    source.triangleNormals[metricOffset] = crossX / crossLength
    source.triangleNormals[metricOffset + 1] = crossY / crossLength
    source.triangleNormals[metricOffset + 2] = crossZ / crossLength
    source.triangleAreas[triangle] = crossLength * 0.5
  }
}

/**
 * Triangle ownership makes an otherwise smooth partition follow the source
 * grid. Redistribute those existing boundary samples onto a few stable line
 * segments, then ease the displacement into nearby non-boundary vertices.
 * No vertices or triangles are added, so raycast IDs and fracture topology stay
 * unchanged.
 */
export function straightenBoundaryPositions(
  source: WaxSourceSurface,
  edgeRecords: readonly BoundaryEdgeRecord[],
  sourceTriangleFragmentIds: Uint16Array,
  seamProfile: WaxSeamProfile = WAX_SEAM_PROFILE.standard,
) {
  const settings =
    seamProfile === WAX_SEAM_PROFILE.long
      ? LONG_SEAM_SETTINGS
      : STANDARD_SEAM_SETTINGS
  const bondMap = new Map<string, BoundaryAccumulator>()
  const boundaryPairsByVertex = Array.from(
    { length: source.vertexCount },
    () => new Set<string>(),
  )
  for (const edge of edgeRecords) {
    const ownerA = sourceTriangleFragmentIds[edge.triangleA]
    const ownerB = sourceTriangleFragmentIds[edge.triangleB]
    if (ownerA === ownerB) {
      continue
    }
    const key = fragmentPairKey(ownerA, ownerB)
    const accumulator = bondMap.get(key)
    if (accumulator) {
      accumulator.edges.push([edge.a, edge.b])
    } else {
      bondMap.set(key, {
        fragmentA: Math.min(ownerA, ownerB),
        fragmentB: Math.max(ownerA, ownerB),
        edges: [[edge.a, edge.b]],
      })
    }
    boundaryPairsByVertex[edge.a].add(key)
    boundaryPairsByVertex[edge.b].add(key)
  }

  const junctionVertices = new Set<number>()
  for (let vertex = 0; vertex < boundaryPairsByVertex.length; vertex += 1) {
    if (boundaryPairsByVertex[vertex].size > 1) {
      junctionVertices.add(vertex)
    }
  }
  const incidentTriangles = Array.from(
    { length: source.vertexCount },
    () => [] as number[],
  )
  const sourceNeighbors = Array.from(
    { length: source.vertexCount },
    () => new Set<number>(),
  )
  for (let triangle = 0; triangle < source.triangleCount; triangle += 1) {
    const offset = triangle * 3
    const a = source.indices[offset]
    const b = source.indices[offset + 1]
    const c = source.indices[offset + 2]
    incidentTriangles[a].push(triangle)
    incidentTriangles[b].push(triangle)
    incidentTriangles[c].push(triangle)
    sourceNeighbors[a].add(b)
    sourceNeighbors[a].add(c)
    sourceNeighbors[b].add(a)
    sourceNeighbors[b].add(c)
    sourceNeighbors[c].add(a)
    sourceNeighbors[c].add(b)
  }

  const accumulators = [...bondMap.values()].sort(
    (left, right) =>
      left.fragmentA - right.fragmentA ||
      left.fragmentB - right.fragmentB,
  )
  const updateSums = new Map<
    number,
    { x: number; y: number; z: number; count: number }
  >()
  const boundaryUpdateGroups: Array<
    ReadonlyMap<number, readonly [number, number, number]>
  > = []
  for (const accumulator of accumulators) {
    for (const rawChain of buildBoundaryChains(accumulator.edges)) {
      const chains =
        settings.processClosedChains
          ? splitClosedBoundaryChain(rawChain)
          : [rawChain]
      for (const chain of chains) {
        if (
          chain.length < 3 ||
          chain[0] === chain[chain.length - 1]
        ) {
          continue
        }
        const chainUpdates = createLinearizedBoundaryUpdates(
          chain,
          source,
          junctionVertices,
          settings,
        )
        if (
          settings.applyPerChain &&
          chainUpdates.size > 0
        ) {
          boundaryUpdateGroups.push(chainUpdates)
          continue
        }
        for (const [vertex, target] of chainUpdates) {
          const sum = updateSums.get(vertex)
          if (sum) {
            sum.x += target[0]
            sum.y += target[1]
            sum.z += target[2]
            sum.count += 1
          } else {
            updateSums.set(vertex, {
              x: target[0],
              y: target[1],
              z: target[2],
              count: 1,
            })
          }
        }
      }
    }
  }

  const boundaryUpdates = new Map<
    number,
    readonly [number, number, number]
  >()
  for (const [vertex, sum] of updateSums) {
    boundaryUpdates.set(vertex, [
      sum.x / sum.count,
      sum.y / sum.count,
      sum.z / sum.count,
    ])
  }
  const boundaryVertices = new Set<number>()
  for (let vertex = 0; vertex < boundaryPairsByVertex.length; vertex += 1) {
    if (boundaryPairsByVertex[vertex].size > 0) {
      boundaryVertices.add(vertex)
    }
  }
  let applied = false
  const applySafely = (
    updates: ReadonlyMap<
      number,
      readonly [number, number, number]
    >,
  ) => {
    const expandedUpdates = expandBoundaryUpdates(
      source,
      updates,
      boundaryVertices,
      sourceNeighbors,
    )
    for (const scale of [1, 0.8, 0.6, 0.4]) {
      if (
        applyBoundaryUpdates(
          source,
          expandedUpdates,
          incidentTriangles,
          scale,
          settings.minimumAreaRatio,
        )
      ) {
        return true
      }
    }
    return false
  }

  if (settings.applyPerChain) {
    for (const updates of boundaryUpdateGroups) {
      applied = applySafely(updates) || applied
    }
  } else {
    applied = applySafely(boundaryUpdates)
  }
  if (applied) {
    refreshTriangleMetrics(source)
  }
}
