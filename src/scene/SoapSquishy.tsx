import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react'
import * as THREE from 'three'
import {
  captureDeformationSource,
  makeImpactPermanent,
  writeDeformedPositions,
  writeDisplacedPositions,
  type DentProfile,
  type SurfaceDisplacementSampler,
} from './deformation'
import {
  createFractureModel,
  createFractureState,
  FRAGMENT_STATE,
  markFragmentsSettled,
  stepFracture,
  type FractureOptions,
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
  type FragmentFadePolicyOptions,
} from './fracture/fragmentFade'
import {
  attachFragmentFadeColorAttribute,
  writeFragmentFadeColorAlpha,
} from './fracture/fragmentFadeGeometry'
import {
  createWaxTopology,
  getWaxTriangleMetadata,
} from './fracture/topology'
import {
  WAX_SEAM_PROFILE,
  type WaxBond,
  type WaxSeamProfile,
} from './fracture/types'
import type {
  DebrisCluster,
  DebrisTransform,
  DebrisVector3,
} from './fracture/RapierDebris'
import type { PhysicsDebrisSource } from './fracture/usePhysicsDebrisSources'
import {
  createWaxGeometryRuntime,
  writeWaxGeometry,
} from './fracture/waxGeometryRuntime'
import {
  bindPointerCancellation,
  createSurfaceHit,
  isQualifiedTap,
} from './interaction'
import {
  SOAP_WAX_PHYSICAL_PROPERTIES,
  SOAP_DEBRIS_FADE_POLICY,
  SOAP_DEBRIS_MAX_CLUSTER_SIZE,
  createSoapDebrisLaunch,
  getSoapShapedPosition,
  getSoapWaxPalette,
  type SoapDefinition,
} from './soaps'
import { INTRO_SPRING, stepSpring } from './spring'
import {
  type SquishyVisualSignals,
  writeSquishyVisualSignals,
} from './synesthesia'
import type {
  DentImpact,
  SurfaceHit,
  SurfaceLayer,
} from './types'

export type FracturableDefinition = Omit<
  SoapDefinition,
  'id' | 'decal'
> & {
  id: string
  decal?: SoapDefinition['decal']
}

export type FracturableSquishyConfig = Readonly<{
  plateCount: number
  innerClearance: number
  outerOffset: number
  seamProfile: WaxSeamProfile
  maximumActiveImpacts: number
  maximumClusterSize: number
  releasedImpactTarget: number
  dynamicBoundsRadius?: number
  preserveReleasedImpacts?: boolean
  minimumPermanentImpact?: number
  fadePolicy: FragmentFadePolicyOptions
  fractureOptions: FractureOptions
  waxPalette: Readonly<{
    surfaceColor: string
    attenuationColor: string
  }>
  waxMaterial: Readonly<THREE.MeshPhysicalMaterialParameters>
  createShellGeometry?: () => THREE.BufferGeometry
  displacementSampler?: SurfaceDisplacementSampler
  bondToughnessScale?: (bond: WaxBond) => number
  createDebrisLaunch?: (
    seed: number,
    normal: DebrisVector3,
  ) => Readonly<{
    linearVelocity: DebrisVector3
    angularVelocity: DebrisVector3
    gravityScale: number
  }>
}>

type SoapSquishyProps = Readonly<{
  definition: FracturableDefinition
  coatingSeed: number
  labelTexture?: THREE.Texture | null
  position: readonly [number, number, number]
  scale?: readonly [number, number, number]
  reducedMotion: boolean
  onComplete: (id: string) => void
  onPhysicsDebrisChange: (
    id: string,
    source: SoapPhysicsDebrisSource | null,
  ) => void
  playCrackSound: (brokenBondCount: number) => void
  unlockCrackAudio: () => void
  introDelay?: number
  runtimeConfig?: FracturableSquishyConfig
  visualSignals?: SquishyVisualSignals
}>

export type SoapPhysicsDebrisSource = PhysicsDebrisSource

type MutableFracturePress = {
  fragmentIndex?: number
  localPoint: SurfaceHit['localPoint']
  localNormal: SurfaceHit['localNormal']
  pressure: number
  durationSeconds: number
}

type ActivePress = {
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
  localOffsets: Float32Array
}>

