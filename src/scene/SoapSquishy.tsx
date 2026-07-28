import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  memo,
} from 'react'
import * as THREE from 'three'
import {
  captureDeformationSource,
  writeDeformedPositions,
  type DentProfile,
} from './deformation'
import {
  createFractureModel,
  createFractureState,
  FRAGMENT_STATE,
  stepFracture,
  type FracturePress,
} from './fracture/damage'
import {
  createFragmentFadeState,
  detachFragmentForFade,
  FRAGMENT_FADE_PHASE,
  stepFragmentFade,
} from './fracture/fragmentFade'
import {
  attachFragmentFadeColorAttribute,
  writeFragmentFadeColorAlpha,
} from './fracture/fragmentFadeGeometry'
import {
  createWaxTopology,
  getWaxTriangleMetadata,
} from './fracture/topology'
import { WAX_SEAM_PROFILE } from './fracture/types'
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
  getSoapWaxPalette,
  type SoapDefinition,
} from './soaps'
import { INTRO_SPRING, stepSpring } from './spring'
import type {
  DentImpact,
  SurfaceHit,
  SurfaceLayer,
} from './types'

type SoapSquishyProps = Readonly<{
  definition: SoapDefinition
  coatingSeed: number
  labelTexture: THREE.Texture
  position: readonly [number, number, number]
  scale?: readonly [number, number, number]
  reducedMotion: boolean
  onComplete: (soapId: SoapDefinition['id']) => void
  playCrackSound: (brokenBondCount: number) => void
  unlockCrackAudio: () => void
  introDelay?: number
}>

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

const SOAP_PLATE_COUNT = 16
const SOAP_INNER_CLEARANCE = 0.008
const SOAP_OUTER_OFFSET = 0.045
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

function signedNoise(seed: number) {
  return (hashUint32(seed) / 0xffffffff) * 2 - 1
}

