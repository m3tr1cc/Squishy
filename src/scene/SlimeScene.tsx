import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import { bindPointerCancellation } from './interaction'
import {
  SLIME_CONTAINER_BASE_Y,
  SLIME_CONTAINER_HEIGHT,
  SLIME_CONTAINER_RADIUS,
  SLIME_CROWN_Y,
  SLIME_MAX_INTERACTIONS,
  SLIME_RIM_Y,
  applySlimeInteraction,
  captureSlimeGeometrySources,
  createSlimeContainerGeometries,
  createSlimeGeometry,
  createSlimeInteractionRuntime,
  createSlimeLabelGeometry,
  createSlimeLabelTextureAsync,
  getSlimeMixProgress,
  sampleSlimeColor,
  sampleSlimeDisplacement,
} from './slime'
import { stepSpring, type SpringState } from './spring'
import { PerformanceDiagnostics, useReducedMotion } from './SquishyScene'
import {
  createSquishyVisualSignalSources,
  createSynesthesiaTheme,
  emitSynesthesiaBurst,
  SynesthesiaBackground,
} from './synesthesia'

type SlimeSceneProps = Readonly<{
  experienceSeed: number
  onSaturated: () => void
  playSlime: () => void
}>

type PointerSlot = {
  pointerId: number
  pointerType: string
  startX: number
  startY: number
  target: number
  spring: SpringState
}

const NO_RAYCAST = () => null
const SLIME_PRESS_SPRING = Object.freeze({
  stiffness: 320,
  damping: 27,
  mass: 1,
})

export const SLIME_SYNESTHESIA_THEME = createSynesthesiaTheme({
  leadingColor: '#ff9a45',
  complementaryColor: '#ff4f9b',
  shadowColor: '#190814',
  seed: 0x51a9e2d3,
  idleSpeed: 0.115,
  maximumMotifs: 6,
})

export function getResponsiveSlimeCameraPose(
  width: number,
  height: number,
  fieldOfViewDegrees = 32,
) {
  const aspect = Math.max(0.25, width / Math.max(1, height))
  const verticalFov = THREE.MathUtils.degToRad(fieldOfViewDegrees)
  const halfHeight = 2.75
  const halfWidth = 2.85
  const fitWidth = halfWidth / (Math.tan(verticalFov / 2) * aspect)
  const fitHeight = halfHeight / Math.tan(verticalFov / 2)
  const distance = Math.max(fitWidth, fitHeight) + 0.65
  const direction = new THREE.Vector3(0.49, 0.34, 0.8).normalize()
  const target = new THREE.Vector3(0, 0.1, 0)
  const position = target.clone().addScaledVector(direction, distance)
  return {
    position: position.toArray() as [number, number, number],
    target: target.toArray() as [number, number, number],
  }
}

function ResponsiveSlimeCamera() {
  const { camera, size } = useThree()
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return
    }
    const pose = getResponsiveSlimeCameraPose(
      size.width,
      size.height,
      camera.fov,
    )
    camera.position.fromArray(pose.position)
    camera.lookAt(...pose.target)
    camera.updateProjectionMatrix()
  }, [camera, size.height, size.width])
  return null
}

