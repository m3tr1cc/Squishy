import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import {
  BUTTER_SIZE,
  CORNER_RADIUS,
  MAX_ACTIVE_IMPACTS,
} from './constants'
import { createButterLabelGeometry } from './createButterLabelGeometry'
import { createRoundedCuboidGeometry } from './createRoundedCuboidGeometry'
import {
  BUTTER_SOURCE_SEGMENTS,
  BUTTER_STACK_PLATE_COUNT,
  type ButterId,
  type ButterVector3,
  type ButterWaxPalette,
} from './butters'
import {
  captureDeformationSource,
  writeDeformedPositions,
} from './deformation'
import {
  createFractureModel,
  createFractureState,
  FRAGMENT_STATE,
  markFragmentsSettled,
  stepFracture,
  type FracturePress,
} from './fracture/damage'
import {
  groupConnectedFragments,
  selectColliderSupportPoints,
} from './fracture/debrisGeometry'
import {
  createFragmentFadeState,
  detachFragmentForFade,
  isFragmentRetired,
  markFragmentSleepingForFade,
  shouldSimulateFragment,
  stepFragmentFade,
} from './fracture/fragmentFade'
import {
  attachFragmentFadeColorAttribute,
  writeFragmentFadeColorAlpha,
} from './fracture/fragmentFadeGeometry'
import type {
  DebrisCluster,
  DebrisStaticCollider,
  DebrisTransform,
} from './fracture/RapierDebris'
import {
  createWaxGeometryRuntime,
  writeWaxGeometry,
} from './fracture/waxGeometryRuntime'
import {
  createWaxTopology,
  getWaxTriangleMetadata,
} from './fracture/topology'
import { WAX_SEAM_PROFILE } from './fracture/types'
import {
  bindPointerCancellation,
  createSurfaceHit,
  isQualifiedTap,
} from './interaction'
import {
  INTRO_SPRING,
  PRESS_SPRING,
  stepSpring,
} from './spring'
import {
  type SquishyVisualSignals,
  writeSquishyVisualSignals,
} from './synesthesia'
import type {
  DentImpact,
  SquishyImpact,
  SurfaceHit,
  SurfaceLayer,
} from './types'

type ButterSquishyProps = {
  bodyColor: string
  coatingSeed: number
  instanceId: ButterId
  labelTexture: THREE.Texture
  position: ButterVector3
  reducedMotion: boolean
  waxPalette: ButterWaxPalette
  onComplete: () => void
  onPhysicsDebrisChange: (
    instanceId: ButterId,
    source: ButterPhysicsDebrisSource | null,
  ) => void
  playCrackSound: (brokenBondCount: number) => void
  unlockCrackAudio: () => void
  visualSignals?: SquishyVisualSignals
  onImpact?: (impact: SquishyImpact) => void
}

export type ButterPhysicsDebrisSource = Readonly<{
  clusters: readonly DebrisCluster[]
  onTransform: (clusterId: string, transform: DebrisTransform) => void
  onSettled: (clusterId: string, transform: DebrisTransform) => void
}>

type MutableFracturePress = {
  fragmentIndex?: number
  localPoint: SurfaceHit['localPoint']
  localNormal: SurfaceHit['localNormal']
  pressure: number
  durationSeconds: number
}

type ActivePress = {
  pointerId: number
  pointerType: SurfaceHit['pointerType']
  startX: number
  startY: number
  startedAt: number
  hit: SurfaceHit
  dent: DentImpact
  damageInput: MutableFracturePress
}

type TapPulse = {
  input: MutableFracturePress
  remainingSeconds: number
}

type DebrisClusterBinding = Readonly<{
  fragmentIndices: readonly number[]
  /** Fragment-pivot offsets in the rigid body's local coordinate system. */
  localOffsets: Float32Array
}>

const DEFAULT_NORMAL = [0, 0, 1] as const
export const PRESENTATION_ROTATION = [0, 0, 0] as const
export const WAX_OUTER_MATERIAL = {
  attenuationColor: '#ddd8cf',
  attenuationDistance: 0.35,
  color: '#e8e4dc',
  clearcoat: 0,
  ior: 1.44,
  metalness: 0,
  opacity: 1,
  roughness: 0.74,
  sheen: 0.03,
  specularIntensity: 0.25,
  thickness: 0.049,
  transmission: 0.1,
  transparent: false,
} as const
const MINIMUM_TAP_PULSE_SECONDS = 0.16
const TOUCH_DAMAGE_DELAY_SECONDS = 0.08
const MAX_DEBRIS_CLUSTER_SIZE = 4
const NO_RAYCAST = () => null
const REDUCED_PRESS_SPRING = {
  ...PRESS_SPRING,
  damping: 31,
} as const

let impactSequence = 0

export function createButterStaticColliders(
  bodyPositions: readonly ButterVector3[],
  groundY: number,
): readonly DebrisStaticCollider[] {
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...PRESENTATION_ROTATION),
  )
  return [
    ...bodyPositions.map(
      (bodyPosition, index): DebrisStaticCollider => ({
        id: `butter-body-${index}`,
        kind: 'round-cuboid',
        halfExtents: [
          BUTTER_SIZE.width / 2 - CORNER_RADIUS - 0.06,
          BUTTER_SIZE.height / 2 - CORNER_RADIUS - 0.06,
          BUTTER_SIZE.depth / 2 - CORNER_RADIUS - 0.06,
        ],
        borderRadius: CORNER_RADIUS - 0.06,
        position: bodyPosition,
        quaternion: [
          quaternion.x,
          quaternion.y,
          quaternion.z,
          quaternion.w,
        ],
        friction: 0.88,
        restitution: 0.015,
      }),
    ),
    {
      id: 'tabletop',
      kind: 'cuboid',
      halfExtents: [20, 0.05, 20],
      position: [0, groundY - 0.05, 0],
      friction: 0.94,
      restitution: 0.01,
    },
  ]
}

