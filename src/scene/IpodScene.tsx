import { Environment, Lightformer, useTexture } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import * as THREE from 'three'
import greenIpodReferenceUrl from '../assets/ipod-mini-green-reference.jpg'
import { createRoundedCuboidGeometry } from './createRoundedCuboidGeometry'
import {
  createIpodScreenTexture,
  updateIpodScreenTexture,
} from './ipod/ipodTextures'
import {
  createIpodWheelRuntime,
  getClockwiseWheelDelta,
  getIpodWheelAngle,
  stepIpodWheel,
  type IpodWheelRuntime,
} from './ipod/ipodInteraction'
import {
  getResponsiveIpodCameraPose,
  IPOD_BACKGROUND_GREEN,
  IPOD_GREEN,
  IPOD_MINI_BODY,
  IPOD_MINI_SCREEN,
  IPOD_MINI_WHEEL,
} from './ipod/ipodDefinition'
import { bindPointerCancellation } from './interaction'
import { PerformanceDiagnostics } from './SquishyScene'

type IpodSceneProps = Readonly<{
  selectedMenuIndex: number
  onSelectMenuIndex: (index: number) => void
  playScrollClick: () => void
  playThock: () => void
  unlockScrollAudio: () => void
}>

type ActiveWheelGesture = {
  pointerId: number
  previousAngle: number
  startX: number
  startY: number
  totalRotation: number
  moved: boolean
}

type ActiveButtonPress = {
  pointerId: number
  startX: number
  startY: number
}

const PRESENTATION_ROTATION = [-0.025, 0.022, 0] as const