const SOAP_PLATE_COUNT = 16
const SOAP_INNER_CLEARANCE = 0.008
export const SOAP_OUTER_OFFSET = 0.045
const MAX_ACTIVE_SOAP_IMPACTS = 3
const MINIMUM_TAP_PULSE_SECONDS = 0.16
const TOUCH_DAMAGE_DELAY_SECONDS = 0.075
const NO_RAYCAST = () => null
const DEFAULT_NORMAL = [0, 0, 1] as const

let soapImpactSequence = 0

function normalizePointerType(value: string): SurfaceHit['pointerType'] {
  if (value === 'touch' || value === 'pen') {
    return value
  }
  return 'mouse'
}

function hashUint32(value: number) {
  let hash = value >>> 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

function createAccentGeometry(definition: FracturableDefinition) {
  if (
    definition.id !== 'sprinkles' &&
    definition.id !== 'sugar'
  ) {
    return null
  }

  const count = definition.id === 'sprinkles' ? 44 : 72
  const [width, height, depth] = definition.geometry.size
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const color = new THREE.Color()

  for (let index = 0; index < count; index += 1) {
    const seed = hashUint32(
      definition.seedSalt ^ Math.imul(index + 1, 0x9e3779b1),
    )
    const xRoll = hashUint32(seed ^ 0xa341316c) / 0xffffffff
    const yRoll = hashUint32(seed ^ 0xc8013ea4) / 0xffffffff
    const shaped = getSoapShapedPosition(
      (xRoll - 0.5) * width * 0.78,
      (yRoll - 0.5) * height * 0.62,
      depth * 0.5,
      definition.geometry.size,
    )
    positions[index * 3] = shaped[0]
    positions[index * 3 + 1] = shaped[1]
    positions[index * 3 + 2] = shaped[2] + 0.012
    normals[index * 3 + 2] = 1
    const paletteIndex =
      seed % definition.style.accentPalette.length
    color.set(definition.style.accentPalette[paletteIndex])
    colors[index * 3] = color.r
    colors[index * 3 + 1] = color.g
    colors[index * 3 + 2] = color.b
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3),
  )
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colors, 3),
  )
  geometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(normals, 3),
  )
  return geometry
}

