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
import {
  CLICKER_BACKPLATE,
  CLICKER_CLEAR_HOUSING_MATERIAL,
  CLICKER_CLEAR_INSERT_MATERIAL,
  CLICKER_KEY_COUNT,
  CLICKER_KEY_FACE,
  CLICKER_KEY_FACE_MATERIAL,
  CLICKER_KEYS,
  CLICKER_KEY_SHELL,
  CLICKER_KEY_SHELL_MATERIAL,
  CLICKER_KEY_TRAVEL,
  CLICKER_SOCKET,
  createClickerHousingGeometry,
  createRoundedFrameGeometry,
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

const STEM_REST_Z = 0.57
const PRESENTATION_ROTATION = [-0.035, 0.012, 0] as const

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
  const shellMeshRef = useRef<THREE.InstancedMesh>(null)
  const faceMeshRef = useRef<THREE.InstancedMesh>(null)
  const socketMeshRef = useRef<THREE.InstancedMesh>(null)
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
    () => createClickerHousingGeometry(),
    [],
  )
  const backplateGeometry = useMemo(
    () =>
      createRoundedCuboidGeometry({
        width: CLICKER_BACKPLATE.width,
        height: CLICKER_BACKPLATE.height,
        depth: CLICKER_BACKPLATE.depth,
        radius: CLICKER_BACKPLATE.radius,
        widthSegments: 6,
        heightSegments: 6,
        depthSegments: 1,
      }),
    [],
  )
  const keyShellGeometry = useMemo(
    () =>
      createRoundedCuboidGeometry({
        width: CLICKER_KEY_SHELL.size,
        height: CLICKER_KEY_SHELL.size,
        depth: CLICKER_KEY_SHELL.depth,
        radius: CLICKER_KEY_SHELL.radius,
        widthSegments: 5,
        heightSegments: 5,
        depthSegments: 2,
      }),
    [],
  )
  const keyFaceGeometry = useMemo(
    () =>
      createRoundedCuboidGeometry({
        width: CLICKER_KEY_FACE.size,
        height: CLICKER_KEY_FACE.size,
        depth: CLICKER_KEY_FACE.depth,
        radius: CLICKER_KEY_FACE.radius,
        widthSegments: 6,
        heightSegments: 6,
        depthSegments: 3,
      }),
    [],
  )
  const socketGeometry = useMemo(
    () =>
      createRoundedFrameGeometry({
        width: CLICKER_SOCKET.width,
        height: CLICKER_SOCKET.height,
        depth: CLICKER_SOCKET.depth,
        radius: CLICKER_SOCKET.radius,
        frameWidth: CLICKER_SOCKET.frameWidth,
        curveSegments: 5,
        bevelSize: 0.025,
        bevelThickness: 0.025,
        bevelSegments: 1,
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
      backplateGeometry.dispose()
      keyShellGeometry.dispose()
      keyFaceGeometry.dispose()
      socketGeometry.dispose()
      stemGeometry.dispose()
    },
    [
      backplateGeometry,
      housingGeometry,
      keyFaceGeometry,
      keyShellGeometry,
      socketGeometry,
      stemGeometry,
    ],
  )

  useEffect(() => {
    const socketMesh = socketMeshRef.current
    if (!socketMesh) {
      return
    }
    const dummy = dummyRef.current
    for (let index = 0; index < CLICKER_KEY_COUNT; index += 1) {
      const [x, y] = getClickerKeyPosition(index)
      dummy.position.set(x, y, CLICKER_SOCKET.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      socketMesh.setMatrixAt(index, dummy.matrix)
    }
    socketMesh.instanceMatrix.needsUpdate = true
  }, [])

  useLayoutEffect(() => {
    const shellMesh = shellMeshRef.current
    const faceMesh = faceMeshRef.current
    if (!shellMesh || !faceMesh) {
      return
    }
    const color = new THREE.Color()
    for (let index = 0; index < CLICKER_KEY_COUNT; index += 1) {
      color.set(CLICKER_KEYS[index].color)
      shellMesh.setColorAt(index, color)
      faceMesh.setColorAt(index, color)
    }
    if (shellMesh.instanceColor) {
      shellMesh.instanceColor.needsUpdate = true
    }
    if (faceMesh.instanceColor) {
      faceMesh.instanceColor.needsUpdate = true
    }
    for (const mesh of [shellMesh, faceMesh]) {
      const material = mesh.material
      if (!Array.isArray(material)) {
        material.needsUpdate = true
      }
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

    const shellMesh = shellMeshRef.current
    const faceMesh = faceMeshRef.current
    for (let keyIndex = 0; keyIndex < CLICKER_KEY_COUNT; keyIndex += 1) {
      const [x, y] = getClickerKeyPosition(keyIndex)
      const press = runtime.springs[keyIndex].value
      const travel = press * CLICKER_KEY_TRAVEL
      visualSignals[keyIndex].pressStrength = press

      if (shellMesh) {
        dummy.position.set(x, y, CLICKER_KEY_SHELL.restZ - travel)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        shellMesh.setMatrixAt(keyIndex, dummy.matrix)
      }

      if (faceMesh) {
        dummy.position.set(x, y, CLICKER_KEY_FACE.restZ - travel)
        dummy.updateMatrix()
        faceMesh.setMatrixAt(keyIndex, dummy.matrix)
      }

      if (stemMesh) {
        dummy.position.set(x, y, STEM_REST_Z - travel)
        dummy.updateMatrix()
        stemMesh.setMatrixAt(keyIndex, dummy.matrix)
      }
    }
    if (shellMesh) {
      shellMesh.instanceMatrix.needsUpdate = true
    }
    if (faceMesh) {
      faceMesh.instanceMatrix.needsUpdate = true
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
        color="#fff7e8"
        intensity={2.65}
        position={[-4.5, 6.5, 8]}
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
        <mesh
          geometry={backplateGeometry}
          position={[0, 0, CLICKER_BACKPLATE.z]}
          receiveShadow
          renderOrder={-2}
        >
          <meshPhysicalMaterial
            {...CLICKER_CLEAR_INSERT_MATERIAL}
            opacity={0.13}
          />
        </mesh>
        <instancedMesh
          ref={socketMeshRef}
          args={[socketGeometry, undefined, CLICKER_KEY_COUNT]}
          frustumCulled={false}
          receiveShadow
          renderOrder={1}
        >
          <meshPhysicalMaterial
            {...CLICKER_CLEAR_INSERT_MATERIAL}
            opacity={0.38}
          />
        </instancedMesh>
        <instancedMesh
          ref={stemMeshRef}
          args={[stemGeometry, undefined, CLICKER_KEY_COUNT]}
          frustumCulled={false}
        >
          <meshPhysicalMaterial
            {...CLICKER_CLEAR_INSERT_MATERIAL}
            opacity={0.24}
            transmission={0}
          />
        </instancedMesh>
        <instancedMesh
          ref={shellMeshRef}
          args={[keyShellGeometry, undefined, CLICKER_KEY_COUNT]}
          frustumCulled={false}
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          onPointerUp={handlePointerUp}
          receiveShadow
          renderOrder={2}
        >
          <meshPhysicalMaterial
            {...CLICKER_KEY_SHELL_MATERIAL}
            color="#ffffff"
            toneMapped={false}
          />
        </instancedMesh>
        <instancedMesh
          ref={faceMeshRef}
          args={[keyFaceGeometry, undefined, CLICKER_KEY_COUNT]}
          frustumCulled={false}
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerOut={handlePointerOut}
          onPointerOver={handlePointerOver}
          onPointerUp={handlePointerUp}
          receiveShadow
          renderOrder={3}
        >
          <meshPhysicalMaterial
            {...CLICKER_KEY_FACE_MATERIAL}
            color="#ffffff"
            toneMapped={false}
          />
        </instancedMesh>
      </group>
    </>
  )
}
