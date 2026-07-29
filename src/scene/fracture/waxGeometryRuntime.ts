import * as THREE from 'three'
import {
  DEFAULT_DENT_PROFILE,
  sampleDentDepthValues,
  type DentProfile,
  type MutableSurfaceDisplacement,
  type SurfaceDisplacementSampler,
} from '../deformation'
import type { DentImpact } from '../types'
import type { FractureModel, FractureState } from './damage'
import { FRAGMENT_STATE } from './damage'
import type { WaxTopology } from './types'
import { WAX_SURFACE_KIND } from './types'

export type WaxFragmentPoses = {
  readonly valid: Uint8Array
  readonly positions: Float32Array
  readonly quaternions: Float32Array
}

type BondIndexArray = Uint16Array | Uint32Array

export type WaxGeometryRuntime = {
  readonly geometry: THREE.BufferGeometry
  readonly restPositions: Float32Array
  readonly restNormals: Float32Array
  readonly sourceVertexIds: Uint32Array
  readonly shellOffsets: Float32Array
  readonly fragmentIds: Uint16Array
  readonly surfaceKinds: Uint8Array
  readonly pivots: Float32Array
  readonly pivotDisplacements: Float32Array
  readonly peelAxes: Float32Array
  readonly seamInfluenceStarts: Uint32Array
  readonly seamInfluenceBondIds: BondIndexArray
  readonly seamInfluenceSigns: Int8Array
  readonly seamInfluenceWeights: Uint8Array
  readonly seamBondDirections: Float32Array
  readonly seamBondOpenings: Float32Array
  readonly poseScratch: WaxFragmentPoses
}

const MIN_SEAM_OPENING = 0.012
const MAX_SEAM_OPENING = 0.028
const MAX_SEAM_HALF_DISPLACEMENT = MAX_SEAM_OPENING * 0.5
const FULL_SEAM_WEIGHT = 255
const SMOOTHED_SEAM_WEIGHT = Math.round(FULL_SEAM_WEIGHT * 0.35)

const positionScratch = new THREE.Vector3()
const pivotScratch = new THREE.Vector3()
const normalScratch = new THREE.Vector3()
const quaternionScratch = new THREE.Quaternion()
const displacementScratch: MutableSurfaceDisplacement = {
  x: 0,
  y: 0,
  z: 0,
}

function choosePeelAxis(
  normalX: number,
  normalY: number,
  normalZ: number,
  fragmentId: number,
) {
  const phase = fragmentId * 2.399963229728653
  const tangentX = Math.cos(phase)
  const tangentY = Math.sin(phase)
  const tangentZ = Math.sin(phase * 0.5) * 0.35
  const dot =
    tangentX * normalX + tangentY * normalY + tangentZ * normalZ
  let axisX = tangentX - normalX * dot
  let axisY = tangentY - normalY * dot
  let axisZ = tangentZ - normalZ * dot
  let length = Math.hypot(axisX, axisY, axisZ)

  if (length < 1e-5) {
    axisX = normalY
    axisY = -normalX
    axisZ = 0
    length = Math.max(1e-5, Math.hypot(axisX, axisY))
  }

  return [axisX / length, axisY / length, axisZ / length] as const
}

function createBondIndexArray(length: number, bondCount: number) {
  return bondCount <= 0xffff
    ? new Uint16Array(length)
    : new Uint32Array(length)
}

function buildSourceNeighbors(topology: WaxTopology) {
  const neighbors = Array.from(
    { length: topology.source.vertexCount },
    () => new Set<number>(),
  )
  const indices = topology.source.indices

  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset]
    const b = indices[offset + 1]
    const c = indices[offset + 2]
    neighbors[a].add(b)
    neighbors[a].add(c)
    neighbors[b].add(a)
    neighbors[b].add(c)
    neighbors[c].add(a)
    neighbors[c].add(b)
  }

  return neighbors
}

