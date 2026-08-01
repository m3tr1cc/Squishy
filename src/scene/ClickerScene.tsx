import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  CLICKER_HOUSING,
  CLICKER_KEY_COUNT,
  CLICKER_KEY_DEPTH,
  CLICKER_KEY_ROWS,
  CLICKER_KEY_SIZE,
  CLICKER_KEY_TRAVEL,
  CLICKER_SYNESTHESIA_THEME,
  createClickerKeyRuntime,
  getClickerKeyIndex,
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
const PRESENTATION_ROTATION = [-0.16, 0.045, 0] as const

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
  const capMeshesRef = useRef<Array<THREE.InstancedMesh | null>>([])
  const wellMeshRef = useRef<THREE.InstancedMesh>(null)
  const stemMeshRef = useRef<THREE.InstancedMesh>(null)
  const dummyRef = useRef(new THREE.Object3D())
  const visualSignals = useMemo(
    () => createSquishyVisualSignalSources(CLICKER_KEY_COUNT),
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
      createRoundedCuboidGeometry({
        width: 4.85,
        height: 4.85,
        depth: 0.22,
        radius: 0.25,
        widthSegments: 6,
        heightSegments: 6,
        depthSegments: 2,
      }),
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
    (event: ThreeEvent<PointerEvent>, rowIndex: number) => {
      const columnIndex = event.instanceId
      if (columnIndex === undefined) {
        return
      }
      const keyIndex = getClickerKeyIndex(rowIndex, columnIndex)
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

    for (let rowIndex = 0; rowIndex < CLICKER_KEY_ROWS.length; rowIndex += 1) {
      const capMesh = capMeshesRef.current[rowIndex]
      if (!capMesh) {
        continue
      }
      for (let columnIndex = 0; columnIndex < 3; columnIndex += 1) {
        const keyIndex = getClickerKeyIndex(rowIndex, columnIndex)
        const [x, y] = getClickerKeyPosition(keyIndex)
        const press = runtime.springs[keyIndex].value
        const travel = press * CLICKER_KEY_TRAVEL
        visualSignals[keyIndex].pressStrength = press

        dummy.position.set(x, y, KEY_REST_Z - travel)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        capMesh.setMatrixAt(columnIndex, dummy.matrix)

        if (stemMesh) {
          dummy.position.set(x, y, STEM_REST_Z - travel)
          dummy.updateMatrix()
          stemMesh.setMatrixAt(keyIndex, dummy.matrix)
        }
      }
      capMesh.instanceMatrix.needsUpdate = true
    }
    if (stemMesh) {
      stemMesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <color attach="background" args={[CLICKER_SYNESTHESIA_THEME.shadowColor]} />
      <SynesthesiaBackground
        reducedMotion={reducedMotion}
        signals={visualSignals}
        theme={CLICKER_SYNESTHESIA_THEME}
      />
      {import.meta.env.DEV ? <PerformanceDiagnostics /> : null}
      <ResponsiveClickerCamera />
      <ambientLight color="#fffdf8" intensity={0.52} />
      <hemisphereLight
        args={['#fffdf8', '#061019', 0.86]}
        position={[0, 5, 3]}
      />
      <directionalLight
        castShadow
        color="#fff7e8"
        intensity={3.4}
        position={[-4.5, 6.5, 8]}
        shadow-bias={-0.00015}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      <directionalLight
        color="#bfefff"
        intensity={1.05}
        position={[5, -1, 5]}
      />
      <pointLight color="#ffd6ea" intensity={7} position={[0, 4, 5]} />

      <group rotation={PRESENTATION_ROTATION}>
        <mesh castShadow geometry={housingGeometry} receiveShadow>
          <meshPhysicalMaterial
            clearcoat={1}
            clearcoatRoughness={0.11}
            color="#fbf8f1"
            metalness={0.02}
            roughness={0.2}
          />
        </mesh>
        <mesh geometry={plateGeometry} position={[0, 0, 0.39]} receiveShadow>
          <meshPhysicalMaterial
            clearcoat={0.75}
            clearcoatRoughness={0.18}
            color="#eeeae2"
            roughness={0.3}
          />
        </mesh>
        <instancedMesh
          ref={wellMeshRef}
          args={[wellGeometry, undefined, CLICKER_KEY_COUNT]}
          frustumCulled={false}
          receiveShadow
        >
          <meshStandardMaterial color="#bdbab4" roughness={0.45} />
        </instancedMesh>
        <instancedMesh
          ref={stemMeshRef}
          args={[stemGeometry, undefined, CLICKER_KEY_COUNT]}
          castShadow
          frustumCulled={false}
        >
          <meshStandardMaterial color="#dedbd4" roughness={0.32} />
        </instancedMesh>
        {CLICKER_KEY_ROWS.map((row, rowIndex) => (
          <instancedMesh
            key={row.id}
            ref={(mesh) => {
              capMeshesRef.current[rowIndex] = mesh
            }}
            args={[keyGeometry, undefined, 3]}
            castShadow
            frustumCulled={false}
            onPointerCancel={handlePointerUp}
            onPointerDown={(event) => handlePointerDown(event, rowIndex)}
            onPointerMove={handlePointerMove}
            onPointerOut={handlePointerOut}
            onPointerOver={handlePointerOver}
            onPointerUp={handlePointerUp}
            receiveShadow
          >
            <meshPhysicalMaterial
              clearcoat={1}
              clearcoatRoughness={0.055}
              color={row.color}
              metalness={0}
              roughness={0.16}
              sheen={0.18}
              sheenColor="#ffffff"
              specularIntensity={1}
              transmission={0.025}
            />
          </instancedMesh>
        ))}
        <mesh position={[0, 0, -0.45]} receiveShadow>
          <planeGeometry args={[12, 12]} />
          <shadowMaterial opacity={0.3} />
        </mesh>
      </group>
    </>
  )
}