function ResponsiveIpodCamera() {
  const { camera, size } = useThree()

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return
    }
    const pose = getResponsiveIpodCameraPose(
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

export function IpodScene({
  selectedMenuIndex,
  onSelectMenuIndex,
  playScrollClick,
  playThock,
  unlockScrollAudio,
}: IpodSceneProps) {
  const canvasElement = useThree((state) => state.gl.domElement)
  const selectedIndexRef = useRef(selectedMenuIndex)
  const activeWheelRef = useRef<ActiveWheelGesture | null>(null)
  const activeCenterRef = useRef<ActiveButtonPress | null>(null)
  const wheelRuntimeRef = useRef<IpodWheelRuntime>(
    createIpodWheelRuntime(),
  )
  const bodyGeometry = useMemo(
    () =>
      createRoundedCuboidGeometry({
        ...IPOD_MINI_BODY,
        widthSegments: 10,
        heightSegments: 16,
        depthSegments: 4,
      }),
    [],
  )
  const bezelGeometry = useMemo(
    () =>
      createRoundedCuboidGeometry({
        width: IPOD_MINI_SCREEN.width + 0.04,
        height: IPOD_MINI_SCREEN.height + 0.04,
        depth: 0.075,
        radius: 0.075,
        widthSegments: 6,
        heightSegments: 6,
        depthSegments: 2,
      }),
    [],
  )
  const screenTexture = useMemo(
    () => createIpodScreenTexture(selectedMenuIndex),
    [],
  )
  const wheelReferenceTexture = useTexture(greenIpodReferenceUrl)
  const wheelTexture = useMemo(() => {
    const texture = wheelReferenceTexture.clone()
    texture.colorSpace = THREE.SRGBColorSpace
    texture.repeat.set(0.6945, 0.4031)
    texture.offset.set(0.1548, 0.1141)
    texture.needsUpdate = true
    return texture
  }, [wheelReferenceTexture])

  useEffect(() => {
    selectedIndexRef.current = selectedMenuIndex
    updateIpodScreenTexture(screenTexture, selectedMenuIndex)
  }, [screenTexture, selectedMenuIndex])

  useEffect(
    () => () => {
      bodyGeometry.dispose()
      bezelGeometry.dispose()
      screenTexture.dispose()
      wheelTexture.dispose()
    },
    [bezelGeometry, bodyGeometry, screenTexture, wheelTexture],
  )

  useEffect(() => {
    return bindPointerCancellation(canvasElement, ({ pointerId }) => {
      if (activeWheelRef.current?.pointerId === pointerId) {
        activeWheelRef.current = null
        wheelRuntimeRef.current = createIpodWheelRuntime()
      }
      if (activeCenterRef.current?.pointerId === pointerId) {
        activeCenterRef.current = null
      }
    })
  }, [canvasElement])

  const setHover = useCallback(
    (hovered: boolean) => {
      canvasElement.classList.toggle('wax-pointer-hover', hovered)
    },
    [canvasElement],
  )

  const handleWheelPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      event.nativeEvent.preventDefault()
      unlockScrollAudio()
      const pointerId = event.nativeEvent.pointerId
      const localPoint = event.object.worldToLocal(event.point.clone())
      activeWheelRef.current = {
        pointerId,
        previousAngle: getIpodWheelAngle(localPoint.x, localPoint.y),
        startX: event.clientX,
        startY: event.clientY,
        totalRotation: 0,
        moved: false,
      }
      wheelRuntimeRef.current = createIpodWheelRuntime()
      const captureTarget = event.target as EventTarget & {
        setPointerCapture?: (capturedPointerId: number) => void
      }
      try {
        captureTarget.setPointerCapture?.(pointerId)
      } catch {
        // Embedded browsers may not support pointer capture.
      }
    },
    [unlockScrollAudio],
  )

  const handleWheelPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const activeWheel = activeWheelRef.current
      if (
        !activeWheel ||
        activeWheel.pointerId !== event.nativeEvent.pointerId
      ) {
        return
      }
      event.stopPropagation()
      event.nativeEvent.preventDefault()
      const localPoint = event.object.worldToLocal(event.point.clone())
      const currentAngle = getIpodWheelAngle(localPoint.x, localPoint.y)
      const delta = getClockwiseWheelDelta(
        activeWheel.previousAngle,
        currentAngle,
      )
      activeWheel.previousAngle = currentAngle
      activeWheel.totalRotation += Math.abs(delta)
      activeWheel.moved =
        activeWheel.moved ||
        activeWheel.totalRotation > 5 ||
        Math.hypot(
          event.clientX - activeWheel.startX,
          event.clientY - activeWheel.startY,
        ) > 8

      const result = stepIpodWheel(
        wheelRuntimeRef.current,
        delta,
        selectedIndexRef.current,
      )
      wheelRuntimeRef.current = result.runtime
      if (result.selectedIndex !== selectedIndexRef.current) {
        selectedIndexRef.current = result.selectedIndex
        onSelectMenuIndex(result.selectedIndex)
        for (
          let index = 0;
          index < result.selectionChangeCount;
          index += 1
        ) {
          playScrollClick()
        }
      }
    },
    [onSelectMenuIndex, playScrollClick],
  )

  const finishWheelPress = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const activeWheel = activeWheelRef.current
      const pointerId = event.nativeEvent.pointerId
      if (!activeWheel || activeWheel.pointerId !== pointerId) {
        return
      }
      event.stopPropagation()
      if (
        !activeWheel.moved &&
        Math.hypot(
          event.clientX - activeWheel.startX,
          event.clientY - activeWheel.startY,
        ) <= 10
      ) {
        playThock()
      }
      const captureTarget = event.target as EventTarget & {
        hasPointerCapture?: (capturedPointerId: number) => boolean
        releasePointerCapture?: (capturedPointerId: number) => void
      }
      if (captureTarget.hasPointerCapture?.(pointerId)) {
        try {
          captureTarget.releasePointerCapture?.(pointerId)
        } catch {
          // Native cancellation can release capture first.
        }
      }
      activeWheelRef.current = null
      wheelRuntimeRef.current = createIpodWheelRuntime()
    },
    [playThock],
  )

  const cancelWheelPress = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (
        activeWheelRef.current?.pointerId ===
        event.nativeEvent.pointerId
      ) {
        activeWheelRef.current = null
        wheelRuntimeRef.current = createIpodWheelRuntime()
      }
    },
    [],
  )

  const handleCenterPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      event.nativeEvent.preventDefault()
      const pointerId = event.nativeEvent.pointerId
      activeCenterRef.current = {
        pointerId,
        startX: event.clientX,
        startY: event.clientY,
      }
      const captureTarget = event.target as EventTarget & {
        setPointerCapture?: (capturedPointerId: number) => void
      }
      try {
        captureTarget.setPointerCapture?.(pointerId)
      } catch {
        // Embedded browsers may not support pointer capture.
      }
    },
    [],
  )

  const finishCenterPress = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const activeCenter = activeCenterRef.current
      const pointerId = event.nativeEvent.pointerId
      if (!activeCenter || activeCenter.pointerId !== pointerId) {
        return
      }
      event.stopPropagation()
      if (
        Math.hypot(
          event.clientX - activeCenter.startX,
          event.clientY - activeCenter.startY,
        ) <= 10
      ) {
        playThock()
      }
      const captureTarget = event.target as EventTarget & {
        hasPointerCapture?: (capturedPointerId: number) => boolean
        releasePointerCapture?: (capturedPointerId: number) => void
      }
      if (captureTarget.hasPointerCapture?.(pointerId)) {
        try {
          captureTarget.releasePointerCapture?.(pointerId)
        } catch {
          // Native cancellation can release capture first.
        }
      }
      activeCenterRef.current = null
    },
    [playThock],
  )

  const cancelCenterPress = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (
        activeCenterRef.current?.pointerId ===
        event.nativeEvent.pointerId
      ) {
        activeCenterRef.current = null
      }
    },
    [],
  )

  return (
    <>
      <color attach="background" args={[IPOD_BACKGROUND_GREEN]} />
      {import.meta.env.DEV ? <PerformanceDiagnostics /> : null}
      <ResponsiveIpodCamera />
      <ambientLight color="#f7ffd9" intensity={0.42} />
      <hemisphereLight
        args={['#fffde8', '#8ea746', 0.82]}
        position={[0, 5, 3]}
      />
      <directionalLight
        color="#fffde8"
        intensity={2.4}
        position={[-4, 6, 7]}
      />
      <directionalLight
        color="#d9ffbc"
        intensity={1.15}
        position={[5, -1, 5]}
      />
      <Environment resolution={128}>
        <Lightformer
          color="#ffffff"
          intensity={3.2}
          position={[-3, 3, 4]}
          rotation={[0, 0.35, 0]}
          scale={[2.5, 5, 1]}
        />
        <Lightformer
          color="#dfff9b"
          intensity={2.2}
          position={[4, 0, 3]}
          rotation={[0, -0.65, 0]}
          scale={[2, 4, 1]}
        />
      </Environment>
      <mesh position={[0, 0, -1.05]} receiveShadow>
        <planeGeometry args={[18, 18]} />
        <meshPhysicalMaterial
          color={IPOD_BACKGROUND_GREEN}
          metalness={0.22}
          roughness={0.34}
          clearcoat={0.42}
          clearcoatRoughness={0.24}
        />
      </mesh>

      <group rotation={PRESENTATION_ROTATION}>
        <mesh geometry={bodyGeometry} receiveShadow>
          <meshPhysicalMaterial
            color={IPOD_GREEN}
            metalness={0.48}
            roughness={0.3}
            clearcoat={0.48}
            clearcoatRoughness={0.14}
            envMapIntensity={1.45}
          />
        </mesh>

        <mesh
          geometry={bezelGeometry}
          position={[0, IPOD_MINI_SCREEN.y, 0.294]}
        >
          <meshPhysicalMaterial
            color="#6c747a"
            metalness={0.4}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, IPOD_MINI_SCREEN.y, 0.338]}>
          <planeGeometry
            args={[IPOD_MINI_SCREEN.width, IPOD_MINI_SCREEN.height]}
          />
          <meshBasicMaterial map={screenTexture} toneMapped={false} />
        </mesh>
        <mesh position={[0, IPOD_MINI_SCREEN.y, 0.345]}>
          <planeGeometry
            args={[IPOD_MINI_SCREEN.width, IPOD_MINI_SCREEN.height]}
          />
          <meshPhysicalMaterial
            color="#dfe9f1"
            roughness={0.08}
            metalness={0}
            opacity={0.1}
            transparent
            depthWrite={false}
          />
        </mesh>

        <mesh
          position={[0, IPOD_MINI_WHEEL.y, 0.306]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry
            args={[IPOD_MINI_WHEEL.radius + 0.018, IPOD_MINI_WHEEL.radius + 0.018, 0.045, 96]}
          />
          <meshStandardMaterial
            color="#777b79"
            metalness={0.2}
            roughness={0.55}
          />
        </mesh>
        <mesh position={[0, IPOD_MINI_WHEEL.y, 0.337]} receiveShadow>
          <circleGeometry args={[IPOD_MINI_WHEEL.radius, 96]} />
          <meshPhysicalMaterial
            color="#f4f4f2"
            roughness={0.35}
            clearcoat={0.22}
            clearcoatRoughness={0.28}
          />
        </mesh>
        <mesh position={[0, IPOD_MINI_WHEEL.y, 0.348]}>
          <circleGeometry args={[IPOD_MINI_WHEEL.radius, 96]} />
          <meshBasicMaterial
            map={wheelTexture}
            transparent
            toneMapped={false}
          />
        </mesh>
        <mesh
          position={[0, IPOD_MINI_WHEEL.y, 0.382]}
          onPointerCancel={cancelWheelPress}
          onPointerDown={handleWheelPointerDown}
          onPointerMove={handleWheelPointerMove}
          onPointerOut={() => setHover(false)}
          onPointerOver={() => setHover(true)}
          onPointerUp={finishWheelPress}
        >
          <ringGeometry
            args={[
              IPOD_MINI_WHEEL.centerRadius + 0.008,
              IPOD_MINI_WHEEL.radius,
              96,
            ]}
          />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
        <mesh
          position={[0, IPOD_MINI_WHEEL.y, 0.384]}
          onPointerCancel={cancelCenterPress}
          onPointerDown={handleCenterPointerDown}
          onPointerOut={() => setHover(false)}
          onPointerOver={() => setHover(true)}
          onPointerUp={finishCenterPress}
        >
          <circleGeometry args={[IPOD_MINI_WHEEL.centerRadius, 64]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  )
}