function createSeamInfluences(
  topology: WaxTopology,
  fragmentIds: Uint16Array,
  sourceVertexIds: Uint32Array,
) {
  const outputVerticesByFragment = Array.from(
    { length: topology.plateCount },
    () => new Map<number, number[]>(),
  )
  for (let vertex = 0; vertex < fragmentIds.length; vertex += 1) {
    const fragmentMap = outputVerticesByFragment[fragmentIds[vertex]]
    const sourceVertex = sourceVertexIds[vertex]
    const outputVertices = fragmentMap.get(sourceVertex)
    if (outputVertices) {
      outputVertices.push(vertex)
    } else {
      fragmentMap.set(sourceVertex, [vertex])
    }
  }

  const boundaryVerticesByFragment = Array.from(
    { length: topology.plateCount },
    () => new Set<number>(),
  )
  for (const bond of topology.bonds) {
    const boundaryA = boundaryVerticesByFragment[bond.fragmentA]
    const boundaryB = boundaryVerticesByFragment[bond.fragmentB]
    for (
      let cursor = 0;
      cursor < bond.boundaryVertexIndices.length;
      cursor += 1
    ) {
      const sourceVertex = bond.boundaryVertexIndices[cursor]
      boundaryA.add(sourceVertex)
      boundaryB.add(sourceVertex)
    }
  }

  const sourceNeighbors = buildSourceNeighbors(topology)
  const recordsByVertex = new Map<
    number,
    Map<number, { sign: -1 | 1; weight: number }>
  >()
  const seamBondDirections = new Float32Array(topology.bonds.length * 3)
  const seamBondOpenings = new Float32Array(topology.bonds.length)
  const meanBondLength =
    topology.bonds.length > 0
      ? topology.bonds.reduce((sum, bond) => sum + bond.length, 0) /
        topology.bonds.length
      : 1

  function addInfluence(
    outputVertex: number,
    bondIndex: number,
    sign: -1 | 1,
    weight: number,
  ) {
    let records = recordsByVertex.get(outputVertex)
    if (!records) {
      records = new Map()
      recordsByVertex.set(outputVertex, records)
    }
    const existing = records.get(bondIndex)
    if (!existing || weight > existing.weight) {
      records.set(bondIndex, { sign, weight })
    }
  }

  function addFragmentInfluence(
    fragmentId: number,
    sourceVertex: number,
    bondIndex: number,
    sign: -1 | 1,
    weight: number,
  ) {
    const outputVertices =
      outputVerticesByFragment[fragmentId].get(sourceVertex)
    if (!outputVertices) {
      return
    }
    for (const outputVertex of outputVertices) {
      addInfluence(outputVertex, bondIndex, sign, weight)
    }
  }

  for (let bondIndex = 0; bondIndex < topology.bonds.length; bondIndex += 1) {
    const bond = topology.bonds[bondIndex]
    const fragmentA = topology.fragments[bond.fragmentA]
    const fragmentB = topology.fragments[bond.fragmentB]
    let directionX = fragmentB.centroid[0] - fragmentA.centroid[0]
    let directionY = fragmentB.centroid[1] - fragmentA.centroid[1]
    let directionZ = fragmentB.centroid[2] - fragmentA.centroid[2]
    let normalX = 0
    let normalY = 0
    let normalZ = 0

    for (
      let cursor = 0;
      cursor < bond.boundaryVertexIndices.length;
      cursor += 1
    ) {
      const sourceOffset = bond.boundaryVertexIndices[cursor] * 3
      normalX += topology.source.normals[sourceOffset]
      normalY += topology.source.normals[sourceOffset + 1]
      normalZ += topology.source.normals[sourceOffset + 2]
    }
    const normalLength = Math.hypot(normalX, normalY, normalZ)
    if (normalLength > 1e-6) {
      normalX /= normalLength
      normalY /= normalLength
      normalZ /= normalLength
      const normalDot =
        directionX * normalX + directionY * normalY + directionZ * normalZ
      directionX -= normalX * normalDot
      directionY -= normalY * normalDot
      directionZ -= normalZ * normalDot
    }
    let directionLength = Math.hypot(directionX, directionY, directionZ)
    if (directionLength < 1e-6) {
      directionX = bond.midpoint[0] - fragmentA.centroid[0]
      directionY = bond.midpoint[1] - fragmentA.centroid[1]
      directionZ = bond.midpoint[2] - fragmentA.centroid[2]
      directionLength = Math.max(
        1e-6,
        Math.hypot(directionX, directionY, directionZ),
      )
    }
    const directionOffset = bondIndex * 3
    seamBondDirections[directionOffset] = directionX / directionLength
    seamBondDirections[directionOffset + 1] = directionY / directionLength
    seamBondDirections[directionOffset + 2] = directionZ / directionLength
    const relativeLength = Math.min(
      1,
      bond.length / Math.max(meanBondLength * 1.75, 1e-6),
    )
    seamBondOpenings[bondIndex] =
      MIN_SEAM_OPENING +
      (MAX_SEAM_OPENING - MIN_SEAM_OPENING) * relativeLength

    const fragmentSides = [
      [bond.fragmentA, -1],
      [bond.fragmentB, 1],
    ] as const
    for (const [fragmentId, sign] of fragmentSides) {
      const fragmentMap = outputVerticesByFragment[fragmentId]
      const fragmentBoundary = boundaryVerticesByFragment[fragmentId]

      for (
        let cursor = 0;
        cursor < bond.boundaryVertexIndices.length;
        cursor += 1
      ) {
        const sourceVertex = bond.boundaryVertexIndices[cursor]
        addFragmentInfluence(
          fragmentId,
          sourceVertex,
          bondIndex,
          sign,
          FULL_SEAM_WEIGHT,
        )

        // Taper the displacement over one source-mesh ring. Other boundary
        // vertices are excluded so an unrelated intact seam is not opened.
        for (const neighbor of sourceNeighbors[sourceVertex]) {
          if (
            fragmentMap.has(neighbor) &&
            !fragmentBoundary.has(neighbor)
          ) {
            addFragmentInfluence(
              fragmentId,
              neighbor,
              bondIndex,
              sign,
              SMOOTHED_SEAM_WEIGHT,
            )
          }
        }
      }
    }
  }

  const seamInfluenceStarts = new Uint32Array(fragmentIds.length + 1)
  let influenceCount = 0
  for (let vertex = 0; vertex < fragmentIds.length; vertex += 1) {
    seamInfluenceStarts[vertex] = influenceCount
    influenceCount += recordsByVertex.get(vertex)?.size ?? 0
  }
  seamInfluenceStarts[fragmentIds.length] = influenceCount

  const seamInfluenceBondIds = createBondIndexArray(
    influenceCount,
    topology.bonds.length,
  )
  const seamInfluenceSigns = new Int8Array(influenceCount)
  const seamInfluenceWeights = new Uint8Array(influenceCount)
  let cursor = 0
  for (let vertex = 0; vertex < fragmentIds.length; vertex += 1) {
    const records = recordsByVertex.get(vertex)
    if (!records) {
      continue
    }
    const orderedRecords = [...records.entries()].sort(
      (left, right) => left[0] - right[0],
    )
    for (const [bondIndex, record] of orderedRecords) {
      seamInfluenceBondIds[cursor] = bondIndex
      seamInfluenceSigns[cursor] = record.sign
      seamInfluenceWeights[cursor] = record.weight
      cursor += 1
    }
  }

  return {
    seamInfluenceStarts,
    seamInfluenceBondIds,
    seamInfluenceSigns,
    seamInfluenceWeights,
    seamBondDirections,
    seamBondOpenings,
  }
}

