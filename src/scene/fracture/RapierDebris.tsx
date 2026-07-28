import {
  ConvexHullCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  RoundCuboidCollider,
  type RapierRigidBody,
  useAfterPhysicsStep,
} from '@react-three/rapier'
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import * as THREE from 'three'

export const MOBILE_DEBRIS_BODY_LIMIT = 24
export const DESKTOP_DEBRIS_BODY_LIMIT = 40

const DEFAULT_FRICTION = 0.92
const DEFAULT_RESTITUTION = 0.025
const DEFAULT_LINEAR_DAMPING = 0.34
const DEFAULT_ANGULAR_DAMPING = 0.48
const DEFAULT_GRAVITY = [0, -9.81, 0] as const
const EMPTY_VECTOR = [0, 0, 0] as const
const EMPTY_ROTATION = [0, 0, 0] as const
const IDENTITY_QUATERNION = [0, 0, 0, 1] as const
const EMPTY_STATIC_COLLIDERS: readonly DebrisStaticCollider[] = []

export type DebrisVector3 = readonly [x: number, y: number, z: number]
export type DebrisQuaternion = readonly [
  x: number,
  y: number,
  z: number,
  w: number,
]

/**
 * One convex part of a debris cluster. A cluster with more than one part is
 * represented as a Rapier compound collider on a single rigid body.
 */
export type DebrisConvexPart = Readonly<{
  vertices: ArrayLike<number>
  position?: DebrisVector3
  quaternion?: DebrisQuaternion
  density?: number
}>

/**
 * Detached clusters must be ordered from oldest to newest. `id` stays stable
 * for the lifetime of one generation.
 */
export type DebrisCluster = Readonly<{
  id: string
  colliders: readonly DebrisConvexPart[]
  position: DebrisVector3
  rotation?: DebrisVector3
  linearVelocity?: DebrisVector3
  angularVelocity?: DebrisVector3
  gravityScale?: number
  ccd?: boolean
}>

export type DebrisStaticCollider =
  | Readonly<{
      id: string
      kind: 'cuboid'
      halfExtents: DebrisVector3
      position?: DebrisVector3
      quaternion?: DebrisQuaternion
      friction?: number
      restitution?: number
    }>
  | Readonly<{
      id: string
      kind: 'round-cuboid'
      halfExtents: DebrisVector3
      borderRadius: number
      position?: DebrisVector3
      quaternion?: DebrisQuaternion
      friction?: number
      restitution?: number
    }>
  | Readonly<{
      id: string
      kind: 'convex-hull'
      vertices: ArrayLike<number>
      position?: DebrisVector3
      quaternion?: DebrisQuaternion
      friction?: number
      restitution?: number
    }>

/**
 * The same object and tuple instances are reused for every update from one
 * cluster. Consumers that retain a pose must copy its values.
 */
export type DebrisTransform = {
  position: [x: number, y: number, z: number]
  quaternion: [x: number, y: number, z: number, w: number]
  sleeping: boolean
}

export type DebrisSettleReason = 'sleep' | 'capacity'

export type RapierDebrisProps = Readonly<{
  /**
   * Change this value to destroy the current Rapier world, clear all sleeping
   * bookkeeping, and construct a clean debris generation.
   */
  generation: string | number
  clusters: readonly DebrisCluster[]
  staticColliders?: readonly DebrisStaticCollider[]
  coarsePointer?: boolean
  maxActiveBodies?: number
  gravity?: DebrisVector3
  paused?: boolean
  onTransform?: (clusterId: string, transform: DebrisTransform) => void
  onSettled?: (
    clusterId: string,
    transform: DebrisTransform,
    reason: DebrisSettleReason,
  ) => void
}>

type DebrisPoolProps = Omit<
  RapierDebrisProps,
  'generation' | 'gravity' | 'paused' | 'coarsePointer' | 'maxActiveBodies'
> & {
  bodyLimit: number
}

type DebrisBodyProps = Readonly<{
  cluster: DebrisCluster
  registerBody: (clusterId: string, body: RapierRigidBody | null) => void
  queueSleep: (clusterId: string) => void
}>

