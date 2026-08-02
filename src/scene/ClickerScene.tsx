import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  CLICKER_CLEAR_HOUSING_MATERIAL,
  CLICKER_CLEAR_INSERT_MATERIAL,
  CLICKER_HOUSING,
  CLICKER_INNER_GROOVE,
  CLICKER_KEY_COUNT,
  CLICKER_KEY_DEPTH,
  CLICKER_KEY_MATERIAL,
  CLICKER_KEYS,
  CLICKER_KEY_SIZE,
  CLICKER_KEY_TRAVEL,
  createClickerSynesthesiaTheme,
  createClickerKeyRuntime,
  getClickerKeyPosition,
  getResponsiveClickerCameraPose,
  pressClickerKey,
  releaseClickerKey,
  stepClickerKeys,
} from './clicker'
import { createRoundedCuboidGeometry } from './createRoundedCuboidGeometry'
import { bindPointerCancellation } from './interaction'
import { PerformanceDiagnostics, useReducedMotion } from './SquishyScene'
import {
  createSquishyVisualSignalSources,
  emitSynesthesiaBurst,
  SynesthesiaBackground,
} from './synesthesia'

type ClickerSceneProps = Readonly<{
  experienceSeed: number
  playThock: () => void
}>

type ActiveKeyPress = Readonly<{
  keyIndex: number
  pointerType: string
  startX: number
  startY: number
}>

const KEY_REST_Z = 0.78
const STEM_REST_Z = 0.57
const PRESENTATION_ROTATION = [-0.075, 0.025, 0] as const

