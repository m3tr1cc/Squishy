import * as THREE from 'three'
import { sampleDentDepthValues } from '../deformation'
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

export type WaxGeometryRuntime = {
  readonly geometry: THREE.BufferGeometry
  readonly restPositions: Float32Array
  readonly restNormals: Float32Array
  readonly sourceVertexIds: Uint32Array
  readonly shellOffsets: Float32Array
  readonly fragmentIds: Uint16Array
  readonly surfaceKinds: Uint8Array
  readonly pivots: Float32Array
  readonly peelAxes: Float32Array
  readonly poseScratch: WaxFragmentPoses
}

const positionScratch = new THREE.Vector3()
const pivotScratch = new THREE.Vector3()
const normalScratch = new THREE.Vector3()
const quaternionScratch = new THREE.Quaternion()

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
  const pivots = new Float32Array(topology.plateCount * 3)
  const peelAxes = new Float32Array(topology.plateCount * 3)

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
    sourceVertexIds: new Uint32Array(sourceVertexIds.array),
    shellOffsets: new Float32Array(shellOffsets.array),
    fragmentIds: new Uint16Array(fragmentIds.array),
    surfaceKinds: new Uint8Array(surfaceKinds.array),
    pivots,
    peelAxes,
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
  fractureModel,
  fractureState,
  impacts,
  peelAmounts,
  fragmentPoses = runtime.poseScratch,
}: {
  runtime: WaxGeometryRuntime
  topology: WaxTopology
  fractureModel: FractureModel
  fractureState: FractureState
  impacts: readonly DentImpact[]
  peelAmounts: Float32Array
  fragmentPoses?: WaxFragmentPoses
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
      const dent = sampleDentDepthValues(
        sourceX,
        sourceY,
        sourceZ,
        surfaceNormalX,
        surfaceNormalY,
        surfaceNormalZ,
        impacts,
      )
      const pivotX = runtime.pivots[fragmentOffset]
      const pivotY = runtime.pivots[fragmentOffset + 1]
      const pivotZ = runtime.pivots[fragmentOffset + 2]
      const degree =
        fractureModel.incidentStarts[fragmentId + 1] -
        fractureModel.incidentStarts[fragmentId]
      const brokenRatio =
        degree > 0
          ? fractureState.fragmentBrokenBonds[fragmentId] / degree
          : 0
      const crackRetraction = Math.min(0.04, brokenRatio * 0.05)
      const tangentialScale = 1 - crackRetraction

      x =
        pivotX +
        (sourceX + surfaceNormalX * shellOffset - pivotX) *
          tangentialScale -
        surfaceNormalX * dent
      y =
        pivotY +
        (sourceY + surfaceNormalY * shellOffset - pivotY) *
          tangentialScale -
        surfaceNormalY * dent
      z =
        pivotZ +
        (sourceZ + surfaceNormalZ * shellOffset - pivotZ) *
          tangentialScale -
        surfaceNormalZ * dent

      const peel = peelAmounts[fragmentId]
      if (peel > 1e-4) {
        const angle = peel * 0.44
        quaternionScratch.setFromAxisAngle(
          normalScratch.fromArray(runtime.peelAxes, fragmentOffset),
          angle,
        )
        pivotScratch.set(
          pivotX - surfaceNormalX * dent,
          pivotY - surfaceNormalY * dent,
          pivotZ - surfaceNormalZ * dent,
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