function mutableVector3(value: DebrisVector3 | undefined): [number, number, number] {
  const source = value ?? EMPTY_VECTOR
  return [source[0], source[1], source[2]]
}

function mutableQuaternion(
  value: DebrisQuaternion | undefined,
): [number, number, number, number] {
  const source = value ?? IDENTITY_QUATERNION
  return [source[0], source[1], source[2], source[3]]
}

function createInitialTransform(cluster: DebrisCluster): DebrisTransform {
  const euler = cluster.rotation ?? EMPTY_ROTATION
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(euler[0], euler[1], euler[2]),
  )

  return {
    position: mutableVector3(cluster.position),
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    sleeping: false,
  }
}

function publishBodyTransform(
  body: RapierRigidBody,
  transform: DebrisTransform,
  sleeping: boolean,
) {
  const position = body.translation()
  const quaternion = body.rotation()

  transform.position[0] = position.x
  transform.position[1] = position.y
  transform.position[2] = position.z
  transform.quaternion[0] = quaternion.x
  transform.quaternion[1] = quaternion.y
  transform.quaternion[2] = quaternion.z
  transform.quaternion[3] = quaternion.w
  transform.sleeping = sleeping
}

export function detectCoarsePointer() {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.matchMedia?.('(pointer: coarse)').matches === true ||
    navigator.maxTouchPoints > 0
  )
}

/**
 * An override may lower a device's budget but can never exceed the mobile or
 * desktop safety ceiling.
 */
export function resolveDebrisBodyLimit(
  coarsePointer: boolean,
  requestedLimit?: number,
) {
  const ceiling = coarsePointer
    ? MOBILE_DEBRIS_BODY_LIMIT
    : DESKTOP_DEBRIS_BODY_LIMIT

  if (requestedLimit === undefined || !Number.isFinite(requestedLimit)) {
    return ceiling
  }

  return Math.max(0, Math.min(ceiling, Math.floor(requestedLimit)))
}

const StaticColliderSet = memo(function StaticColliderSet({
  colliders,
}: {
  colliders: readonly DebrisStaticCollider[]
}) {
  if (colliders.length === 0) {
    return null
  }

  return (
    <RigidBody type="fixed" colliders={false}>
      {colliders.map((collider) => {
        const sharedProps = {
          position: mutableVector3(collider.position),
          quaternion: mutableQuaternion(collider.quaternion),
          friction: collider.friction ?? DEFAULT_FRICTION,
          restitution: collider.restitution ?? DEFAULT_RESTITUTION,
        }

        if (collider.kind === 'cuboid') {
          return (
            <CuboidCollider
              key={collider.id}
              {...sharedProps}
              args={mutableVector3(collider.halfExtents)}
            />
          )
        }

        if (collider.kind === 'round-cuboid') {
          const halfExtents = mutableVector3(collider.halfExtents)
          return (
            <RoundCuboidCollider
              key={collider.id}
              {...sharedProps}
              args={[
                halfExtents[0],
                halfExtents[1],
                halfExtents[2],
                collider.borderRadius,
              ]}
            />
          )
        }

        return (
          <ConvexHullCollider
            key={collider.id}
            {...sharedProps}
            args={[collider.vertices]}
          />
        )
      })}
    </RigidBody>
  )
})

