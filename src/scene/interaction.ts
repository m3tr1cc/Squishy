import * as THREE from 'three'
import type {
  SquishyImpact,
  SurfaceHit,
  SurfaceLayer,
  VectorTuple,
} from './types'

function tuple(vector: THREE.Vector3): VectorTuple {
  return Object.freeze([vector.x, vector.y, vector.z]) as VectorTuple
}

export function interpolateLocalSurfaceNormal(
  object: THREE.Mesh,
  localPoint: THREE.Vector3,
  face: THREE.Face,
) {
  const geometry = object.geometry
  const positions = geometry.getAttribute('position')
  const normals = geometry.getAttribute('normal')
  const a = new THREE.Vector3().fromBufferAttribute(positions, face.a)
  const b = new THREE.Vector3().fromBufferAttribute(positions, face.b)
  const c = new THREE.Vector3().fromBufferAttribute(positions, face.c)
  const barycentric = THREE.Triangle.getBarycoord(
    localPoint,
    a,
    b,
    c,
    new THREE.Vector3(),
  )

  if (!barycentric) {
    return face.normal.clone().normalize()
  }

  const normalA = new THREE.Vector3().fromBufferAttribute(normals, face.a)
  const normalB = new THREE.Vector3().fromBufferAttribute(normals, face.b)
  const normalC = new THREE.Vector3().fromBufferAttribute(normals, face.c)

  return normalA
    .multiplyScalar(barycentric.x)
    .addScaledVector(normalB, barycentric.y)
    .addScaledVector(normalC, barycentric.z)
    .normalize()
}

export function createSquishyImpact({
  id,
  timestampMs,
  pointerType,
  object,
  worldPoint,
  face,
}: {
  id: string
  timestampMs: number
  pointerType: SquishyImpact['pointerType']
  object: THREE.Mesh
  worldPoint: THREE.Vector3
  face: THREE.Face
}): SquishyImpact {
  object.updateWorldMatrix(true, false)
  const localPoint = object.worldToLocal(worldPoint.clone())
  const localNormal = interpolateLocalSurfaceNormal(object, localPoint, face)
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld)
  const worldNormal = localNormal.clone().applyMatrix3(normalMatrix).normalize()

  return Object.freeze({
    id,
    timestampMs,
    pointerType,
    localPoint: tuple(localPoint),
    localNormal: tuple(localNormal),
    worldPoint: tuple(worldPoint),
    worldNormal: tuple(worldNormal),
  })
}

export function createSurfaceHit({
  id,
  timestampMs,
  pointerType,
  pointerId,
  pressure,
  layer,
  fragmentId,
  faceIndex,
  object,
  worldPoint,
  face,
}: {
  id: string
  timestampMs: number
  pointerType: SquishyImpact['pointerType']
  pointerId: number
  pressure: number
  layer: SurfaceLayer
  fragmentId: number | null
  faceIndex: number
  object: THREE.Mesh
  worldPoint: THREE.Vector3
  face: THREE.Face
}): SurfaceHit {
  return Object.freeze({
    ...createSquishyImpact({
      id,
      timestampMs,
      pointerType,
      object,
      worldPoint,
      face,
    }),
    faceIndex,
    fragmentId,
    layer,
    pointerId,
    pressure,
  })
}

export function isQualifiedTap({
  startX,
  startY,
  endX,
  endY,
  durationMs,
}: {
  startX: number
  startY: number
  endX: number
  endY: number
  durationMs: number
}) {
  return (
    Math.hypot(endX - startX, endY - startY) <= 10 &&
    durationMs <= 450
  )
}