function SlimeJar({
  experienceSeed,
  onSaturated,
  playSlime,
  reducedMotion,
  visualSignals,
}: SlimeSceneProps & {
  reducedMotion: boolean
  visualSignals: ReturnType<typeof createSquishyVisualSignalSources>[number]
}) {
  const canvasElement = useThree((state) => state.gl.domElement)
  const slimeMeshRef = useRef<THREE.Mesh>(null)
  const ribMeshRef = useRef<THREE.InstancedMesh>(null)
  const runtime = useMemo(createSlimeInteractionRuntime, [experienceSeed])
  const slimeGeometry = useMemo(createSlimeGeometry, [experienceSeed])
  const source = useMemo(
    () => captureSlimeGeometrySources(slimeGeometry),
    [slimeGeometry],
  )
  const container = useMemo(createSlimeContainerGeometries, [])
  const labelGeometry = useMemo(createSlimeLabelGeometry, [])
  const [labelTexture, setLabelTexture] = useState<THREE.CanvasTexture | null>(
    null,
  )
  const displayedInteractionCountRef = useRef(0)
  const impactStrengthsRef = useRef(
    new Float32Array(SLIME_MAX_INTERACTIONS),
  )
  const transientCoordinatesRef = useRef(new Float32Array(4))
  const transientStrengthsRef = useRef(new Float32Array(2))
  const transientPressesRef = useRef({
    coordinates: transientCoordinatesRef.current,
    strengths: transientStrengthsRef.current,
  })
  const pointerSlotsRef = useRef<PointerSlot[]>([
    {
      pointerId: -1,
      pointerType: '',
      startX: 0,
      startY: 0,
      target: 0,
      spring: { value: 0, velocity: 0 },
    },
    {
      pointerId: -1,
      pointerType: '',
      startX: 0,
      startY: 0,
      target: 0,
      spring: { value: 0, velocity: 0 },
    },
  ])
  const displacementScratchRef = useRef({ x: 0, y: 0, z: 0 })
  const colorScratchRef = useRef({ r: 0, g: 0, b: 0 })
  const localPointScratchRef = useRef(new THREE.Vector3())
  const lastColorProgressRef = useRef(Number.NEGATIVE_INFINITY)
  const firstFrameRef = useRef(true)

  useEffect(() => {
    let active = true
    let loadedTexture: THREE.CanvasTexture | null = null
    void createSlimeLabelTextureAsync().then((texture) => {
      loadedTexture = texture
      if (active) {
        setLabelTexture(texture)
      } else {
        texture.dispose()
      }
    })
    return () => {
      active = false
      loadedTexture?.dispose()
    }
  }, [])

  useEffect(() => {
    const ribs = ribMeshRef.current
    if (!ribs) {
      return
    }
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.PI / 2, 0, 0),
    )
    const scale = new THREE.Vector3(1, 1, 1)
    for (let index = 0; index < 2; index += 1) {
      matrix.compose(
        new THREE.Vector3(0, SLIME_RIM_Y - 0.29 - index * 0.15, 0),
        quaternion,
        scale,
      )
      ribs.setMatrixAt(index, matrix)
    }
    ribs.instanceMatrix.needsUpdate = true
  }, [])

  useEffect(
    () => () => {
      slimeGeometry.dispose()
    },
    [slimeGeometry],
  )

  useEffect(
    () => () => {
      container.wall.dispose()
      container.base.dispose()
      container.rim.dispose()
      container.innerRim.dispose()
      container.rib.dispose()
      labelGeometry.dispose()
      canvasElement.classList.remove('wax-pointer-hover')
    },
    [canvasElement, container, labelGeometry],
  )

  const releasePointer = useCallback((pointerId: number) => {
    const slots = pointerSlotsRef.current
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index]
      if (slot.pointerId !== pointerId) {
        continue
      }
      slot.pointerId = -1
      slot.target = 0
      return
    }
  }, [])

  useEffect(() => {
    const eventSurface =
      canvasElement.closest('.squishy-canvas-stage') ?? canvasElement
    return bindPointerCancellation(eventSurface, ({ pointerId }) => {
      releasePointer(pointerId)
    })
  }, [canvasElement, releasePointer])

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const mesh = slimeMeshRef.current
      if (!mesh || !event.face) {
        return
      }
      const localPoint = localPointScratchRef.current
        .copy(event.point)
      mesh.worldToLocal(localPoint)
      if (
        localPoint.y < SLIME_RIM_Y - 0.12 ||
        event.face.normal.y < 0.18
      ) {
        return
      }

      const slots = pointerSlotsRef.current
      if (slots.some((slot) => slot.pointerId === event.nativeEvent.pointerId)) {
        return
      }
      const freeSlotIndex = slots.findIndex((slot) => slot.pointerId < 0)
      if (freeSlotIndex < 0) {
        return
      }
      if (event.nativeEvent.cancelable) {
        event.nativeEvent.preventDefault()
      }
      event.stopPropagation()
      const captureTarget = event.target as EventTarget & {
        setPointerCapture?: (pointerId: number) => void
      }
      try {
        captureTarget.setPointerCapture?.(event.nativeEvent.pointerId)
      } catch {
        // Synthetic events and older embedded browsers may not capture.
      }

      const slot = slots[freeSlotIndex]
      slot.pointerId = event.nativeEvent.pointerId
      slot.pointerType = event.nativeEvent.pointerType
      slot.startX = event.nativeEvent.clientX
      slot.startY = event.nativeEvent.clientY
      slot.target = 1
      transientCoordinatesRef.current[freeSlotIndex * 2] = localPoint.x
      transientCoordinatesRef.current[freeSlotIndex * 2 + 1] = localPoint.z

      const result = applySlimeInteraction(runtime, localPoint.x, localPoint.z)
      if (result.becameSaturated) {
        onSaturated()
      }
      emitSynesthesiaBurst(visualSignals, result.changedPermanently ? 0.82 : 0.52)
      playSlime()
    },
    [onSaturated, playSlime, runtime, visualSignals],
  )

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const slot = pointerSlotsRef.current.find(
        (candidate) => candidate.pointerId === event.nativeEvent.pointerId,
      )
      if (
        slot?.pointerType === 'touch' &&
        Math.hypot(
          event.nativeEvent.clientX - slot.startX,
          event.nativeEvent.clientY - slot.startY,
        ) > 10
      ) {
        releasePointer(event.nativeEvent.pointerId)
      }
    },
    [releasePointer],
  )

  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const pointerId = event.nativeEvent.pointerId
      releasePointer(pointerId)
      const captureTarget = event.target as EventTarget & {
        hasPointerCapture?: (pointerId: number) => boolean
        releasePointerCapture?: (pointerId: number) => void
      }
      if (captureTarget.hasPointerCapture?.(pointerId)) {
        try {
          captureTarget.releasePointerCapture?.(pointerId)
        } catch {
          // Capture may already be released after native cancellation.
        }
      }
    },
    [releasePointer],
  )

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const canHover =
        event.nativeEvent.pointerType === 'mouse' &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches
      canvasElement.classList.toggle('wax-pointer-hover', canHover)
    },
    [canvasElement],
  )

  const handlePointerOut = useCallback(() => {
    canvasElement.classList.remove('wax-pointer-hover')
  }, [canvasElement])

  useFrame((_, delta) => {
    const targetCount = runtime.interactionCount
    const countEase = reducedMotion ? 1 : 1 - Math.exp(-delta * 5.8)
    const displayedCount = reducedMotion
      ? targetCount
      : THREE.MathUtils.lerp(
          displayedInteractionCountRef.current,
          targetCount,
          countEase,
        )
    displayedInteractionCountRef.current = displayedCount

    let maximumPress = 0
    let geometryMoving = Math.abs(displayedCount - targetCount) > 0.001
    const slots = pointerSlotsRef.current
    const transientStrengths = transientStrengthsRef.current
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index]
      if (reducedMotion) {
        slot.spring.value = slot.target * 0.4
        slot.spring.velocity = 0
      } else {
        stepSpring(
          slot.spring,
          slot.target,
          delta,
          SLIME_PRESS_SPRING,
        )
      }
      transientStrengths[index] = slot.spring.value
      maximumPress = Math.max(maximumPress, slot.spring.value)
      geometryMoving ||=
        Math.abs(slot.spring.value - slot.target) > 0.001 ||
        Math.abs(slot.spring.velocity) > 0.001
    }

    const impactStrengths = impactStrengthsRef.current
    for (let index = 0; index < runtime.interactionCount; index += 1) {
      const next = reducedMotion
        ? 1
        : THREE.MathUtils.lerp(
            impactStrengths[index],
            1,
            1 - Math.exp(-delta * 8.5),
          )
      geometryMoving ||= Math.abs(next - 1) > 0.001
      impactStrengths[index] = next
    }

    visualSignals.pressStrength = THREE.MathUtils.clamp(maximumPress, 0, 1)
    visualSignals.damageProgress = Math.max(
      visualSignals.damageProgress,
      getSlimeMixProgress(displayedCount),
    )

    if (!geometryMoving && !firstFrameRef.current) {
      return
    }
    firstFrameRef.current = false
    const positionAttribute = slimeGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    const positions = positionAttribute.array as Float32Array
    const sourcePositions = source.positions
    const displacement = displacementScratchRef.current
    const transientPresses = transientPressesRef.current
    for (let offset = 0; offset < sourcePositions.length; offset += 3) {
      const x = sourcePositions[offset]
      const y = sourcePositions[offset + 1]
      const z = sourcePositions[offset + 2]
      sampleSlimeDisplacement(
        x,
        y,
        z,
        SLIME_RIM_Y,
        SLIME_CROWN_Y,
        SLIME_CONTAINER_RADIUS,
        runtime,
        impactStrengths,
        displayedCount,
        transientPresses,
        displacement,
      )
      positions[offset] = x + displacement.x
      positions[offset + 1] = y + displacement.y
      positions[offset + 2] = z + displacement.z
    }
    positionAttribute.needsUpdate = true
    slimeGeometry.computeVertexNormals()

    if (
      Math.abs(displayedCount - lastColorProgressRef.current) > 0.002 ||
      displayedCount >= SLIME_MAX_INTERACTIONS
    ) {
      const colorAttribute = slimeGeometry.getAttribute(
        'color',
      ) as THREE.BufferAttribute
      const colors = colorAttribute.array as Float32Array
      const color = colorScratchRef.current
      for (let offset = 0; offset < sourcePositions.length; offset += 3) {
        sampleSlimeColor(
          sourcePositions[offset],
          sourcePositions[offset + 1],
          sourcePositions[offset + 2],
          runtime,
          displayedCount,
          color,
        )
        colors[offset] = color.r
        colors[offset + 1] = color.g
        colors[offset + 2] = color.b
      }
      colorAttribute.needsUpdate = true
      lastColorProgressRef.current = displayedCount
    }
  })

  const containerCenterY =
    SLIME_CONTAINER_BASE_Y + SLIME_CONTAINER_HEIGHT * 0.5

  return (
    <group>
      <mesh
        castShadow
        ref={slimeMeshRef}
        geometry={slimeGeometry}
        frustumCulled={false}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onPointerOver={handlePointerOver}
        onPointerUp={handlePointerUp}
        renderOrder={1}
      >
        <meshPhysicalMaterial
          clearcoat={1}
          clearcoatRoughness={0.055}
          metalness={0}
          roughness={0.16}
          sheen={0.34}
          sheenColor="#fff3ec"
          specularIntensity={1}
          transmission={0.035}
          vertexColors
        />
      </mesh>

      <mesh
        geometry={container.wall}
        position={[0, containerCenterY, 0]}
        raycast={NO_RAYCAST}
        renderOrder={3}
      >
        <meshPhysicalMaterial
          clearcoat={1}
          clearcoatRoughness={0.04}
          color="#eaf7ff"
          depthWrite={false}
          ior={1.47}
          opacity={0.23}
          roughness={0.08}
          side={THREE.DoubleSide}
          thickness={0.08}
          transmission={0.5}
          transparent
        />
      </mesh>
      <mesh
        geometry={container.base}
        position={[0, SLIME_CONTAINER_BASE_Y + 0.065, 0]}
        raycast={NO_RAYCAST}
        renderOrder={3}
      >
        <meshPhysicalMaterial
          clearcoat={1}
          color="#eaf7ff"
          depthWrite={false}
          opacity={0.28}
          roughness={0.11}
          transmission={0.42}
          transparent
        />
      </mesh>
      <mesh
        geometry={container.rim}
        position={[0, SLIME_RIM_Y, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        raycast={NO_RAYCAST}
        renderOrder={4}
      >
        <meshPhysicalMaterial
          clearcoat={1}
          color="#f5fbff"
          depthWrite={false}
          opacity={0.42}
          roughness={0.08}
          transmission={0.38}
          transparent
        />
      </mesh>
      <mesh
        geometry={container.innerRim}
        position={[0, SLIME_RIM_Y - 0.015, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        raycast={NO_RAYCAST}
        renderOrder={4}
      >
        <meshPhysicalMaterial
          color="#ffffff"
          depthWrite={false}
          opacity={0.25}
          roughness={0.12}
          transparent
        />
      </mesh>
      <instancedMesh
        ref={ribMeshRef}
        args={[container.rib, undefined, 2]}
        raycast={NO_RAYCAST}
        renderOrder={4}
      >
        <meshPhysicalMaterial
          clearcoat={1}
          color="#f3faff"
          depthWrite={false}
          opacity={0.32}
          roughness={0.08}
          transmission={0.34}
          transparent
        />
      </instancedMesh>
      {labelTexture ? (
        <mesh
          geometry={labelGeometry}
          raycast={NO_RAYCAST}
          renderOrder={5}
        >
          <meshBasicMaterial
            alphaTest={0.08}
            depthWrite={false}
            map={labelTexture}
            side={THREE.DoubleSide}
            toneMapped={false}
            transparent
          />
        </mesh>
      ) : null}
      <mesh
        position={[0, SLIME_CONTAINER_BASE_Y - 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={NO_RAYCAST}
        receiveShadow
      >
        <circleGeometry args={[3.4, 64]} />
        <shadowMaterial opacity={0.26} />
      </mesh>
    </group>
  )
}

export function SlimeScene({
  experienceSeed,
  onSaturated,
  playSlime,
}: SlimeSceneProps) {
  const reducedMotion = useReducedMotion()
  const visualSignals = useMemo(
    () => createSquishyVisualSignalSources(1),
    [experienceSeed],
  )
  const theme = useMemo(
    () => ({
      ...SLIME_SYNESTHESIA_THEME,
      seed: (SLIME_SYNESTHESIA_THEME.seed ^ experienceSeed) >>> 0,
    }),
    [experienceSeed],
  )

  return (
    <>
      <color attach="background" args={[theme.shadowColor]} />
      <SynesthesiaBackground
        reducedMotion={reducedMotion}
        signals={visualSignals}
        theme={theme}
      />
      {import.meta.env.DEV ? <PerformanceDiagnostics /> : null}
      <ResponsiveSlimeCamera />
      <ambientLight color="#fff9f5" intensity={0.48} />
      <hemisphereLight
        args={['#fff7ef', '#160718', 0.86]}
        position={[0, 5, 2]}
      />
      <directionalLight
        castShadow
        color="#fff7ee"
        intensity={3.15}
        position={[-4.5, 7, 7]}
        shadow-bias={-0.00015}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      <directionalLight
        color="#ffc7de"
        intensity={1.2}
        position={[5, 1, 4]}
      />
      <pointLight color="#ffbf7c" intensity={6} position={[-3, 4, 3]} />
      <SlimeJar
        experienceSeed={experienceSeed}
        onSaturated={onSaturated}
        playSlime={playSlime}
        reducedMotion={reducedMotion}
        visualSignals={visualSignals[0]}
      />
    </>
  )
}