const DebrisBody = memo(function DebrisBody({
  cluster,
  registerBody,
  queueSleep,
}: DebrisBodyProps) {
  const handleBodyRef = useCallback(
    (body: RapierRigidBody | null) => {
      registerBody(cluster.id, body)
    },
    [cluster.id, registerBody],
  )
  const handleSleep = useCallback(() => {
    // Rapier invokes onSleep while its WASM world is mutably borrowed.
    // Queue only plain data here; body reads and callbacks happen from
    // useAfterPhysicsStep after that borrow has been released.
    queueSleep(cluster.id)
  }, [cluster.id, queueSleep])

  return (
    <RigidBody
      ref={handleBodyRef}
      type="dynamic"
      colliders={false}
      position={mutableVector3(cluster.position)}
      rotation={mutableVector3(cluster.rotation)}
      linearVelocity={mutableVector3(cluster.linearVelocity)}
      angularVelocity={mutableVector3(cluster.angularVelocity)}
      gravityScale={cluster.gravityScale ?? 1}
      linearDamping={DEFAULT_LINEAR_DAMPING}
      angularDamping={DEFAULT_ANGULAR_DAMPING}
      canSleep
      ccd={cluster.ccd ?? true}
      onSleep={handleSleep}
    >
      {cluster.colliders.map((collider, index) => (
        <ConvexHullCollider
          key={index}
          args={[collider.vertices]}
          position={mutableVector3(collider.position)}
          quaternion={mutableQuaternion(collider.quaternion)}
          density={collider.density ?? 1}
          friction={DEFAULT_FRICTION}
          restitution={DEFAULT_RESTITUTION}
        />
      ))}
    </RigidBody>
  )
})

function DebrisPool({
  clusters,
  staticColliders = EMPTY_STATIC_COLLIDERS,
  bodyLimit,
  onTransform,
  onSettled,
}: DebrisPoolProps) {
  const bodiesRef = useRef(new Map<string, RapierRigidBody>())
  const transformsRef = useRef(new Map<string, DebrisTransform>())
  const settledIdsRef = useRef(new Set<string>())
  const capacitySettledIdsRef = useRef(new Set<string>())
  const pendingSleepIdsRef = useRef(new Set<string>())
  const physicsClustersRef = useRef<DebrisCluster[]>([])
  const physicsClusterIdsRef = useRef(new Set<string>())
  const inputClusterIdsRef = useRef(new Set<string>())
  const aliveRef = useRef(true)
  const generationBodyLimitRef = useRef(bodyLimit)
  const onTransformRef = useRef(onTransform)
  const onSettledRef = useRef(onSettled)

  onTransformRef.current = onTransform
  onSettledRef.current = onSettled
  inputClusterIdsRef.current = new Set(clusters.map((cluster) => cluster.id))

  // Parents may retire faded visual clusters. Filtering them here unmounts
  // their matching rigid bodies after the React commit, which releases the
  // Rapier handles and makes capacity available to later flakes.
  physicsClustersRef.current = physicsClustersRef.current.filter(
    (cluster) => inputClusterIdsRef.current.has(cluster.id),
  )
  physicsClusterIdsRef.current.clear()
  for (const cluster of physicsClustersRef.current) {
    physicsClusterIdsRef.current.add(cluster.id)
  }

  for (const cluster of clusters) {
    if (
      physicsClusterIdsRef.current.has(cluster.id) ||
      capacitySettledIdsRef.current.has(cluster.id)
    ) {
      continue
    }
    if (
      physicsClustersRef.current.length <
      generationBodyLimitRef.current
    ) {
      physicsClustersRef.current.push(cluster)
      physicsClusterIdsRef.current.add(cluster.id)
    }
  }
  const physicsClusters = physicsClustersRef.current
  const capacityRetirements = clusters.filter(
    (cluster) =>
      !physicsClusterIdsRef.current.has(cluster.id) &&
      !capacitySettledIdsRef.current.has(cluster.id),
  )

  const getTransform = useCallback((cluster: DebrisCluster) => {
    let transform = transformsRef.current.get(cluster.id)
    if (!transform) {
      transform = createInitialTransform(cluster)
      transformsRef.current.set(cluster.id, transform)
    }
    return transform
  }, [])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      pendingSleepIdsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (capacityRetirements.length === 0) {
      return
    }

    for (const cluster of capacityRetirements) {
      if (
        !aliveRef.current ||
        capacitySettledIdsRef.current.has(cluster.id) ||
        !inputClusterIdsRef.current.has(cluster.id)
      ) {
        continue
      }

      const transform = getTransform(cluster)
      transform.sleeping = true
      capacitySettledIdsRef.current.add(cluster.id)
      settledIdsRef.current.add(cluster.id)
      onTransformRef.current?.(cluster.id, transform)
      onSettledRef.current?.(cluster.id, transform, 'capacity')
    }
  }, [capacityRetirements, getTransform])

  useEffect(() => {
    const currentIds = new Set(clusters.map((cluster) => cluster.id))
    for (const clusterId of transformsRef.current.keys()) {
      if (
        !currentIds.has(clusterId) &&
        !physicsClusterIdsRef.current.has(clusterId)
      ) {
        transformsRef.current.delete(clusterId)
        settledIdsRef.current.delete(clusterId)
        capacitySettledIdsRef.current.delete(clusterId)
      }
    }
  }, [clusters])

  useAfterPhysicsStep(() => {
    if (!aliveRef.current) {
      return
    }

    for (const cluster of physicsClusters) {
      const body = bodiesRef.current.get(cluster.id)
      if (
        !body ||
        !physicsClusterIdsRef.current.has(cluster.id) ||
        !inputClusterIdsRef.current.has(cluster.id)
      ) {
        continue
      }

      const transform = getTransform(cluster)
      const sleepWasQueued = pendingSleepIdsRef.current.delete(cluster.id)
      if (sleepWasQueued) {
        publishBodyTransform(body, transform, true)
        onTransformRef.current?.(cluster.id, transform)
        if (!settledIdsRef.current.has(cluster.id)) {
          settledIdsRef.current.add(cluster.id)
          onSettledRef.current?.(cluster.id, transform, 'sleep')
        }
        continue
      }

      // Sleeping bodies remain mounted for handle stability. If a later piece
      // wakes one through contact, resume visual updates until its next sleep.
      if (!body.isSleeping()) {
        publishBodyTransform(body, transform, false)
        onTransformRef.current?.(cluster.id, transform)
      }
    }
  })

  const queueSleep = useCallback((clusterId: string) => {
    if (
      aliveRef.current &&
      physicsClusterIdsRef.current.has(clusterId) &&
      inputClusterIdsRef.current.has(clusterId)
    ) {
      pendingSleepIdsRef.current.add(clusterId)
    }
  }, [])

  const registerBody = useCallback(
    (clusterId: string, body: RapierRigidBody | null) => {
      if (body) {
        bodiesRef.current.set(clusterId, body)
        return
      }
      bodiesRef.current.delete(clusterId)
    },
    [],
  )

  return (
    <>
      <StaticColliderSet colliders={staticColliders} />
      {physicsClusters.map((cluster) => (
        <DebrisBody
          key={cluster.id}
          cluster={cluster}
          registerBody={registerBody}
          queueSleep={queueSleep}
        />
      ))}
    </>
  )
}

