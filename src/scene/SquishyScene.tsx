import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { ButterSquishy } from './ButterSquishy'
import {
  BUTTER_SIZE,
  GROUND_Y,
  SHELL_OFFSET,
} from './constants'

export const SCENE_BACKGROUND = '#000000'

type SquishyDiagnostics = {
  frameCount: number
  sampleCount: number
  writeIndex: number
  frameTimes: Float32Array
  drawCalls: number
  triangles: number
}

declare global {
  interface Window {
    __squishyDiagnostics?: SquishyDiagnostics
  }
}

function PerformanceDiagnostics() {
  const { gl } = useThree()
  const diagnosticsRef = useRef<SquishyDiagnostics>({
    frameCount: 0,
    sampleCount: 0,
    writeIndex: 0,
    frameTimes: new Float32Array(300),
    drawCalls: 0,
    triangles: 0,
  })

  useEffect(() => {
    const diagnostics = diagnosticsRef.current
    window.__squishyDiagnostics = diagnostics
    return () => {
      if (window.__squishyDiagnostics === diagnostics) {
        delete window.__squishyDiagnostics
      }
    }
  }, [])

  useFrame((_, delta) => {
    const diagnostics = diagnosticsRef.current
    diagnostics.frameTimes[diagnostics.writeIndex] = delta * 1000
    diagnostics.writeIndex =
      (diagnostics.writeIndex + 1) % diagnostics.frameTimes.length
    diagnostics.sampleCount = Math.min(
      diagnostics.sampleCount + 1,
      diagnostics.frameTimes.length,
    )
    diagnostics.frameCount += 1
    diagnostics.drawCalls = gl.info.render.calls
    diagnostics.triangles = gl.info.render.triangles
    if (diagnostics.frameCount % 60 === 0) {
      gl.domElement.dataset.squishyDiagnostics = JSON.stringify({
        frameTimes: Array.from(diagnostics.frameTimes).filter(
          (frameTime) => frameTime > 0,
        ),
        drawCalls: diagnostics.drawCalls,
        triangles: diagnostics.triangles,
      })
    }
  })

  return null
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return reducedMotion
}

export function getResponsiveCameraPose(
  width: number,
  height: number,
  fieldOfViewDegrees = 32,
) {
  const verticalFov = THREE.MathUtils.degToRad(fieldOfViewDegrees)
  const aspect = Math.max(0.25, width / Math.max(1, height))
  const paddedWidth = (BUTTER_SIZE.width + SHELL_OFFSET * 2) * 1.16
  const paddedHeight = (BUTTER_SIZE.height + SHELL_OFFSET * 2) * 1.32
  const fitWidth = paddedWidth / 2 / (Math.tan(verticalFov / 2) * aspect)
  const fitHeight = paddedHeight / 2 / Math.tan(verticalFov / 2)
  const distance =
    Math.max(fitWidth, fitHeight) +
    (BUTTER_SIZE.depth + SHELL_OFFSET * 2) * 0.45

  return {
    position: [0, 0, distance] as const,
    target: [0, 0, 0] as const,
  }
}

function ResponsiveCamera() {
  const { camera, size } = useThree()

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return
    }

    const pose = getResponsiveCameraPose(
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

type SquishySceneProps = {
  coatingSeed: number
  onComplete: () => void
  playCrackSound: (brokenBondCount: number) => void
  resetKey: number
  unlockCrackAudio: () => void
}

export function SquishyScene({
  coatingSeed,
  onComplete,
  playCrackSound,
  resetKey,
  unlockCrackAudio,
}: SquishySceneProps) {
  const reducedMotion = useReducedMotion()

  return (
    <>
      <color attach="background" args={[SCENE_BACKGROUND]} />
      {import.meta.env.DEV ? <PerformanceDiagnostics /> : null}
      <ResponsiveCamera />
      <ambientLight color="#ffffff" intensity={0.35} />
      <hemisphereLight
        args={['#ffffff', '#050505', 0.55]}
        position={[0, 4, 0]}
      />
      <directionalLight
        castShadow
        color="#ffffff"
        intensity={2.2}
        position={[-3.5, 5.5, 4.5]}
        shadow-bias={-0.00015}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      <directionalLight
        color="#ffffff"
        intensity={0.9}
        position={[4, 2, -3]}
      />
      <ButterSquishy
        key={resetKey}
        coatingSeed={coatingSeed}
        onComplete={onComplete}
        playCrackSound={playCrackSound}
        reducedMotion={reducedMotion}
        unlockCrackAudio={unlockCrackAudio}
      />
      <mesh
        position={[0, GROUND_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
    </>
  )
}