function normalizePointerType(value: string): SurfaceHit['pointerType'] {
  if (value === 'touch' || value === 'pen') {
    return value
  }
  return 'mouse'
}

function findWeakestInactiveImpact(
  impacts: DentImpact[],
  activeDents: ReadonlySet<DentImpact>,
) {
  let selectedIndex = -1
  let selectedAmount = Number.POSITIVE_INFINITY

  for (let index = 0; index < impacts.length; index += 1) {
    const impact = impacts[index]
    if (
      !activeDents.has(impact) &&
      Math.abs(impact.amount) < selectedAmount
    ) {
      selectedIndex = index
      selectedAmount = Math.abs(impact.amount)
    }
  }

  return selectedIndex
}

export const ButterSquishy = memo(function ButterSquishy({
  bodyColor,
  coatingSeed,
  instanceId,
  labelTexture,
  position,
  reducedMotion,
  waxPalette,
  onComplete,
  onPhysicsDebrisChange,
  playCrackSound,
  unlockCrackAudio,
  visualSignals,
  onImpact,
}: ButterSquishyProps) {
  const presentationRef = useRef<THREE.Group>(null)
  const compressionRef = useRef<THREE.Group>(null)
  const innerGeometry = useMemo(
    () =>
      createRoundedCuboidGeometry({
        widthSegments: BUTTER_SOURCE_SEGMENTS.width,
        heightSegments: BUTTER_SOURCE_SEGMENTS.height,
        depthSegments: BUTTER_SOURCE_SEGMENTS.depth,
      }),
    [],
  )
  const labelGeometry = useMemo(() => createButterLabelGeometry(), [])
  const innerSource = useMemo(
    () => captureDeformationSource(innerGeometry),
    [innerGeometry],
  )
  const labelSource = useMemo(
    () => captureDeformationSource(labelGeometry),
    [labelGeometry],
  )
  const waxTopology = useMemo(
    () =>
      createWaxTopology({
        sourceGeometry: innerGeometry,
        seed: coatingSeed,
        plateCount: BUTTER_STACK_PLATE_COUNT,
        seamProfile: WAX_SEAM_PROFILE.long,
      }),
    [coatingSeed, innerGeometry],
  )
  const waxRuntime = useMemo(
    () => createWaxGeometryRuntime(waxTopology),
    [waxTopology],
  )
  const waxColorAttribute = useMemo(
    () => attachFragmentFadeColorAttribute(waxRuntime.geometry),
    [waxRuntime],
  )
  const fractureModel = useMemo(
    () =>
      createFractureModel(
        {
          fragments: waxTopology.fragments.map((fragment) => ({
            id: fragment.id,
            centroid: fragment.centroid,
            normal: fragment.averageNormal,
          })),
          bonds: waxTopology.bonds.map((bond) => ({
            id: bond.id,
            fragmentA: bond.fragmentA,
            fragmentB: bond.fragmentB,
            length: bond.length,
            toughness: bond.toughness,
            role: bond.fractureRole,
          })),
        },
        {
          propagationRadius: 0.78,
          damagePerSecond: 4.2,
          holdRampSeconds: 0.25,
          holdStrength: 0.8,
          crackContinuation: 0.32,
          globalCompressionFatigue: 0.01,
          tipStressTransfer: 0.55,
          tipStressDecay: 0.82,
          maxTipBranches: 2,
          peelBrokenRatio: 0.78,
          detachBrokenRatio: 0.99,
          minimumPeelSeconds: 0.22,
          settleCandidateSeconds: 0.2,
        },
      ),
    [waxTopology],
  )
  const fractureStateRef = useRef(createFractureState(fractureModel))
  const fragmentFadeStateRef = useRef(
    createFragmentFadeState(waxTopology.plateCount),
  )
  const lastFragmentAlphaRef = useRef(
    new Float32Array(waxTopology.plateCount).fill(1),
  )
  const impactsRef = useRef<DentImpact[]>([])
  const activeDentsRef = useRef(new Set<DentImpact>())
  const activePressesRef = useRef(new Map<number, ActivePress>())
  const tapPulsesRef = useRef<TapPulse[]>([])
  const pressInputsRef = useRef<FracturePress[]>([])
  const peelAmountsRef = useRef(new Float32Array(waxTopology.plateCount))
  const fragmentPosesRef = useRef(waxRuntime.poseScratch)
  const geometryDirtyRef = useRef(true)
  const bodyNeedsRestoreRef = useRef(true)
  const historyRef = useRef<SquishyImpact[]>([])
  const introRef = useRef({
    value: reducedMotion ? 1 : 0.72,
    velocity: 0,
  })
  const springScratchRef = useRef({ value: 0, velocity: 0 })
  const lastInteractionRef = useRef(performance.now())
  const completionSentRef = useRef(false)
  const clusterBindingsRef = useRef(
    new Map<string, DebrisClusterBinding>(),
  )
  const inverseWorldMatrixRef = useRef(new THREE.Matrix4())
  const parentWorldQuaternionRef = useRef(new THREE.Quaternion())
  const worldQuaternionRef = useRef(new THREE.Quaternion())
  const localQuaternionRef = useRef(new THREE.Quaternion())
  const worldPositionRef = useRef(new THREE.Vector3())
  const localPositionRef = useRef(new THREE.Vector3())
  const [debrisClusters, setDebrisClusters] = useState<DebrisCluster[]>([])
  const [physicsDebrisClusters, setPhysicsDebrisClusters] =
    useState<DebrisCluster[]>([])
  const canvasElement = useThree((state) => state.gl.domElement)

  useEffect(() => {
    writeDeformedPositions(innerGeometry, innerSource, [], 0)
    writeDeformedPositions(labelGeometry, labelSource, [], 0)
    writeWaxGeometry({
      runtime: waxRuntime,
      topology: waxTopology,
      fractureModel,
      fractureState: fractureStateRef.current,
      impacts: [],
      peelAmounts: peelAmountsRef.current,
    })
    waxRuntime.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      12,
    )

    return () => {
      innerGeometry.dispose()
      labelGeometry.dispose()
      waxRuntime.geometry.dispose()
      canvasElement.classList.remove('wax-pointer-hover')
    }
  }, [
    fractureModel,
    innerGeometry,
    innerSource,
    labelGeometry,
    labelSource,
    canvasElement,
    waxRuntime,
    waxTopology,
  ])

  const rememberImpact = useCallback(
    (impact: SquishyImpact) => {
      const history = historyRef.current
      history.push(impact)
      if (history.length > 16) {
        history.shift()
      }
      onImpact?.(impact)
    },
    [onImpact],
  )

  const addDent = useCallback((hit: SurfaceHit) => {
    const impacts = impactsRef.current
    if (impacts.length >= MAX_ACTIVE_IMPACTS) {
      const weakest = findWeakestInactiveImpact(
        impacts,
        activeDentsRef.current,
      )
      if (weakest >= 0) {
        impacts.splice(weakest, 1)
      }
    }

    const dent: DentImpact = {
      id: hit.id,
      localPoint: hit.localPoint,
      localNormal: hit.localNormal,
      amount: 0,
      velocity: 0,
    }
    impacts.push(dent)
    activeDentsRef.current.add(dent)
    bodyNeedsRestoreRef.current = true
    geometryDirtyRef.current = true
    return dent
  }, [])

  const hitFromEvent = useCallback(
    (
      event: ThreeEvent<PointerEvent>,
      layer: SurfaceLayer,
    ): SurfaceHit | null => {
      if (
        !event.face ||
        event.faceIndex == null ||
        !(event.object instanceof THREE.Mesh)
      ) {
        return null
      }

      let fragmentId: number | null = null
      if (layer === 'wax') {
        const metadata = getWaxTriangleMetadata(
          waxTopology,
          event.faceIndex,
        )
        if (!metadata) {
          return null
        }
        fragmentId = metadata.fragmentId
      }

      impactSequence += 1
      return createSurfaceHit({
        id: `${instanceId}-press-${Math.round(performance.now())}-${impactSequence}`,
        timestampMs: performance.now(),
        pointerType: normalizePointerType(
          event.nativeEvent.pointerType,
        ),
        pointerId: event.nativeEvent.pointerId,
        pressure: event.nativeEvent.pressure,
        layer,
        fragmentId,
        faceIndex: event.faceIndex,
        object: event.object,
        worldPoint: event.point,
        face: event.face,
      })
    },
    [instanceId, waxTopology],
  )

  const releaseActivePress = useCallback(
    (
      pointerId: number,
      endX: number,
      endY: number,
      allowTapPulse: boolean,
    ) => {
      const active = activePressesRef.current.get(pointerId)
      if (!active) {
        return
      }

      activePressesRef.current.delete(pointerId)
      activeDentsRef.current.delete(active.dent)
      const durationSeconds =
        (performance.now() - active.startedAt) / 1000
      const qualified =
        active.pointerType !== 'touch' ||
        (allowTapPulse &&
          isQualifiedTap({
            startX: active.startX,
            startY: active.startY,
            endX,
            endY,
            durationMs: durationSeconds * 1000,
          }))

      if (qualified) {
        const appliedDamageSeconds =
          active.pointerType === 'touch'
            ? Math.max(
                0,
                durationSeconds - TOUCH_DAMAGE_DELAY_SECONDS,
              )
            : durationSeconds
        const remaining = Math.max(
          0,
          MINIMUM_TAP_PULSE_SECONDS - appliedDamageSeconds,
        )
        if (remaining > 0) {
          active.damageInput.pressure = 1
          active.damageInput.durationSeconds = durationSeconds
          tapPulsesRef.current.push({
            input: active.damageInput,
            remainingSeconds: remaining,
          })
        }
        if (active.pointerType === 'touch') {
          rememberImpact(active.hit)
        }
      }

      geometryDirtyRef.current = true
      bodyNeedsRestoreRef.current = true
    },
    [rememberImpact],
  )

  useEffect(() => {
    const eventSurface =
      canvasElement.closest('.squishy-canvas-stage') ?? canvasElement
    return bindPointerCancellation(eventSurface, (event) => {
      releaseActivePress(
        event.pointerId,
        event.clientX,
        event.clientY,
        false,
      )
    })
  }, [canvasElement, releaseActivePress])

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>, layer: SurfaceLayer) => {
      const hit = hitFromEvent(event, layer)
      if (!hit) {
        return
      }

      const fractureState = fractureStateRef.current
      if (
        hit.fragmentId !== null &&
        fractureState.fragmentState[hit.fragmentId] >=
          FRAGMENT_STATE.DETACHED
      ) {
        return
      }

      if (
        hit.pointerType === 'touch' &&
        activePressesRef.current.size >= 2
      ) {
        return
      }

      if (event.nativeEvent.cancelable) {
        event.nativeEvent.preventDefault()
      }
      unlockCrackAudio()
      event.stopPropagation()
      const captureTarget = event.target as EventTarget & {
        setPointerCapture?: (pointerId: number) => void
      }
      try {
        captureTarget.setPointerCapture?.(event.nativeEvent.pointerId)
      } catch {
        // Pointer capture may be unavailable for synthetic browser events.
      }

      const dent = addDent(hit)
      const damageInput: MutableFracturePress = {
        localPoint: hit.localPoint,
        localNormal: hit.localNormal,
        pressure: 0,
        durationSeconds: 0,
      }
      if (hit.fragmentId !== null) {
        damageInput.fragmentIndex = hit.fragmentId
      }
      activePressesRef.current.set(event.nativeEvent.pointerId, {
        pointerId: event.nativeEvent.pointerId,
        pointerType: hit.pointerType,
        startX: event.nativeEvent.clientX,
        startY: event.nativeEvent.clientY,
        startedAt: performance.now(),
        hit,
        dent,
        damageInput,
      })

      if (hit.pointerType !== 'touch') {
        rememberImpact(hit)
      }
      lastInteractionRef.current = performance.now()
    },
    [addDent, hitFromEvent, rememberImpact, unlockCrackAudio],
  )

  const handleWaxPointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const canHover =
        event.nativeEvent.pointerType === 'mouse' &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches
      canvasElement.classList.toggle('wax-pointer-hover', canHover)
    },
    [canvasElement],
  )

  const handleWaxPointerOut = useCallback(() => {
    canvasElement.classList.remove('wax-pointer-hover')
  }, [canvasElement])

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const active = activePressesRef.current.get(
        event.nativeEvent.pointerId,
      )
      if (active && active.pointerType === 'touch') {
        const movement = Math.hypot(
          event.nativeEvent.clientX - active.startX,
          event.nativeEvent.clientY - active.startY,
        )
        if (movement > 10) {
          releaseActivePress(
            event.nativeEvent.pointerId,
            event.nativeEvent.clientX,
            event.nativeEvent.clientY,
            false,
          )
        }
      }
    },
    [releaseActivePress],
  )

  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      releaseActivePress(
        event.nativeEvent.pointerId,
        event.nativeEvent.clientX,
        event.nativeEvent.clientY,
        true,
      )

      const captureTarget = event.target as EventTarget & {
        hasPointerCapture?: (pointerId: number) => boolean
        releasePointerCapture?: (pointerId: number) => void
      }
      if (captureTarget.hasPointerCapture?.(event.nativeEvent.pointerId)) {
        try {
          captureTarget.releasePointerCapture?.(
            event.nativeEvent.pointerId,
          )
        } catch {
          // The browser may already have released a canceled pointer.
        }
      }
    },
    [releaseActivePress],
  )

  const handlePointerCancel = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      releaseActivePress(
        event.nativeEvent.pointerId,
        event.nativeEvent.clientX,
        event.nativeEvent.clientY,
        false,
      )
    },
    [releaseActivePress],
  )

  const createDebrisCluster = useCallback(
    (fragmentIndices: readonly number[]): DebrisCluster | null => {
      const parent = compressionRef.current
      if (!parent || fragmentIndices.length === 0) {
        return null
      }

      // Bake the last rendered dent/peel pose into the fragment's rigid rest
      // shape before Rapier mounts. This makes the first physics transform
      // continuous instead of snapping a freshly detached plate back to the
      // pristine shell.
      const currentPositions = waxRuntime.geometry.getAttribute(
        'position',
      ).array as Float32Array
      const currentNormals = waxRuntime.geometry.getAttribute(
        'normal',
      ).array as Float32Array
      for (const fragmentIndex of fragmentIndices) {
        const fragment = waxTopology.fragments[fragmentIndex]
        const pivotOffset = fragmentIndex * 3
        let pivotX = 0
        let pivotY = 0
        let pivotZ = 0
        for (
          let cursor = 0;
          cursor < fragment.vertexRange.count;
          cursor += 1
        ) {
          const vertex =
            fragment.vertexRange.start + cursor
          const offset = vertex * 3
          const x = currentPositions[offset]
          const y = currentPositions[offset + 1]
          const z = currentPositions[offset + 2]
          waxRuntime.restPositions[offset] = x
          waxRuntime.restPositions[offset + 1] = y
          waxRuntime.restPositions[offset + 2] = z
          waxRuntime.restNormals[offset] = currentNormals[offset]
          waxRuntime.restNormals[offset + 1] =
            currentNormals[offset + 1]
          waxRuntime.restNormals[offset + 2] =
            currentNormals[offset + 2]
          pivotX += x
          pivotY += y
          pivotZ += z
        }
        const inverseVertexCount = 1 / fragment.vertexRange.count
        waxRuntime.pivots[pivotOffset] = pivotX * inverseVertexCount
        waxRuntime.pivots[pivotOffset + 1] =
          pivotY * inverseVertexCount
        waxRuntime.pivots[pivotOffset + 2] =
          pivotZ * inverseVertexCount
      }

      parent.updateWorldMatrix(true, false)
      const orderedFragmentIndices = [...fragmentIndices].sort(
        (left, right) => left - right,
      )
      let centroidX = 0
      let centroidY = 0
      let centroidZ = 0
      let normalX = 0
      let normalY = 0
      let normalZ = 0
      let totalArea = 0
      let clusterSeed = 0

      for (
        let index = 0;
        index < orderedFragmentIndices.length;
        index += 1
      ) {
        const fragmentIndex = orderedFragmentIndices[index]
        const fragment = waxTopology.fragments[fragmentIndex]
        const pivotOffset = fragmentIndex * 3
        const area = fragment.surfaceArea
        centroidX += waxRuntime.pivots[pivotOffset] * area
        centroidY += waxRuntime.pivots[pivotOffset + 1] * area
        centroidZ += waxRuntime.pivots[pivotOffset + 2] * area
        normalX += fragment.averageNormal[0] * area
        normalY += fragment.averageNormal[1] * area
        normalZ += fragment.averageNormal[2] * area
        totalArea += area
        clusterSeed =
          (clusterSeed * 131 + fragmentIndex + index + 1) >>> 0
      }
      centroidX /= totalArea
      centroidY /= totalArea
      centroidZ /= totalArea

      const parentQuaternion = parent.getWorldQuaternion(
        parentWorldQuaternionRef.current,
      )
      const inverseParentQuaternion = parentQuaternion.clone().invert()
      const euler = new THREE.Euler().setFromQuaternion(
        parentQuaternion,
      )
      const worldCentroid = new THREE.Vector3(
        centroidX,
        centroidY,
        centroidZ,
      )
        .applyMatrix4(parent.matrixWorld)
      const normal = new THREE.Vector3(normalX, normalY, normalZ)
        .normalize()
        .applyQuaternion(parentQuaternion)
        .normalize()
      const localOffsets = new Float32Array(
        orderedFragmentIndices.length * 3,
      )
      const colliders: Array<DebrisCluster['colliders'][number]> = []
      const localPivot = new THREE.Vector3()
      const worldPivot = new THREE.Vector3()
      const worldVertex = new THREE.Vector3()

      for (
        let index = 0;
        index < orderedFragmentIndices.length;
        index += 1
      ) {
        const fragmentIndex = orderedFragmentIndices[index]
        const fragment = waxTopology.fragments[fragmentIndex]
        const pivotOffset = fragmentIndex * 3
        localPivot.fromArray(waxRuntime.pivots, pivotOffset)
        worldPivot
          .copy(localPivot)
          .applyMatrix4(parent.matrixWorld)

        const bindingOffset = index * 3
        localPivot
          .copy(worldPivot)
          .sub(worldCentroid)
          .applyQuaternion(inverseParentQuaternion)
        localOffsets[bindingOffset] = localPivot.x
        localOffsets[bindingOffset + 1] = localPivot.y
        localOffsets[bindingOffset + 2] = localPivot.z

        const vertexRange = fragment.vertexRange
        const fullColliderVertices = new Float32Array(
          vertexRange.count * 3,
        )
        for (let cursor = 0; cursor < vertexRange.count; cursor += 1) {
          const sourceOffset = (vertexRange.start + cursor) * 3
          const outputOffset = cursor * 3
          worldVertex
            .fromArray(waxRuntime.restPositions, sourceOffset)
            .applyMatrix4(parent.matrixWorld)
            .sub(worldPivot)
            .applyQuaternion(inverseParentQuaternion)
          fullColliderVertices[outputOffset] = worldVertex.x
          fullColliderVertices[outputOffset + 1] = worldVertex.y
          fullColliderVertices[outputOffset + 2] = worldVertex.z
        }
        colliders.push({
          vertices: selectColliderSupportPoints(fullColliderVertices),
          position: [
            localOffsets[bindingOffset],
            localOffsets[bindingOffset + 1],
            localOffsets[bindingOffset + 2],
          ],
          density: 0.42,
        })
      }

      const clusterId = `${instanceId}-wax-${orderedFragmentIndices.join('-')}`
      clusterBindingsRef.current.set(clusterId, {
        fragmentIndices: orderedFragmentIndices,
        localOffsets,
      })
      for (const fragmentIndex of orderedFragmentIndices) {
        const positionOffset = fragmentIndex * 3
        const quaternionOffset = fragmentIndex * 4
        fragmentPosesRef.current.valid[fragmentIndex] = 1
        fragmentPosesRef.current.positions[positionOffset] =
          waxRuntime.pivots[positionOffset]
        fragmentPosesRef.current.positions[positionOffset + 1] =
          waxRuntime.pivots[positionOffset + 1]
        fragmentPosesRef.current.positions[positionOffset + 2] =
          waxRuntime.pivots[positionOffset + 2]
        fragmentPosesRef.current.quaternions[quaternionOffset] = 0
        fragmentPosesRef.current.quaternions[quaternionOffset + 1] = 0
        fragmentPosesRef.current.quaternions[quaternionOffset + 2] = 0
        fragmentPosesRef.current.quaternions[quaternionOffset + 3] = 1
      }
      return {
        id: clusterId,
        colliders,
        position: [
          worldCentroid.x,
          worldCentroid.y,
          worldCentroid.z,
        ],
        rotation: [euler.x, euler.y, euler.z],
        linearVelocity: [
          normal.x * 0.14,
          normal.y * 0.1 - 0.06,
          normal.z * 0.14,
        ],
        angularVelocity: [
          Math.sin(clusterSeed * 1.71) * 0.55,
          Math.cos(clusterSeed * 2.13) * 0.48,
          Math.sin(clusterSeed * 0.83) * 0.52,
        ],
        ccd: false,
      }
    },
    [instanceId, waxRuntime, waxTopology.fragments],
  )

  const handleDebrisTransform = useCallback(
    (clusterId: string, transform: DebrisTransform) => {
      const parent = compressionRef.current
      const binding = clusterBindingsRef.current.get(clusterId)
      if (!parent || !binding) {
        return
      }
      for (const fragmentIndex of binding.fragmentIndices) {
        detachFragmentForFade(
          fragmentFadeStateRef.current,
          fragmentIndex,
        )
      }

      parent.updateWorldMatrix(true, false)
      inverseWorldMatrixRef.current.copy(parent.matrixWorld).invert()
      parent.getWorldQuaternion(parentWorldQuaternionRef.current)
      worldPositionRef.current.set(
        transform.position[0],
        transform.position[1],
        transform.position[2],
      )
      worldQuaternionRef.current.set(
        transform.quaternion[0],
        transform.quaternion[1],
        transform.quaternion[2],
        transform.quaternion[3],
      )
      localQuaternionRef.current
        .copy(parentWorldQuaternionRef.current)
        .invert()
        .multiply(worldQuaternionRef.current)

      for (
        let index = 0;
        index < binding.fragmentIndices.length;
        index += 1
      ) {
        const fragmentIndex = binding.fragmentIndices[index]
        const bindingOffset = index * 3
        const positionOffset = fragmentIndex * 3
        const quaternionOffset = fragmentIndex * 4
        localPositionRef.current
          .fromArray(binding.localOffsets, bindingOffset)
          .applyQuaternion(worldQuaternionRef.current)
          .add(worldPositionRef.current)
          .applyMatrix4(inverseWorldMatrixRef.current)
        fragmentPosesRef.current.valid[fragmentIndex] = 1
        fragmentPosesRef.current.positions[positionOffset] =
          localPositionRef.current.x
        fragmentPosesRef.current.positions[positionOffset + 1] =
          localPositionRef.current.y
        fragmentPosesRef.current.positions[positionOffset + 2] =
          localPositionRef.current.z
        fragmentPosesRef.current.quaternions[quaternionOffset] =
          localQuaternionRef.current.x
        fragmentPosesRef.current.quaternions[quaternionOffset + 1] =
          localQuaternionRef.current.y
        fragmentPosesRef.current.quaternions[quaternionOffset + 2] =
          localQuaternionRef.current.z
        fragmentPosesRef.current.quaternions[quaternionOffset + 3] =
          localQuaternionRef.current.w
      }
      geometryDirtyRef.current = true
    },
    [],
  )

  const handleDebrisSettled = useCallback(
    (clusterId: string, transform: DebrisTransform) => {
      handleDebrisTransform(clusterId, transform)
      const binding = clusterBindingsRef.current.get(clusterId)
      if (binding) {
        for (const fragmentIndex of binding.fragmentIndices) {
          markFragmentSleepingForFade(
            fragmentFadeStateRef.current,
            fragmentIndex,
          )
        }
        markFragmentsSettled(
          fractureModel,
          fractureStateRef.current,
          binding.fragmentIndices,
        )
      }
      setPhysicsDebrisClusters((current) =>
        current.filter((cluster) => cluster.id !== clusterId),
      )
    },
    [fractureModel, handleDebrisTransform],
  )

  useEffect(() => {
    onPhysicsDebrisChange(instanceId, {
      clusters: physicsDebrisClusters,
      onTransform: handleDebrisTransform,
      onSettled: handleDebrisSettled,
    })
  }, [
    handleDebrisSettled,
    handleDebrisTransform,
    instanceId,
    onPhysicsDebrisChange,
    physicsDebrisClusters,
  ])

  useEffect(
    () => () => {
      onPhysicsDebrisChange(instanceId, null)
    },
    [instanceId, onPhysicsDebrisChange],
  )

  useFrame((_, delta) => {
    const now = performance.now()
    const impacts = impactsRef.current
    const activeDents = activeDentsRef.current
    const activePresses = activePressesRef.current
    const pressInputs = pressInputsRef.current
    const tapPulses = tapPulsesRef.current
    const fractureState = fractureStateRef.current
    pressInputs.length = 0

    if (reducedMotion) {
      introRef.current.value = 1
      introRef.current.velocity = 0
    } else {
      stepSpring(introRef.current, 1, delta, INTRO_SPRING)
    }

    for (const active of activePresses.values()) {
      const springScratch = springScratchRef.current
      springScratch.value = active.dent.amount
      springScratch.velocity = active.dent.velocity
      stepSpring(
        springScratch,
        1,
        delta,
        reducedMotion ? REDUCED_PRESS_SPRING : PRESS_SPRING,
      )
      active.dent.amount = Math.min(1, springScratch.value)
      active.dent.velocity = springScratch.velocity
      const durationSeconds = (now - active.startedAt) / 1000
      active.damageInput.durationSeconds = durationSeconds
      active.damageInput.pressure =
        Math.min(1, Math.max(0.3, active.dent.amount)) *
        (active.hit.pressure > 0
          ? THREE.MathUtils.clamp(active.hit.pressure * 1.45, 0.7, 1)
          : 1)
      if (
        active.pointerType !== 'touch' ||
        durationSeconds >= TOUCH_DAMAGE_DELAY_SECONDS
      ) {
        pressInputs.push(active.damageInput)
      }
      geometryDirtyRef.current = true
      bodyNeedsRestoreRef.current = true
    }

    for (let index = tapPulses.length - 1; index >= 0; index -= 1) {
      const pulse = tapPulses[index]
      pulse.input.durationSeconds += delta
      pulse.input.pressure = 1
      pressInputs.push(pulse.input)
      pulse.remainingSeconds -= delta
      if (pulse.remainingSeconds <= 0) {
        tapPulses.splice(index, 1)
      }
    }

    for (const impact of impacts) {
      if (activeDents.has(impact)) {
        continue
      }
      const springScratch = springScratchRef.current
      springScratch.value = impact.amount
      springScratch.velocity = impact.velocity
      stepSpring(
        springScratch,
        0,
        delta,
        reducedMotion ? REDUCED_PRESS_SPRING : PRESS_SPRING,
      )
      impact.amount = springScratch.value
      impact.velocity = springScratch.velocity
    }

    for (let index = impacts.length - 1; index >= 0; index -= 1) {
      const impact = impacts[index]
      if (
        !activeDents.has(impact) &&
        Math.abs(impact.amount) < 0.001 &&
        Math.abs(impact.velocity) < 0.001
      ) {
        impacts.splice(index, 1)
      }
    }

    let pressStrength = 0
    for (const pressInput of pressInputs) {
      pressStrength = Math.max(pressStrength, pressInput.pressure)
    }

    stepFracture(
      fractureModel,
      fractureState,
      pressInputs,
      delta,
    )
    let newlyBrokenBondCount = 0
    if (fractureState.events.length > 0) {
      geometryDirtyRef.current = true
      const newClusters: DebrisCluster[] = []
      const detachedFragments: number[] = []
      for (const event of fractureState.events) {
        if (event.type === 'bond-break') {
          newlyBrokenBondCount += 1
        } else if (event.type === 'fragment-detach') {
          detachedFragments.push(event.fragmentIndex)
          if (reducedMotion) {
            detachFragmentForFade(
              fragmentFadeStateRef.current,
              event.fragmentIndex,
            )
          }
        } else if (
          event.type === 'complete' &&
          !completionSentRef.current
        ) {
          completionSentRef.current = true
          onComplete()
        }
      }
      if (newlyBrokenBondCount > 0) {
        playCrackSound(newlyBrokenBondCount)
      }
      const connectedGroups = groupConnectedFragments(
        detachedFragments,
        waxTopology.fragments,
        MAX_DEBRIS_CLUSTER_SIZE,
        coatingSeed,
      )
      for (const group of connectedGroups) {
        const cluster = createDebrisCluster(group)
        if (cluster) {
          newClusters.push(cluster)
        }
      }
      if (newClusters.length > 0) {
        setDebrisClusters((current) => [...current, ...newClusters])
        setPhysicsDebrisClusters((current) => [
          ...current,
          ...newClusters,
        ])
      }
    }

    if (visualSignals) {
      writeSquishyVisualSignals(
        visualSignals,
        pressStrength,
        fractureState.brokenBondCount,
        fractureModel.bondCount,
        newlyBrokenBondCount,
      )
    }

    const peelAmounts = peelAmountsRef.current
    const peelEase = 1 - Math.exp(-delta * (reducedMotion ? 18 : 8))
    for (
      let fragment = 0;
      fragment < peelAmounts.length;
      fragment += 1
    ) {
      const fragmentState = fractureState.fragmentState[fragment]
      const degree =
        fractureModel.incidentStarts[fragment + 1] -
        fractureModel.incidentStarts[fragment]
      const brokenRatio =
        degree > 0
          ? fractureState.fragmentBrokenBonds[fragment] / degree
          : 0
      const target =
        fragmentState >= FRAGMENT_STATE.PEELING
          ? 1
          : fragmentState === FRAGMENT_STATE.CRACKED
            ? brokenRatio * 0.24
            : 0
      const next = THREE.MathUtils.lerp(
        peelAmounts[fragment],
        target,
        peelEase,
      )
      if (Math.abs(next - peelAmounts[fragment]) > 0.0001) {
        peelAmounts[fragment] = next
        geometryDirtyRef.current = true
      }
    }

    const fadeState = fragmentFadeStateRef.current
    stepFragmentFade(fadeState, delta, reducedMotion)
    if (fadeState.fadeStartedCount > 0) {
      setPhysicsDebrisClusters((current) =>
        current.filter((cluster) => {
          const binding = clusterBindingsRef.current.get(cluster.id)
          return (
            binding?.fragmentIndices.some((fragmentIndex) =>
              shouldSimulateFragment(fadeState, fragmentIndex),
            ) ?? false
          )
        }),
      )
    }
    let retiredClusterCount = 0
    for (
      let fragmentIndex = 0;
      fragmentIndex < waxTopology.plateCount;
      fragmentIndex += 1
    ) {
      const alpha = fadeState.alpha[fragmentIndex]
      if (
        Math.abs(
          alpha - lastFragmentAlphaRef.current[fragmentIndex],
        ) > 0.001
      ) {
        const fragment = waxTopology.fragments[fragmentIndex]
        writeFragmentFadeColorAlpha(
          waxColorAttribute,
          fragment.vertexRange.start,
          fragment.vertexRange.count,
          alpha,
        )
        lastFragmentAlphaRef.current[fragmentIndex] = alpha
      }
    }
    for (
      let retiredIndex = 0;
      retiredIndex < fadeState.retiredCount;
      retiredIndex += 1
    ) {
      const fragmentIndex = fadeState.retiredIndices[retiredIndex]
      const positionOffset = fragmentIndex * 3
      fragmentPosesRef.current.positions[positionOffset + 1] = -100
      geometryDirtyRef.current = true
    }
    for (const binding of clusterBindingsRef.current.values()) {
      let clusterRetired = true
      for (const fragmentIndex of binding.fragmentIndices) {
        if (!isFragmentRetired(fadeState, fragmentIndex)) {
          clusterRetired = false
          break
        }
      }
      if (clusterRetired) {
        retiredClusterCount += 1
      }
    }
    if (retiredClusterCount > 0) {
      setPhysicsDebrisClusters((current) =>
        current.filter((cluster) => {
          const binding = clusterBindingsRef.current.get(cluster.id)
          return (
            binding?.fragmentIndices.some(
              (fragmentIndex) =>
                !isFragmentRetired(fadeState, fragmentIndex),
            ) ?? false
          )
        }),
      )
      setDebrisClusters((current) =>
        current.filter((cluster) => {
          const binding = clusterBindingsRef.current.get(cluster.id)
          if (!binding) {
            return false
          }
          const retired = binding.fragmentIndices.every(
            (fragmentIndex) =>
              isFragmentRetired(fadeState, fragmentIndex),
          )
          if (retired) {
            clusterBindingsRef.current.delete(cluster.id)
          }
          return !retired
        }),
      )
    }

    if (impacts.length > 0) {
      writeDeformedPositions(innerGeometry, innerSource, impacts, 0)
      writeDeformedPositions(labelGeometry, labelSource, impacts, 0)
      bodyNeedsRestoreRef.current = true
    } else if (bodyNeedsRestoreRef.current) {
      writeDeformedPositions(innerGeometry, innerSource, [], 0)
      writeDeformedPositions(labelGeometry, labelSource, [], 0)
      bodyNeedsRestoreRef.current = false
      geometryDirtyRef.current = true
    }

    if (geometryDirtyRef.current) {
      writeWaxGeometry({
        runtime: waxRuntime,
        topology: waxTopology,
        fractureModel,
        fractureState,
        impacts,
        peelAmounts,
        fragmentPoses: fragmentPosesRef.current,
      })
      geometryDirtyRef.current = false
    }

    const newestImpact = impacts[impacts.length - 1]
    const compression = newestImpact
      ? Math.max(0, newestImpact.amount)
      : 0
    if (compressionRef.current) {
      if (debrisClusters.length > 0) {
        // Detached geometry shares this render group with the butter. Keep
        // its parent transform stable once rigid bodies exist so sleeping
        // tabletop pieces cannot drift away from their fixed colliders.
        compressionRef.current.scale.setScalar(1)
      } else {
        const normal = newestImpact?.localNormal ?? DEFAULT_NORMAL
        compressionRef.current.scale.set(
          1 -
            0.025 * Math.abs(normal[0]) * compression +
            0.006 * (1 - Math.abs(normal[0])) * compression,
          1 -
            0.025 * Math.abs(normal[1]) * compression +
            0.006 * (1 - Math.abs(normal[1])) * compression,
          1 -
            0.025 * Math.abs(normal[2]) * compression +
            0.006 * (1 - Math.abs(normal[2])) * compression,
        )
      }
    }

    let idlePulse = 0
    if (
      !reducedMotion &&
      debrisClusters.length === 0 &&
      now - lastInteractionRef.current > 6000
    ) {
      const pulseTime =
        ((now - lastInteractionRef.current - 6000) / 1000) % 5
      if (pulseTime < 1.4) {
        idlePulse =
          Math.sin((pulseTime / 1.4) * Math.PI) ** 2 * 0.025
      }
    }

    if (presentationRef.current) {
      const scale = introRef.current.value * (1 + idlePulse)
      presentationRef.current.scale.setScalar(scale)
    }

  })

  const handleWaxPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) =>
      handlePointerDown(event, 'wax'),
    [handlePointerDown],
  )
  const handleButterPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) =>
      handlePointerDown(event, 'butter'),
    [handlePointerDown],
  )
  const handleWaxPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => handlePointerMove(event),
    [handlePointerMove],
  )
  const handleButterPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => handlePointerMove(event),
    [handlePointerMove],
  )

  return (
    <>
      <group
        ref={presentationRef}
        position={position}
        rotation={PRESENTATION_ROTATION}
      >
        <group ref={compressionRef}>
          <mesh
            geometry={innerGeometry}
            castShadow
            receiveShadow
            onPointerDown={handleButterPointerDown}
            onPointerMove={handleButterPointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <meshStandardMaterial
              color={bodyColor}
              metalness={0}
              roughness={0.7}
            />
          </mesh>
          <mesh
            geometry={labelGeometry}
            raycast={NO_RAYCAST}
            renderOrder={1}
          >
            <meshBasicMaterial
              map={labelTexture}
              transparent={false}
              depthTest
              depthWrite
              alphaTest={0.015}
              opacity={1}
              polygonOffset
              polygonOffsetFactor={-7}
              toneMapped={false}
            />
          </mesh>
          <mesh
            geometry={waxRuntime.geometry}
            receiveShadow
            frustumCulled={false}
            onPointerMove={handleWaxPointerMove}
            onPointerDown={handleWaxPointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onPointerOver={handleWaxPointerOver}
            onPointerOut={handleWaxPointerOut}
          >
            <meshPhysicalMaterial
              alphaHash
              attach="material-0"
              {...WAX_OUTER_MATERIAL}
              attenuationColor={waxPalette.attenuation}
              color={waxPalette.outer}
              vertexColors
            />
            <meshStandardMaterial
              alphaHash
              attach="material-1"
              color={waxPalette.inner}
              metalness={0}
              roughness={0.82}
              side={THREE.FrontSide}
              vertexColors
            />
            <meshStandardMaterial
              alphaHash
              attach="material-2"
              color={waxPalette.edge}
              metalness={0}
              polygonOffset
              polygonOffsetFactor={4}
              polygonOffsetUnits={4}
              roughness={0.88}
              side={THREE.FrontSide}
              vertexColors
            />
          </mesh>
          <mesh
            geometry={labelGeometry}
            position={[0, 0, 0.058]}
            raycast={NO_RAYCAST}
            renderOrder={3}
          >
            <meshBasicMaterial
              map={labelTexture}
              transparent
              depthTest
              depthWrite={false}
              alphaTest={0.015}
              opacity={0.3}
              polygonOffset
              polygonOffsetFactor={-5}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>
    </>
  )
})