function styleSoapGeometry(
  geometry: THREE.BufferGeometry,
  definition: SoapDefinition,
  isDecal = false,
) {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const [width, height, depth] = definition.geometry.size
  const behavior = definition.deformation.behavior

  for (let index = 0; index < positions.count; index += 1) {
    let x = positions.getX(index)
    let y = positions.getY(index)
    let z = positions.getZ(index)
    const normalizedX = x / (width * 0.5)
    const normalizedY = y / (height * 0.5)
    const normalizedZ = z / (depth * 0.5)
    const centerFalloff = Math.max(
      0,
      (1 - normalizedX * normalizedX) *
        (1 - normalizedY * normalizedY),
    )

    if (behavior === 'chalky') {
      x += normalizedY * 0.035
    } else if (behavior === 'supple') {
      z += Math.sign(z || 1) * centerFalloff * 0.045
      y += Math.sin(normalizedX * Math.PI) * 0.018
    } else if (behavior === 'snappy') {
      x *= 1 + normalizedY * 0.022
    } else if (behavior === 'wobbly') {
      y += Math.sin(normalizedX * Math.PI * 1.25) * 0.032
      z += Math.sign(z || 1) * centerFalloff * 0.035
    } else if (behavior === 'crunchy' && !isDecal) {
      const grain =
        signedNoise(
          definition.seedSalt ^
            Math.imul(index + 1, 0x9e3779b1),
        ) * 0.012
      z += grain * Math.max(0.25, Math.abs(normalizedZ))
    } else if (behavior === 'gooey') {
      const bottomWeight = Math.max(0, -normalizedY)
      y -=
        bottomWeight *
        Math.max(0, 1 - normalizedX * normalizedX) *
        0.055
      z += Math.sign(z || 1) * centerFalloff * 0.05
    } else if (behavior === 'granular' && !isDecal) {
      const grain =
        signedNoise(
          definition.seedSalt ^
            Math.imul(index + 7, 0x85ebca6b),
        ) * 0.009
      x += grain * normalizedX
      y += grain * normalizedY
      z += grain * Math.sign(normalizedZ || 1)
    }

    if (isDecal) {
      z +=
        behavior === 'crunchy' || behavior === 'granular'
          ? 0.016
          : 0.001
    }
    positions.setXYZ(index, x, y, z)
  }

  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function createAccentGeometry(definition: SoapDefinition) {
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
    positions[index * 3] = (xRoll - 0.5) * width * 0.78
    positions[index * 3 + 1] = (yRoll - 0.5) * height * 0.62
    positions[index * 3 + 2] = depth * 0.5 + 0.012
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
  playCrackSound,
  unlockCrackAudio,
  introDelay = 0,
}: SoapSquishyProps) {
  const presentationRef = useRef<THREE.Group>(null)
  const compressionRef = useRef<THREE.Group>(null)
  const innerGeometry = useMemo(
    () =>
      styleSoapGeometry(
        definition.geometry.createSourceGeometry(),
        definition,
      ),
    [definition],
  )
  const labelGeometry = useMemo(
    () =>
      styleSoapGeometry(
        definition.decal.createGeometry(),
        definition,
        true,
      ),
    [definition],
  )
  const accentGeometry = useMemo(
    () => createAccentGeometry(definition),
    [definition],
  )
  const waxPalette = useMemo(
    () => getSoapWaxPalette(definition.style.bodyColor),
    [definition.style.bodyColor],
  )
  const innerSource = useMemo(
    () => captureDeformationSource(innerGeometry),
    [innerGeometry],
  )
  const labelSource = useMemo(
    () => captureDeformationSource(labelGeometry),
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
        sourceGeometry: innerGeometry,
        seed: coatingSeed,
        plateCount: SOAP_PLATE_COUNT,
        innerClearance: SOAP_INNER_CLEARANCE,
        outerOffset: SOAP_OUTER_OFFSET,
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
    [definition.deformation.dentRadius, waxTopology],
  )
  const fractureStateRef = useRef(createFractureState(fractureModel))
  const fadeStateRef = useRef(
    createFragmentFadeState(waxTopology.plateCount),
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
  const debrisVelocityRef = useRef(
    new Float32Array(waxTopology.plateCount * 3),
  )
  const debrisAxisRef = useRef(
    new Float32Array(waxTopology.plateCount * 3),
  )
  const debrisSpinRef = useRef(
    new Float32Array(waxTopology.plateCount),
  )
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

  useEffect(() => {
    writeDeformedPositions(
      innerGeometry,
      innerSource,
      [],
      0,
      dentProfile,
    )
    writeDeformedPositions(
      labelGeometry,
      labelSource,
      [],
      0,
      dentProfile,
    )
    if (accentGeometry && accentSource) {
      writeDeformedPositions(
        accentGeometry,
        accentSource,
        [],
        0,
        dentProfile,
      )
    }
    writeWaxGeometry({
      runtime: waxRuntime,
      topology: waxTopology,
      fractureModel,
      fractureState: fractureStateRef.current,
      impacts: [],
      peelAmounts: peelAmountsRef.current,
      dentProfile,
    })
    waxRuntime.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      8,
    )

    return () => {
      innerGeometry.dispose()
      labelGeometry.dispose()
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
    waxRuntime,
    waxTopology,
  ])

  const addDent = useCallback((hit: SurfaceHit) => {
    const impacts = impactsRef.current
    if (impacts.length >= MAX_ACTIVE_SOAP_IMPACTS) {
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

      geometryDirtyRef.current = true
      bodyNeedsRestoreRef.current = true
    },
    [],
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

  const initializeDetachedFragment = useCallback(
    (fragmentIndex: number) => {
      const fadeState = fadeStateRef.current
      detachFragmentForFade(fadeState, fragmentIndex)
      hasDetachedRef.current = true
      const offset = fragmentIndex * 3
      const quaternionOffset = fragmentIndex * 4
      const fragment = waxTopology.fragments[fragmentIndex]
      const seed = hashUint32(
        coatingSeed ^
          Math.imul(fragmentIndex + 1, 0x9e3779b1),
      )
      const tangentX = signedNoise(seed ^ 0x68bc21eb)
      const tangentY = signedNoise(seed ^ 0x02e5be93)
      const normal = fragment.averageNormal
      debrisVelocityRef.current[offset] =
        normal[0] * 0.16 + tangentX * 0.045
      debrisVelocityRef.current[offset + 1] =
        normal[1] * 0.14 + 0.07 + tangentY * 0.035
      debrisVelocityRef.current[offset + 2] =
        normal[2] * 0.17 + signedNoise(seed ^ 0x967a889b) * 0.035
      const axisLength = Math.max(
        0.001,
        Math.hypot(tangentY, tangentX, 0.75),
      )
      debrisAxisRef.current[offset] = tangentY / axisLength
      debrisAxisRef.current[offset + 1] = tangentX / axisLength
      debrisAxisRef.current[offset + 2] = 0.75 / axisLength
      debrisSpinRef.current[fragmentIndex] =
        0.55 + (seed / 0xffffffff) * 0.8
      fragmentPosesRef.current.valid[fragmentIndex] = 1
      fragmentPosesRef.current.positions[offset] =
        waxRuntime.pivots[offset]
      fragmentPosesRef.current.positions[offset + 1] =
        waxRuntime.pivots[offset + 1]
      fragmentPosesRef.current.positions[offset + 2] =
        waxRuntime.pivots[offset + 2]
      fragmentPosesRef.current.quaternions[quaternionOffset] = 0
      fragmentPosesRef.current.quaternions[
        quaternionOffset + 1
      ] = 0
      fragmentPosesRef.current.quaternions[
        quaternionOffset + 2
      ] = 0
      fragmentPosesRef.current.quaternions[
        quaternionOffset + 3
      ] = 1
    },
    [coatingSeed, waxRuntime.pivots, waxTopology.fragments],
  )

  const debrisQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const debrisAxis = useMemo(() => new THREE.Vector3(), [])

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
        definition.deformation.spring,
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

    stepFracture(fractureModel, fractureState, pressInputs, delta)
    if (fractureState.events.length > 0) {
      let brokenBondCount = 0
      for (const event of fractureState.events) {
        if (event.type === 'bond-break') {
          brokenBondCount += 1
        } else if (event.type === 'fragment-detach') {
          initializeDetachedFragment(event.fragmentIndex)
        } else if (
          event.type === 'complete' &&
          !completionSentRef.current
        ) {
          completionSentRef.current = true
          onComplete(definition.id)
        }
      }
      if (brokenBondCount > 0) {
        playCrackSound(brokenBondCount)
      }
      geometryDirtyRef.current = true
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
      writeDeformedPositions(
        innerGeometry,
        innerSource,
        impacts,
        0,
        dentProfile,
      )
      writeDeformedPositions(
        labelGeometry,
        labelSource,
        impacts,
        0,
        dentProfile,
      )
      if (accentGeometry && accentSource) {
        writeDeformedPositions(
          accentGeometry,
          accentSource,
          impacts,
          0,
          dentProfile,
        )
      }
      bodyNeedsRestoreRef.current = true
    } else if (bodyNeedsRestoreRef.current) {
      writeDeformedPositions(
        innerGeometry,
        innerSource,
        [],
        0,
        dentProfile,
      )
      writeDeformedPositions(
        labelGeometry,
        labelSource,
        [],
        0,
        dentProfile,
      )
      if (accentGeometry && accentSource) {
        writeDeformedPositions(
          accentGeometry,
          accentSource,
          [],
          0,
          dentProfile,
        )
      }
      bodyNeedsRestoreRef.current = false
      geometryDirtyRef.current = true
    }

    const fadeState = fadeStateRef.current
    stepFragmentFade(fadeState, delta, reducedMotion)
    for (
      let fragmentIndex = 0;
      fragmentIndex < waxTopology.plateCount;
      fragmentIndex += 1
    ) {
      const phase = fadeState.phase[fragmentIndex]
      if (phase === FRAGMENT_FADE_PHASE.SIMULATING) {
        const age = fadeState.detachedAgeSeconds[fragmentIndex]
        const offset = fragmentIndex * 3
        const quaternionOffset = fragmentIndex * 4
        const velocity = debrisVelocityRef.current
        fragmentPosesRef.current.positions[offset] =
          waxRuntime.pivots[offset] + velocity[offset] * age
        fragmentPosesRef.current.positions[offset + 1] =
          waxRuntime.pivots[offset + 1] +
          velocity[offset + 1] * age -
          age * age * 0.08
        fragmentPosesRef.current.positions[offset + 2] =
          waxRuntime.pivots[offset + 2] +
          velocity[offset + 2] * age
        debrisAxis.fromArray(debrisAxisRef.current, offset)
        debrisQuaternion.setFromAxisAngle(
          debrisAxis,
          debrisSpinRef.current[fragmentIndex] * age,
        )
        fragmentPosesRef.current.quaternions[quaternionOffset] =
          debrisQuaternion.x
        fragmentPosesRef.current.quaternions[
          quaternionOffset + 1
        ] = debrisQuaternion.y
        fragmentPosesRef.current.quaternions[
          quaternionOffset + 2
        ] = debrisQuaternion.z
        fragmentPosesRef.current.quaternions[
          quaternionOffset + 3
        ] = debrisQuaternion.w
        geometryDirtyRef.current = true
      }

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
          <mesh
            geometry={labelGeometry}
            raycast={NO_RAYCAST}
            renderOrder={1}
          >
            <meshBasicMaterial
              alphaTest={0.015}
              depthTest
              depthWrite
              map={labelTexture}
              polygonOffset
              polygonOffsetFactor={-7}
              toneMapped={false}
              transparent={false}
            />
          </mesh>
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
              {...SOAP_WAX_PHYSICAL_PROPERTIES}
              attenuationColor={waxPalette.attenuationColor}
              color={waxPalette.surfaceColor}
              vertexColors
            />
          </mesh>
          <mesh
            geometry={labelGeometry}
            position={[0, 0, SOAP_OUTER_OFFSET + 0.006]}
            raycast={NO_RAYCAST}
            renderOrder={3}
          >
            <meshBasicMaterial
              alphaTest={0.015}
              depthTest
              depthWrite={false}
              map={labelTexture}
              opacity={0.52}
              polygonOffset
              polygonOffsetFactor={-5}
              toneMapped={false}
              transparent
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