export function createWaxGeometryRuntime(
  topology: WaxTopology,
): WaxGeometryRuntime {
  const geometry = topology.geometry
  const positions = geometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute
  const normals = geometry.getAttribute(
    'normal',
  ) as THREE.BufferAttribute
  positions.setUsage(THREE.DynamicDrawUsage)
  normals.setUsage(THREE.DynamicDrawUsage)
  const sourceVertexIds = geometry.getAttribute('sourceVertexId')
  const shellOffsets = geometry.getAttribute('shellOffset')
  const fragmentIds = geometry.getAttribute('fragmentId')
  const surfaceKinds = geometry.getAttribute('surfaceKind')
  const fragmentIdValues = new Uint16Array(fragmentIds.array)
  const sourceVertexIdValues = new Uint32Array(sourceVertexIds.array)
  const pivots = new Float32Array(topology.plateCount * 3)
  const peelAxes = new Float32Array(topology.plateCount * 3)
  const seamInfluences = createSeamInfluences(
    topology,
    fragmentIdValues,
    sourceVertexIdValues,
  )

  for (const fragment of topology.fragments) {
    const offset = fragment.id * 3
    const middleOffset =
      (topology.innerClearance + topology.outerOffset) * 0.5
    pivots[offset] =
      fragment.centroid[0] + fragment.averageNormal[0] * middleOffset
    pivots[offset + 1] =
      fragment.centroid[1] + fragment.averageNormal[1] * middleOffset
    pivots[offset + 2] =
      fragment.centroid[2] + fragment.averageNormal[2] * middleOffset
    const axis = choosePeelAxis(
      fragment.averageNormal[0],
      fragment.averageNormal[1],
      fragment.averageNormal[2],
      fragment.id,
    )
    peelAxes[offset] = axis[0]
    peelAxes[offset + 1] = axis[1]
    peelAxes[offset + 2] = axis[2]
  }

  return {
    geometry,
    restPositions: new Float32Array(positions.array),
    restNormals: new Float32Array(normals.array),
    sourceVertexIds: sourceVertexIdValues,
    shellOffsets: new Float32Array(shellOffsets.array),
    fragmentIds: fragmentIdValues,
    surfaceKinds: new Uint8Array(surfaceKinds.array),
    pivots,
    pivotDisplacements: new Float32Array(topology.plateCount * 3),
    peelAxes,
    ...seamInfluences,
    poseScratch: {
      valid: new Uint8Array(topology.plateCount),
      positions: new Float32Array(topology.plateCount * 3),
      quaternions: new Float32Array(topology.plateCount * 4),
    },
  }
}