/**
 * Headless rigid-body bridge for wax debris. Render this inside an R3F Canvas.
 *
 * The component intentionally renders no visible meshes. The parent should
 * apply `onTransform` updates to its combined fragment geometry. For code
 * splitting, import this module with `React.lazy` and mount it only after the
 * first cluster detaches; both that lazy boundary and Rapier initialization
 * are safely covered by Suspense.
 */
export function RapierDebris({
  generation,
  clusters,
  staticColliders = EMPTY_STATIC_COLLIDERS,
  coarsePointer,
  maxActiveBodies,
  gravity = DEFAULT_GRAVITY,
  paused = false,
  onTransform,
  onSettled,
}: RapierDebrisProps) {
  const isCoarsePointer = coarsePointer ?? detectCoarsePointer()
  const bodyLimit = resolveDebrisBodyLimit(
    isCoarsePointer,
    maxActiveBodies,
  )

  return (
    <Suspense fallback={null}>
      <Physics
        key={generation}
        gravity={mutableVector3(gravity)}
        paused={paused}
        colliders={false}
        timeStep={1 / 60}
        interpolate
        numSolverIterations={4}
        numInternalPgsIterations={1}
        maxCcdSubsteps={1}
      >
        <DebrisPool
          clusters={clusters}
          staticColliders={staticColliders}
          bodyLimit={bodyLimit}
          onTransform={onTransform}
          onSettled={onSettled}
        />
      </Physics>
    </Suspense>
  )
}

export default RapierDebris