export const SoapSquishy = memo(function SoapSquishy({
  definition,
  coatingSeed,
  labelTexture,
  position,
  scale = [1, 1, 1],
  reducedMotion,
  onComplete,
  onPhysicsDebrisChange,
  playCrackSound,
  unlockCrackAudio,
  introDelay = 0,
  runtimeConfig,
  visualSignals,
}: SoapSquishyProps) {
  const presentationRef = useRef<THREE.Group>(null)
  const compressionRef = useRef<THREE.Group>(null)
  const innerGeometry = useMemo(
    () => definition.geometry.createSourceGeometry(),
    [definition],
  )
  const shellSourceGeometry = useMemo(
    () => runtimeConfig?.createShellGeometry?.() ?? innerGeometry,
    [innerGeometry, runtimeConfig],
  )
  const labelGeometry = useMemo(
    () => definition.decal?.createGeometry() ?? null,
    [definition],
  )
  const accentGeometry = useMemo(
    () => createAccentGeometry(definition),
    [definition],
  )
  const waxPalette = useMemo(
    () =>
      runtimeConfig?.waxPalette ??
      getSoapWaxPalette(definition.style.bodyColor),
    [definition.style.bodyColor, runtimeConfig],
  )
  const innerSource = useMemo(
    () => captureDeformationSource(innerGeometry),
    [innerGeometry],
  )
  const labelSource = useMemo(
    () =>
      labelGeometry
        ? captureDeformationSource(labelGeometry)
        : null,
    [labelGeometry],
  )
  const accentSource = useMemo(
    () =>
      accentGeometry
        ? captureDeformationSource(accentGeometry)
        : null,
    [accentGeometry],
  )
  const dentProfile = useMemo<DentProfile>(
    () => ({
      radius: definition.deformation.dentRadius,
      depth: definition.deformation.dentDepth,
      maximumDepth: definition.deformation.maximumDentDepth,
      minimumDepth: -0.006,
    }),
    [definition],
  )
  const waxTopology = useMemo(
    () =>
      createWaxTopology({
        sourceGeometry: shellSourceGeometry,
        seed: coatingSeed,
        plateCount: runtimeConfig?.plateCount ?? SOAP_PLATE_COUNT,
        innerClearance:
          runtimeConfig?.innerClearance ?? SOAP_INNER_CLEARANCE,
        outerOffset:
          runtimeConfig?.outerOffset ?? SOAP_OUTER_OFFSET,
        seamProfile:
          runtimeConfig?.seamProfile ?? WAX_SEAM_PROFILE.long,
      }),
    [coatingSeed, runtimeConfig, shellSourceGeometry],
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
            toughness:
              bond.toughness *
              (runtimeConfig?.bondToughnessScale?.(bond) ?? 1),
            role: bond.fractureRole,
          })),
        },
        runtimeConfig?.fractureOptions ?? {
            propagationRadius:
              definition.deformation.dentRadius * 1.55,
            damagePerSecond: 4.8,
            holdRampSeconds: 0.22,
            holdStrength: 0.84,
            crackContinuation: 0.34,
            globalCompressionFatigue: 0.012,
            tipStressTransfer: 0.58,
            tipStressDecay: 0.82,
            maxTipBranches: 2,
            peelBrokenRatio: 0.62,
            detachBrokenRatio: 0.88,
            minimumPeelSeconds: 0.16,
            settleCandidateSeconds: 0.16,
          },
      ),
    [definition.deformation.dentRadius, runtimeConfig, waxTopology],
  )
  const fractureStateRef = useRef(createFractureState(fractureModel))
  const fadeStateRef = useRef(
    createFragmentFadeState(
      waxTopology.plateCount,
      runtimeConfig?.fadePolicy ?? SOAP_DEBRIS_FADE_POLICY,
    ),
  )
  const impactsRef = useRef<DentImpact[]>([])
  const activeDentsRef = useRef(new Set<DentImpact>())
  const activePressesRef = useRef(new Map<number, ActivePress>())
  const tapPulsesRef = useRef<TapPulse[]>([])
  const pressInputsRef = useRef<FracturePress[]>([])
  const peelAmountsRef = useRef(
    new Float32Array(waxTopology.plateCount),
  )
  const fragmentPosesRef = useRef(waxRuntime.poseScratch)
  const clusterBindingsRef = useRef(
    new Map<string, DebrisClusterBinding>(),
  )
  const inverseWorldMatrixRef = useRef(new THREE.Matrix4())
  const parentWorldQuaternionRef = useRef(new THREE.Quaternion())
  const worldQuaternionRef = useRef(new THREE.Quaternion())
  const localQuaternionRef = useRef(new THREE.Quaternion())
  const worldPositionRef = useRef(new THREE.Vector3())
  const localPositionRef = useRef(new THREE.Vector3())
  const [physicsDebrisClusters, setPhysicsDebrisClusters] =
    useState<DebrisCluster[]>([])
  const lastAlphaRef = useRef(
    new Float32Array(waxTopology.plateCount).fill(1),
  )
  const geometryDirtyRef = useRef(true)
  const bodyNeedsRestoreRef = useRef(true)
  const completionSentRef = useRef(false)
  const hasDetachedRef = useRef(false)
  const introRef = useRef({
    value: reducedMotion ? 1 : 0.82,
    velocity: 0,
  })
  const springScratchRef = useRef({ value: 0, velocity: 0 })
  const lastInteractionRef = useRef(
    performance.now() + introDelay * 1000,
  )
  const canvasElement = useThree((state) => state.gl.domElement)
  const writeBodyGeometry = useCallback(
    (
      geometry: THREE.BufferGeometry,
      source: ReturnType<typeof captureDeformationSource>,
      impacts: readonly DentImpact[],
    ) => {
      if (runtimeConfig?.displacementSampler) {
        writeDisplacedPositions(
          geometry,
          source,
          impacts,
          runtimeConfig.displacementSampler,
        )
      } else {
        writeDeformedPositions(
          geometry,
          source,
          impacts,
          0,
          dentProfile,
        )
      }
    },
    [dentProfile, runtimeConfig],
  )

  useEffect(() => {
    writeBodyGeometry(innerGeometry, innerSource, [])
    if (labelGeometry && labelSource) {
      writeBodyGeometry(labelGeometry, labelSource, [])
    }
    if (accentGeometry && accentSource) {
      writeBodyGeometry(accentGeometry, accentSource, [])
    }
    writeWaxGeometry({
      runtime: waxRuntime,
      topology: waxTopology,
      fractureModel,
      fractureState: fractureStateRef.current,
      impacts: [],
      peelAmounts: peelAmountsRef.current,
      dentProfile,
      displacementSampler: runtimeConfig?.displacementSampler,
    })
    const dynamicBoundsRadius = runtimeConfig?.dynamicBoundsRadius ?? 8
    const dynamicBounds = new THREE.Box3(
      new THREE.Vector3(
        -dynamicBoundsRadius,
        -dynamicBoundsRadius,
        -dynamicBoundsRadius,
      ),
      new THREE.Vector3(
        dynamicBoundsRadius,
        dynamicBoundsRadius,
        dynamicBoundsRadius,
      ),
    )
    const dynamicBoundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      dynamicBoundsRadius,
    )
    waxRuntime.geometry.boundingBox = dynamicBounds
    waxRuntime.geometry.boundingSphere = dynamicBoundingSphere
    if (runtimeConfig?.dynamicBoundsRadius) {
      innerGeometry.boundingBox = dynamicBounds.clone()
      innerGeometry.boundingSphere = dynamicBoundingSphere.clone()
    }

    return () => {
      innerGeometry.dispose()
      if (shellSourceGeometry !== innerGeometry) {
        shellSourceGeometry.dispose()
      }
      labelGeometry?.dispose()
      accentGeometry?.dispose()
      waxRuntime.geometry.dispose()
      canvasElement.classList.remove('wax-pointer-hover')
    }
  }, [
    accentGeometry,
    accentSource,
    canvasElement,
    dentProfile,
    fractureModel,
    innerGeometry,
    innerSource,
    labelGeometry,
    labelSource,
    runtimeConfig,
    shellSourceGeometry,
    waxRuntime,
    waxTopology,
    writeBodyGeometry,
  ])

  const addDent = useCallback((hit: SurfaceHit) => {
    const impacts = impactsRef.current
    if (
      impacts.length >=
      (runtimeConfig?.maximumActiveImpacts ??
        MAX_ACTIVE_SOAP_IMPACTS)
    ) {
      const removable = impacts.findIndex(
        (impact) => !activeDentsRef.current.has(impact),
      )
      if (removable >= 0) {
        impacts.splice(removable, 1)
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
    geometryDirtyRef.current = true
    bodyNeedsRestoreRef.current = true
    return dent
  }, [runtimeConfig])

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

      soapImpactSequence += 1
      return createSurfaceHit({
        id:
          `${definition.id}-${Math.round(performance.now())}-` +
          soapImpactSequence,
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
    [definition.id, waxTopology],
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
          tapPulsesRef.current.push({
            input: active.damageInput,
            remainingSeconds: remaining,
          })
        }
      }

      const shouldPreserveImpact =
        runtimeConfig?.preserveReleasedImpacts === true &&
        ((allowTapPulse && qualified) ||
          durationSeconds >= TOUCH_DAMAGE_DELAY_SECONDS)
      if (shouldPreserveImpact) {
        makeImpactPermanent(
          active.dent,
          runtimeConfig.minimumPermanentImpact ?? 0,
        )
      }

      geometryDirtyRef.current = true
      bodyNeedsRestoreRef.current = true
    },
    [runtimeConfig],
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
      if (
        hit.fragmentId !== null &&
        fractureStateRef.current.fragmentState[hit.fragmentId] >=
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
      event.stopPropagation()
      unlockCrackAudio()
      const captureTarget = event.target as EventTarget & {
        setPointerCapture?: (pointerId: number) => void
      }
      try {
        captureTarget.setPointerCapture?.(event.nativeEvent.pointerId)
      } catch {
        // Synthetic events and older mobile webviews may not capture.
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
        pointerType: hit.pointerType,
        startX: event.nativeEvent.clientX,
        startY: event.nativeEvent.clientY,
        startedAt: performance.now(),
        hit,
        dent,
        damageInput,
      })
      lastInteractionRef.current = performance.now()
    },
    [addDent, hitFromEvent, unlockCrackAudio],
  )

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const active = activePressesRef.current.get(
        event.nativeEvent.pointerId,
      )
      if (active?.pointerType === 'touch') {
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

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const canHover =
        event.nativeEvent.pointerType === 'mouse' &&
        window.matchMedia(
          '(hover: hover) and (pointer: fine)',
        ).matches
      canvasElement.classList.toggle('wax-pointer-hover', canHover)
    },
    [canvasElement],
  )

  const handlePointerOut = useCallback(() => {
    canvasElement.classList.remove('wax-pointer-hover')
  }, [canvasElement])

  const createDebrisCluster = useCallback(
    (fragmentIndices: readonly number[]): DebrisCluster | null => {
      const parent = compressionRef.current
      if (!parent || fragmentIndices.length === 0) {
        return null
      }

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
          const vertex = fragment.vertexRange.start + cursor
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
      let clusterSeed = coatingSeed

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
      ).applyMatrix4(parent.matrixWorld)
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
        worldPivot.copy(localPivot).applyMatrix4(parent.matrixWorld)

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
          density: 0.34,
        })
      }

      const clusterId = `${definition.id}-soap-wax-${orderedFragmentIndices.join('-')}`
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
      const launch = (
        runtimeConfig?.createDebrisLaunch ??
        createSoapDebrisLaunch
      )(clusterSeed, [normal.x, normal.y, normal.z])
      return {
        id: clusterId,
        colliders,
        position: [
          worldCentroid.x,
          worldCentroid.y,
          worldCentroid.z,
        ],
        rotation: [euler.x, euler.y, euler.z],
        linearVelocity: launch.linearVelocity,
        angularVelocity: launch.angularVelocity,
        gravityScale: launch.gravityScale,
        ccd: false,
      }
    },
    [
      coatingSeed,
      definition.id,
      runtimeConfig,
      waxRuntime,
      waxTopology.fragments,
    ],
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
          fadeStateRef.current,
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
            fadeStateRef.current,
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
    onPhysicsDebrisChange(definition.id, {
      clusters: physicsDebrisClusters,
      onTransform: handleDebrisTransform,
      onSettled: handleDebrisSettled,
    })
  }, [
    definition.id,
    handleDebrisSettled,
    handleDebrisTransform,
    onPhysicsDebrisChange,
    physicsDebrisClusters,
  ])

  useEffect(
    () => () => {
      onPhysicsDebrisChange(definition.id, null)
    },
    [definition.id, onPhysicsDebrisChange],
  )

  useFrame((_, delta) => {
    const now = performance.now()
    const impacts = impactsRef.current
    const activeDents = activeDentsRef.current
    const pressInputs = pressInputsRef.current
    const fractureState = fractureStateRef.current
    pressInputs.length = 0

    if (reducedMotion) {
      introRef.current.value = 1
      introRef.current.velocity = 0
    } else {
      stepSpring(introRef.current, 1, delta, INTRO_SPRING)
    }

    for (const active of activePressesRef.current.values()) {
      const springScratch = springScratchRef.current
      springScratch.value = active.dent.amount
      springScratch.velocity = active.dent.velocity
      stepSpring(
        springScratch,
        1,
        delta,
        definition.deformation.spring,
      )
      active.dent.amount = Math.min(1, springScratch.value)
      active.dent.velocity = springScratch.velocity
      const durationSeconds = (now - active.startedAt) / 1000
      active.damageInput.durationSeconds = durationSeconds
      active.damageInput.pressure =
        Math.min(1, Math.max(0.3, active.dent.amount)) *
        (active.hit.pressure > 0
          ? THREE.MathUtils.clamp(
              active.hit.pressure * 1.45,
              0.7,
              1,
            )
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

    const tapPulses = tapPulsesRef.current
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
      if (activeDents.has(impact) || impact.permanent) {
        continue
      }
      const springScratch = springScratchRef.current
      springScratch.value = impact.amount
      springScratch.velocity = impact.velocity
      stepSpring(
        springScratch,
        runtimeConfig?.releasedImpactTarget ?? 0,
        delta,
        definition.deformation.spring,
      )
      impact.amount = springScratch.value
      impact.velocity = springScratch.velocity
    }
    for (let index = impacts.length - 1; index >= 0; index -= 1) {
      const impact = impacts[index]
      if (
        (runtimeConfig?.releasedImpactTarget ?? 0) === 0 &&
        !activeDents.has(impact) &&
        !impact.permanent &&
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

    stepFracture(fractureModel, fractureState, pressInputs, delta)
    let newlyBrokenBondCount = 0
    if (fractureState.events.length > 0) {
      const detachedFragments: number[] = []
      const newClusters: DebrisCluster[] = []
      for (const event of fractureState.events) {
        if (event.type === 'bond-break') {
          newlyBrokenBondCount += 1
        } else if (event.type === 'fragment-detach') {
          detachedFragments.push(event.fragmentIndex)
          hasDetachedRef.current = true
          if (reducedMotion) {
            detachFragmentForFade(
              fadeStateRef.current,
              event.fragmentIndex,
            )
          }
        } else if (
          event.type === 'complete' &&
          !completionSentRef.current
        ) {
          completionSentRef.current = true
          onComplete(definition.id)
        }
      }
      if (newlyBrokenBondCount > 0) {
        playCrackSound(newlyBrokenBondCount)
      }
      const connectedGroups = groupConnectedFragments(
        detachedFragments,
        waxTopology.fragments,
        runtimeConfig?.maximumClusterSize ??
          SOAP_DEBRIS_MAX_CLUSTER_SIZE,
        coatingSeed,
      )
      for (const group of connectedGroups) {
        const cluster = createDebrisCluster(group)
        if (cluster) {
          newClusters.push(cluster)
        }
      }
      if (newClusters.length > 0) {
        setPhysicsDebrisClusters((current) => [
          ...current,
          ...newClusters,
        ])
      }
      geometryDirtyRef.current = true
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
      let fragmentIndex = 0;
      fragmentIndex < peelAmounts.length;
      fragmentIndex += 1
    ) {
      const state = fractureState.fragmentState[fragmentIndex]
      const degree =
        fractureModel.incidentStarts[fragmentIndex + 1] -
        fractureModel.incidentStarts[fragmentIndex]
      const brokenRatio =
        degree > 0
          ? fractureState.fragmentBrokenBonds[fragmentIndex] / degree
          : 0
      const target =
        state >= FRAGMENT_STATE.PEELING
          ? 1
          : state === FRAGMENT_STATE.CRACKED
            ? brokenRatio * 0.22
            : 0
      const next = THREE.MathUtils.lerp(
        peelAmounts[fragmentIndex],
        target,
        peelEase,
      )
      if (Math.abs(next - peelAmounts[fragmentIndex]) > 0.0001) {
        peelAmounts[fragmentIndex] = next
        geometryDirtyRef.current = true
      }
    }

    if (impacts.length > 0) {
      writeBodyGeometry(innerGeometry, innerSource, impacts)
      if (labelGeometry && labelSource) {
        writeBodyGeometry(labelGeometry, labelSource, impacts)
      }
      if (accentGeometry && accentSource) {
        writeBodyGeometry(
          accentGeometry,
          accentSource,
          impacts,
        )
      }
      bodyNeedsRestoreRef.current = true
    } else if (bodyNeedsRestoreRef.current) {
      writeBodyGeometry(innerGeometry, innerSource, [])
      if (labelGeometry && labelSource) {
        writeBodyGeometry(labelGeometry, labelSource, [])
      }
      if (accentGeometry && accentSource) {
        writeBodyGeometry(accentGeometry, accentSource, [])
      }
      bodyNeedsRestoreRef.current = false
      geometryDirtyRef.current = true
    }

    const fadeState = fadeStateRef.current
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
    for (
      let fragmentIndex = 0;
      fragmentIndex < waxTopology.plateCount;
      fragmentIndex += 1
    ) {
      const alpha = fadeState.alpha[fragmentIndex]
      if (
        Math.abs(alpha - lastAlphaRef.current[fragmentIndex]) >
        0.001
      ) {
        const fragment = waxTopology.fragments[fragmentIndex]
        writeFragmentFadeColorAlpha(
          waxColorAttribute,
          fragment.vertexRange.start,
          fragment.vertexRange.count,
          alpha,
        )
        lastAlphaRef.current[fragmentIndex] = alpha
      }
    }
    for (
      let retiredIndex = 0;
      retiredIndex < fadeState.retiredCount;
      retiredIndex += 1
    ) {
      const fragmentIndex = fadeState.retiredIndices[retiredIndex]
      const offset = fragmentIndex * 3
      fragmentPosesRef.current.positions[offset + 1] = -100
      geometryDirtyRef.current = true
    }
    let retiredClusterCount = 0
    for (const binding of clusterBindingsRef.current.values()) {
      if (
        binding.fragmentIndices.every((fragmentIndex) =>
          isFragmentRetired(fadeState, fragmentIndex),
        )
      ) {
        retiredClusterCount += 1
      }
    }
    if (retiredClusterCount > 0) {
      setPhysicsDebrisClusters((current) =>
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

    if (geometryDirtyRef.current) {
      writeWaxGeometry({
        runtime: waxRuntime,
        topology: waxTopology,
        fractureModel,
        fractureState,
        impacts,
        peelAmounts,
        fragmentPoses: fragmentPosesRef.current,
        dentProfile,
        displacementSampler: runtimeConfig?.displacementSampler,
      })
      geometryDirtyRef.current = false
    }

    const newestImpact = impacts[impacts.length - 1]
    const compression = newestImpact
      ? Math.max(0, newestImpact.amount)
      : 0
    if (compressionRef.current) {
      if (hasDetachedRef.current) {
        compressionRef.current.scale.setScalar(1)
      } else {
        const normal = newestImpact?.localNormal ?? DEFAULT_NORMAL
        const amount = definition.deformation.compression
        compressionRef.current.scale.set(
          1 -
            amount * Math.abs(normal[0]) * compression +
            amount * 0.2 * (1 - Math.abs(normal[0])) * compression,
          1 -
            amount * Math.abs(normal[1]) * compression +
            amount * 0.2 * (1 - Math.abs(normal[1])) * compression,
          1 -
            amount * Math.abs(normal[2]) * compression +
            amount * 0.2 * (1 - Math.abs(normal[2])) * compression,
        )
      }
    }

    let idlePulse = 0
    if (
      !reducedMotion &&
      !hasDetachedRef.current &&
      now - lastInteractionRef.current > 5500
    ) {
      const pulseTime =
        ((now - lastInteractionRef.current - 5500) / 1000) % 5.6
      if (pulseTime < 1.2) {
        idlePulse =
          Math.sin((pulseTime / 1.2) * Math.PI) ** 2 * 0.018
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
  const handleBodyPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) =>
      handlePointerDown(event, 'butter'),
    [handlePointerDown],
  )

  return (
    <group position={position} scale={scale}>
      <group ref={presentationRef}>
        <group ref={compressionRef}>
          <mesh
            geometry={innerGeometry}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handleBodyPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <meshPhysicalMaterial
              clearcoat={definition.style.clearcoat}
              color={definition.style.bodyColor}
              metalness={definition.style.metalness}
              roughness={definition.style.roughness}
              sheen={definition.style.sheen}
              thickness={0.12}
              transmission={definition.style.transmission}
            />
          </mesh>
          {labelGeometry && labelTexture ? (
            <mesh
              geometry={labelGeometry}
              position={[
                0,
                0,
                (runtimeConfig?.outerOffset ??
                  SOAP_OUTER_OFFSET) * 0.4,
              ]}
              raycast={NO_RAYCAST}
              renderOrder={1}
            >
              <meshBasicMaterial
                alphaTest={0.5}
                depthTest
                depthWrite
                map={labelTexture}
                polygonOffset
                polygonOffsetFactor={-7}
                toneMapped={false}
                transparent={false}
              />
            </mesh>
          ) : null}
          <mesh
            geometry={waxRuntime.geometry}
            frustumCulled={false}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handleWaxPointerDown}
            onPointerMove={handlePointerMove}
            onPointerOut={handlePointerOut}
            onPointerOver={handlePointerOver}
            onPointerUp={handlePointerUp}
          >
            <meshPhysicalMaterial
              alphaHash
              {...(runtimeConfig?.waxMaterial ??
                SOAP_WAX_PHYSICAL_PROPERTIES)}
              attenuationColor={waxPalette.attenuationColor}
              color={waxPalette.surfaceColor}
              vertexColors
            />
          </mesh>
          {accentGeometry ? (
            <points
              geometry={accentGeometry}
              raycast={NO_RAYCAST}
              renderOrder={2}
            >
              <pointsMaterial
                size={definition.id === 'sugar' ? 0.03 : 0.046}
                sizeAttenuation
                vertexColors
              />
            </points>
          ) : null}
        </group>
      </group>
    </group>
  )
})