function ResponsiveClickerCamera() {
  const { camera, size } = useThree()

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return
    }
    const pose = getResponsiveClickerCameraPose(
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

export function ClickerScene({
  experienceSeed,
  playThock,
}: ClickerSceneProps) {
  const reducedMotion = useReducedMotion()
  const canvasElement = useThree((state) => state.gl.domElement)
  const runtime = useMemo(createClickerKeyRuntime, [experienceSeed])
  const activePressesRef = useRef(new Map<number, ActiveKeyPress>())
  const capMeshRef = useRef<THREE.InstancedMesh>(null)
  const wellMeshRef = useRef<THREE.InstancedMesh>(null)
  const stemMeshRef = useRef<THREE.InstancedMesh>(null)
  const dummyRef = useRef(new THREE.Object3D())
  const visualSignals = useMemo(
    () => createSquishyVisualSignalSources(CLICKER_KEY_COUNT),
    [experienceSeed],
  )
  const synesthesiaTheme = useMemo(
    () => createClickerSynesthesiaTheme(experienceSeed),
    [experienceSeed],
  )
  const housingGeometry = useMemo(
    () =>
      new RoundedBoxGeometry(
        CLICKER_HOUSING.width,
        CLICKER_HOUSING.height,
        CLICKER_HOUSING.depth,
        4,
        CLICKER_HOUSING.radius,
      ),
    [],
  )
  const plateGeometry = useMemo(
    () =>
      new RoundedBoxGeometry(
        CLICKER_INNER_GROOVE.width,
        CLICKER_INNER_GROOVE.height,
        CLICKER_INNER_GROOVE.depth,
        CLICKER_INNER_GROOVE.segments,
        CLICKER_INNER_GROOVE.radius,
      ),
    [],
  )
  const keyGeometry = useMemo(
    () =>
      createRoundedCuboidGeometry({
        width: CLICKER_KEY_SIZE,
        height: CLICKER_KEY_SIZE,
        depth: CLICKER_KEY_DEPTH,
        radius: 0.285,
        widthSegments: 6,
        heightSegments: 6,
        depthSegments: 3,
      }),
    [],
  )
  const wellGeometry = useMemo(
    () =>
      createRoundedCuboidGeometry({
        width: 1.39,
        height: 1.39,
        depth: 0.11,
        radius: 0.24,
        widthSegments: 4,
        heightSegments: 4,
        depthSegments: 1,
      }),
    [],
  )
  const stemGeometry = useMemo(
    () =>
      createRoundedCuboidGeometry({
        width: 0.48,
        height: 0.48,
        depth: 0.34,
        radius: 0.09,
        widthSegments: 2,
        heightSegments: 2,
        depthSegments: 1,
      }),
    [],
  )

  useEffect(
    () => () => {
      housingGeometry.dispose()
      plateGeometry.dispose()
      keyGeometry.dispose()
      wellGeometry.dispose()
      stemGeometry.dispose()
    },
    [
      housingGeometry,
      keyGeometry,
      plateGeometry,
      stemGeometry,
      wellGeometry,
    ],
  )

  useEffect(() => {
    const wellMesh = wellMeshRef.current
    if (!wellMesh) {
      return
    }
    const dummy = dummyRef.current
    for (let index = 0; index < CLICKER_KEY_COUNT; index += 1) {
      const [x, y] = getClickerKeyPosition(index)
      dummy.position.set(x, y, 0.505)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      wellMesh.setMatrixAt(index, dummy.matrix)
    }
    wellMesh.instanceMatrix.needsUpdate = true
  }, [])

  useLayoutEffect(() => {
    const capMesh = capMeshRef.current
    if (!capMesh) {
      return
    }
    for (let index = 0; index < CLICKER_KEY_COUNT; index += 1) {
      capMesh.setColorAt(index, new THREE.Color(CLICKER_KEYS[index].color))
    }
    if (capMesh.instanceColor) {
      capMesh.instanceColor.needsUpdate = true
    }
    const material = capMesh.material
    if (!Array.isArray(material)) {
      material.needsUpdate = true
    }
  }, [])

  const releaseActivePress = useCallback(
    (pointerId: number) => {
      const active = activePressesRef.current.get(pointerId)
      if (!active) {
        return
      }
      activePressesRef.current.delete(pointerId)
      releaseClickerKey(runtime, active.keyIndex, performance.now())
    },
    [runtime],
  )

  useEffect(() => {
    const eventSurface =
      canvasElement.closest('.squishy-canvas-stage') ?? canvasElement
    return bindPointerCancellation(eventSurface, ({ pointerId }) => {
      releaseActivePress(pointerId)
    })
  }, [canvasElement, releaseActivePress])

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const keyIndex = event.instanceId
      if (keyIndex === undefined) {
        return
      }
      const pointerId = event.nativeEvent.pointerId
      const activePresses = activePressesRef.current
      if (
        activePresses.has(pointerId) ||
        [...activePresses.values()].some(
          (active) => active.keyIndex === keyIndex,
        ) ||
        (event.nativeEvent.pointerType === 'touch' &&
          activePresses.size >= 2)
      ) {
        return
      }
      if (event.nativeEvent.cancelable) {
        event.nativeEvent.preventDefault()
      }
      event.stopPropagation()
      const captureTarget = event.target as EventTarget & {
        setPointerCapture?: (capturedPointerId: number) => void
      }
      try {
        captureTarget.setPointerCapture?.(pointerId)
      } catch {
        // Synthetic events and older embedded browsers may not capture.
      }

      activePresses.set(pointerId, {
        keyIndex,
        pointerType: event.nativeEvent.pointerType,
        startX: event.nativeEvent.clientX,
        startY: event.nativeEvent.clientY,
      })
      pressClickerKey(runtime, keyIndex, performance.now())
      emitSynesthesiaBurst(visualSignals[keyIndex], 0.72)
      playThock()
    },
    [playThock, runtime, visualSignals],
  )

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const active = activePressesRef.current.get(
        event.nativeEvent.pointerId,
      )
      if (
        active?.pointerType === 'touch' &&
        Math.hypot(
          event.nativeEvent.clientX - active.startX,
          event.nativeEvent.clientY - active.startY,
        ) > 10
      ) {
        releaseActivePress(event.nativeEvent.pointerId)
      }
    },
    [releaseActivePress],
  )

  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const pointerId = event.nativeEvent.pointerId
      releaseActivePress(pointerId)
      const captureTarget = event.target as EventTarget & {
        hasPointerCapture?: (capturedPointerId: number) => boolean
        releasePointerCapture?: (capturedPointerId: number) => void
      }
      if (captureTarget.hasPointerCapture?.(pointerId)) {
        try {
          captureTarget.releasePointerCapture?.(pointerId)
        } catch {
          // Capture may already be released after native cancellation.
        }
      }
    },
    [releaseActivePress],
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
    stepClickerKeys(runtime, performance.now(), delta, reducedMotion)
    const dummy = dummyRef.current
    const stemMesh = stemMeshRef.current

    const capMesh = capMeshRef.current
    for (let keyIndex = 0; keyIndex < CLICKER_KEY_COUNT; keyIndex += 1) {
      const [x, y] = getClickerKeyPosition(keyIndex)
      const press = runtime.springs[keyIndex].value
      const travel = press * CLICKER_KEY_TRAVEL
      visualSignals[keyIndex].pressStrength = press

      if (capMesh) {
        dummy.position.set(x, y, KEY_REST_Z - travel)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        capMesh.setMatrixAt(keyIndex, dummy.matrix)
      }

      if (stemMesh) {
        dummy.position.set(x, y, STEM_REST_Z - travel)
        dummy.updateMatrix()
        stemMesh.setMatrixAt(keyIndex, dummy.matrix)
      }
    }
    if (capMesh) {
      capMesh.instanceMatrix.needsUpdate = true
    }
    if (stemMesh) {
      stemMesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <color attach="background" args={[synesthesiaTheme.shadowColor]} />
      <SynesthesiaBackground
        reducedMotion={reducedMotion}
        signals={visualSignals}
        theme={synesthesiaTheme}
      />
      {import.meta.env.DEV ? <PerformanceDiagnostics /> : null}
      <ResponsiveClickerCamera />
      <ambientLight color="#fffdf8" intensity={0.3} />
      <hemisphereLight
        args={['#fffdf8', '#061019', 0.55]}
        position={[0, 5, 3]}
      />
      <directionalLight
        castShadow
        color="#fff7e8"
        intensity={2.65}
        position={[-4.5, 6.5, 8]}
        shadow-bias={-0.00015}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      <directionalLight
        color="#bfefff"
        intensity={0.8}
        position={[5, -1, 5]}
      />
      <pointLight color="#ffd6ea" intensity={3.8} position={[0, 4, 5]} />

      <group rotation={PRESENTATION_ROTATION}>
        <mesh geometry={housingGeometry} receiveShadow>
          <meshPhysicalMaterial {...CLICKER_CLEAR_HOUSING_MATERIAL} />
        </mesh>
        <mesh geometry={plateGeometry} position={[0, 0, 0.39]} receiveShadow>
          <meshPhysicalMaterial {...CLICKER_CLEAR_INSERT_MATERIAL} />
        </mesh>
        <instancedMesh
          ref={wellMeshRef}
          args={[wellGeometry, undefined, CLICKER_KEY_COUNT]}
          frustumCulled={false}
          receiveShadow
        >
          <meshPhysicalMaterial
            {...CLICKER_CLEAR_INSERT_MATERIAL}
            opacity={0.18}
          />
        </instancedMesh>
        <instancedMesh
          ref={stemMeshRef}
          args={[stemGeometry, undefined, CLICKER_KEY_COUNT]}
          castShadow
          frustumCulled={false}
        >
          <meshPhysicalMaterial
            {...CLICKER_CLEAR_INSERT_MATERIAL}
            opacity={0.24}
            transmission={0}
          />
        </instancedMesh>
        <instancedMesh
          ref={capMeshRef}
          args={[keyGeometry, undefined, CLICKER_KEY_COUNT]}
          castShadow
          frustumCulled={false}
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          onPointerUp={handlePointerUp}
          receiveShadow
        >
          <meshPhysicalMaterial
            {...CLICKER_KEY_MATERIAL}
            color="#ffffff"
            toneMapped={false}
          />
        </instancedMesh>
        <mesh position={[0, 0, -0.45]} receiveShadow>
          <planeGeometry args={[12, 12]} />
          <shadowMaterial opacity={0.18} />
        </mesh>
      </group>
    </>
  )
}