export function writeWaxGeometry({
  runtime,
  topology,
  fractureState,
  impacts,
  peelAmounts,
  fragmentPoses = runtime.poseScratch,
  dentProfile = DEFAULT_DENT_PROFILE,
  displacementSampler,
}: {
  runtime: WaxGeometryRuntime
  topology: WaxTopology
  fractureModel: FractureModel
  fractureState: FractureState
  impacts: readonly DentImpact[]
  peelAmounts: Float32Array
  fragmentPoses?: WaxFragmentPoses
  dentProfile?: DentProfile
  displacementSampler?: SurfaceDisplacementSampler
}) {
  const positionAttribute = runtime.geometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute
  const normalAttribute = runtime.geometry.getAttribute(
    'normal',
  ) as THREE.BufferAttribute
  const positions = positionAttribute.array as Float32Array
  const normals = normalAttribute.array as Float32Array
  const sourcePositions = topology.source.positions
  const sourceNormals = topology.source.normals
  const pivotDisplacements = runtime.pivotDisplacements

  if (displacementSampler) {
    for (
      let fragmentId = 0;
      fragmentId < topology.fragments.length;
      fragmentId += 1
    ) {
      const fragment = topology.fragments[fragmentId]
      const fragmentOffset = fragmentId * 3
      displacementSampler(
        runtime.pivots[fragmentOffset],
        runtime.pivots[fragmentOffset + 1],
        runtime.pivots[fragmentOffset + 2],
        fragment.averageNormal[0],
        fragment.averageNormal[1],
        fragment.averageNormal[2],
        impacts,
        displacementScratch,
      )
      pivotDisplacements[fragmentOffset] = displacementScratch.x
      pivotDisplacements[fragmentOffset + 1] =
        displacementScratch.y
      pivotDisplacements[fragmentOffset + 2] =
        displacementScratch.z
    }
  } else {
    pivotDisplacements.fill(0)
  }

  for (let vertex = 0; vertex < runtime.fragmentIds.length; vertex += 1) {
    const outputOffset = vertex * 3
    const fragmentId = runtime.fragmentIds[vertex]
    const fragmentOffset = fragmentId * 3
    const sourceOffset = runtime.sourceVertexIds[vertex] * 3
    const sourceX = sourcePositions[sourceOffset]
    const sourceY = sourcePositions[sourceOffset + 1]
    const sourceZ = sourcePositions[sourceOffset + 2]
    const surfaceNormalX = sourceNormals[sourceOffset]
    const surfaceNormalY = sourceNormals[sourceOffset + 1]
    const surfaceNormalZ = sourceNormals[sourceOffset + 2]
    const state = fractureState.fragmentState[fragmentId]
    const shellOffset =
      runtime.surfaceKinds[vertex] === WAX_SURFACE_KIND.side &&
      state === FRAGMENT_STATE.ATTACHED
        ? topology.outerOffset - 0.003
        : runtime.shellOffsets[vertex]
    const poseIsValid =
      state >= FRAGMENT_STATE.DETACHED &&
      fragmentPoses.valid[fragmentId] !== 0

    let x: number
    let y: number
    let z: number
    let normalX = runtime.restNormals[outputOffset]
    let normalY = runtime.restNormals[outputOffset + 1]
    let normalZ = runtime.restNormals[outputOffset + 2]

    if (poseIsValid) {
      const quaternionOffset = fragmentId * 4
      quaternionScratch.set(
        fragmentPoses.quaternions[quaternionOffset],
        fragmentPoses.quaternions[quaternionOffset + 1],
        fragmentPoses.quaternions[quaternionOffset + 2],
        fragmentPoses.quaternions[quaternionOffset + 3],
      )
      pivotScratch.fromArray(runtime.pivots, fragmentOffset)
      positionScratch
        .fromArray(runtime.restPositions, outputOffset)
        .sub(pivotScratch)
        .applyQuaternion(quaternionScratch)
      x =
        positionScratch.x +
        fragmentPoses.positions[fragmentOffset]
      y =
        positionScratch.y +
        fragmentPoses.positions[fragmentOffset + 1]
      z =
        positionScratch.z +
        fragmentPoses.positions[fragmentOffset + 2]
      normalScratch
        .fromArray(runtime.restNormals, outputOffset)
        .applyQuaternion(quaternionScratch)
      normalX = normalScratch.x
      normalY = normalScratch.y
      normalZ = normalScratch.z
    } else {
      const dent = displacementSampler
        ? 0
        : sampleDentDepthValues(
            sourceX,
            sourceY,
            sourceZ,
            surfaceNormalX,
            surfaceNormalY,
            surfaceNormalZ,
            impacts,
            dentProfile,
          )
      if (displacementSampler) {
        displacementSampler(
          sourceX,
          sourceY,
          sourceZ,
          surfaceNormalX,
          surfaceNormalY,
          surfaceNormalZ,
          impacts,
          displacementScratch,
        )
      } else {
        displacementScratch.x = 0
        displacementScratch.y = 0
        displacementScratch.z = 0
      }
      const pivotX = runtime.pivots[fragmentOffset]
      const pivotY = runtime.pivots[fragmentOffset + 1]
      const pivotZ = runtime.pivots[fragmentOffset + 2]
      let seamX = 0
      let seamY = 0
      let seamZ = 0
      const influenceStart = runtime.seamInfluenceStarts[vertex]
      const influenceEnd = runtime.seamInfluenceStarts[vertex + 1]
      for (
        let influence = influenceStart;
        influence < influenceEnd;
        influence += 1
      ) {
        const bondIndex = runtime.seamInfluenceBondIds[influence]
        if (fractureState.bondBroken[bondIndex] === 0) {
          continue
        }
        const seamProgress = Math.min(
          1,
          Math.max(0, fractureState.bondSeamOpen[bondIndex]),
        )
        if (seamProgress <= 1e-5) {
          continue
        }
        const directionOffset = bondIndex * 3
        const signedHalfOpening =
          runtime.seamInfluenceSigns[influence] *
          runtime.seamBondOpenings[bondIndex] *
          0.5 *
          seamProgress *
          (runtime.seamInfluenceWeights[influence] / FULL_SEAM_WEIGHT)
        seamX +=
          runtime.seamBondDirections[directionOffset] * signedHalfOpening
        seamY +=
          runtime.seamBondDirections[directionOffset + 1] * signedHalfOpening
        seamZ +=
          runtime.seamBondDirections[directionOffset + 2] * signedHalfOpening
      }
      const seamLength = Math.hypot(seamX, seamY, seamZ)
      if (seamLength > MAX_SEAM_HALF_DISPLACEMENT) {
        const scale = MAX_SEAM_HALF_DISPLACEMENT / seamLength
        seamX *= scale
        seamY *= scale
        seamZ *= scale
      }

      x =
        sourceX +
        displacementScratch.x +
        surfaceNormalX * shellOffset +
        seamX -
        surfaceNormalX * dent
      y =
        sourceY +
        displacementScratch.y +
        surfaceNormalY * shellOffset +
        seamY -
        surfaceNormalY * dent
      z =
        sourceZ +
        displacementScratch.z +
        surfaceNormalZ * shellOffset +
        seamZ -
        surfaceNormalZ * dent

      const peel = peelAmounts[fragmentId]
      if (peel > 1e-4) {
        const angle = peel * 0.44
        quaternionScratch.setFromAxisAngle(
          normalScratch.fromArray(runtime.peelAxes, fragmentOffset),
          angle,
        )
        pivotScratch.set(
          pivotX +
            pivotDisplacements[fragmentOffset] -
            surfaceNormalX * dent,
          pivotY +
            pivotDisplacements[fragmentOffset + 1] -
            surfaceNormalY * dent,
          pivotZ +
            pivotDisplacements[fragmentOffset + 2] -
            surfaceNormalZ * dent,
        )
        positionScratch
          .set(x, y, z)
          .sub(pivotScratch)
          .applyQuaternion(quaternionScratch)
          .add(pivotScratch)
          .addScaledVector(normalScratch.set(
            surfaceNormalX,
            surfaceNormalY,
            surfaceNormalZ,
          ), peel * 0.055)
        x = positionScratch.x
        y = positionScratch.y
        z = positionScratch.z
        normalScratch
          .set(normalX, normalY, normalZ)
          .applyQuaternion(quaternionScratch)
        normalX = normalScratch.x
        normalY = normalScratch.y
        normalZ = normalScratch.z
      }
    }

    positions[outputOffset] = x
    positions[outputOffset + 1] = y
    positions[outputOffset + 2] = z
    normals[outputOffset] = normalX
    normals[outputOffset + 1] = normalY
    normals[outputOffset + 2] = normalZ
  }

  positionAttribute.needsUpdate = true
  normalAttribute.needsUpdate = true
}
