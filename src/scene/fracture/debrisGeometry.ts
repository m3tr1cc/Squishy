const MAX_COLLIDER_SUPPORT_POINTS = 48

type FragmentAdjacency = Readonly<{
  neighborFragmentIds: ArrayLike<number>
}>

function hashUint32(value: number) {
  let hash = value >>> 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

function chooseDebrisClusterSize(seed: number, maximum: number) {
  const roll = hashUint32(seed) / 0x100000000
  const target = roll < 0.35 ? 1 : roll < 0.7 ? 2 : roll < 0.9 ? 3 : 4
  return Math.min(maximum, target)
}

export function selectColliderSupportPoints(
  vertices: ArrayLike<number>,
  maximumPointCount = MAX_COLLIDER_SUPPORT_POINTS,
) {
  if (
    !Number.isInteger(maximumPointCount) ||
    maximumPointCount < 4
  ) {
    throw new Error('maximumPointCount must be an integer of at least four')
  }

  const pointCount = Math.floor(vertices.length / 3)
  if (pointCount <= maximumPointCount) {
    return Float32Array.from(vertices)
  }

  const selected = new Uint8Array(pointCount)
  const indices: number[] = []
  const addIndex = (index: number) => {
    if (selected[index] === 0) {
      selected[index] = 1
      indices.push(index)
    }
  }

  for (let axis = 0; axis < 3; axis += 1) {
    let minimumIndex = 0
    let maximumIndex = 0
    let minimum = Number.POSITIVE_INFINITY
    let maximum = Number.NEGATIVE_INFINITY
    for (let point = 0; point < pointCount; point += 1) {
      const value = vertices[point * 3 + axis]
      if (value < minimum) {
        minimum = value
        minimumIndex = point
      }
      if (value > maximum) {
        maximum = value
        maximumIndex = point
      }
    }
    addIndex(minimumIndex)
    addIndex(maximumIndex)
  }

  while (indices.length < maximumPointCount) {
    let candidateIndex = -1
    let candidateDistance = -1
    for (let point = 0; point < pointCount; point += 1) {
      if (selected[point] !== 0) {
        continue
      }
      const pointOffset = point * 3
      let nearestDistance = Number.POSITIVE_INFINITY
      for (const chosen of indices) {
        const chosenOffset = chosen * 3
        const deltaX =
          vertices[pointOffset] - vertices[chosenOffset]
        const deltaY =
          vertices[pointOffset + 1] - vertices[chosenOffset + 1]
        const deltaZ =
          vertices[pointOffset + 2] - vertices[chosenOffset + 2]
        const distance =
          deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ
        nearestDistance = Math.min(nearestDistance, distance)
      }
      if (nearestDistance > candidateDistance) {
        candidateDistance = nearestDistance
        candidateIndex = point
      }
    }
    if (candidateIndex < 0 || candidateDistance <= 1e-10) {
      break
    }
    addIndex(candidateIndex)
  }

  const supportPoints = new Float32Array(indices.length * 3)
  for (let index = 0; index < indices.length; index += 1) {
    const sourceOffset = indices[index] * 3
    const outputOffset = index * 3
    supportPoints[outputOffset] = vertices[sourceOffset]
    supportPoints[outputOffset + 1] = vertices[sourceOffset + 1]
    supportPoints[outputOffset + 2] = vertices[sourceOffset + 2]
  }
  return supportPoints
}

/**
 * Partitions one frame's detachments into stable, connected groups. Starting
 * with the lowest remaining fragment ID makes the result independent of event
 * order, while breadth-first growth prevents a group from spanning a gap.
 */
export function groupConnectedFragments(
  fragmentIndices: readonly number[],
  fragments: readonly FragmentAdjacency[],
  maximumClusterSize: number,
  seed: number,
) {
  if (
    !Number.isInteger(maximumClusterSize) ||
    maximumClusterSize < 1
  ) {
    throw new Error('maximumClusterSize must be a positive integer')
  }
  const ordered = [...new Set(fragmentIndices)].sort(
    (left, right) => left - right,
  )
  const remaining = new Set(ordered)
  const clusters: number[][] = []

  for (const fragmentIndex of ordered) {
    if (!remaining.delete(fragmentIndex)) {
      continue
    }
    const targetClusterSize = chooseDebrisClusterSize(
      seed ^ Math.imul(fragmentIndex + 1, 0x9e3779b1),
      maximumClusterSize,
    )
    const cluster = [fragmentIndex]
    let cursor = 0
    while (
      cursor < cluster.length &&
      cluster.length < targetClusterSize
    ) {
      const neighbors = fragments[cluster[cursor]]?.neighborFragmentIds
      if (neighbors) {
        const orderedNeighbors = Array.from(neighbors).sort(
          (left, right) => left - right,
        )
        for (const neighbor of orderedNeighbors) {
          if (remaining.delete(neighbor)) {
            cluster.push(neighbor)
            if (cluster.length >= targetClusterSize) {
              break
            }
          }
        }
      }
      cursor += 1
    }
    clusters.push(cluster)
  }

  return clusters
}
