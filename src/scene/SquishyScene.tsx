import { useFrame, useThree } from '@react-three/fiber'
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import {
  ButterSquishy,
  createButterStaticColliders,
} from './ButterSquishy'
import {
  BUTTER_DEBRIS_BODY_LIMIT,
  BUTTER_DEFINITIONS,
  BUTTER_STACK_GROUND_Y,
  BUTTER_STACK_HEIGHT,
  BUTTER_STACK_POSITIONS,
  BUTTER_SYNESTHESIA_PALETTE,
  mixButterSeed,
} from './butters'
import {
  BUTTER_SIZE,
  SHELL_OFFSET,
} from './constants'
import { createButterLabelTexture } from './createButterLabelTexture'
import { usePhysicsDebrisSources } from './fracture/usePhysicsDebrisSources'
import {
  createSquishyVisualSignalSources,
  createSynesthesiaThemeFromPalette,
  SynesthesiaBackground,
} from './synesthesia'

export const SCENE_BACKGROUND = '#000000'

const LazyRapierDebris = lazy(() => import('./fracture/RapierDebris'))
const BUTTER_SOURCE_IDS = Object.freeze(
  BUTTER_DEFINITIONS.map(({ id }) => id),
)

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

export function PerformanceDiagnostics() {
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

export function useReducedMotion() {
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
  const paddedHeight = BUTTER_STACK_HEIGHT * 1.12
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
  const labelTexture = useMemo(createButterLabelTexture, [])
  const physicsDebris = usePhysicsDebrisSources(BUTTER_SOURCE_IDS)
  const visualSignals = useMemo(
    () =>
      createSquishyVisualSignalSources(
        BUTTER_DEFINITIONS.length,
      ),
    [coatingSeed],
  )
  const synesthesiaTheme = useMemo(
    () =>
      createSynesthesiaThemeFromPalette(
        BUTTER_SYNESTHESIA_PALETTE,
        {
          shadowColor: '#170f08',
          seed: coatingSeed ^ 0xb077e2a1,
          idleSpeed: 0.12,
          maximumMotifs: 6,
        },
      ),
    [coatingSeed],
  )
  const staticColliders = useMemo(
    () =>
      createButterStaticColliders(
        BUTTER_STACK_POSITIONS,
        BUTTER_STACK_GROUND_Y,
      ),
    [],
  )
  useEffect(() => () => labelTexture.dispose(), [labelTexture])

  return (
    <>
      <color
        attach="background"
        args={[synesthesiaTheme.shadowColor]}
      />
      <SynesthesiaBackground
        reducedMotion={reducedMotion}
        signals={visualSignals}
        theme={synesthesiaTheme}
      />
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
      {BUTTER_DEFINITIONS.map((definition, index) => (
        <ButterSquishy
          key={`${resetKey}:${definition.id}`}
          bodyColor={definition.bodyColor}
          coatingSeed={mixButterSeed(coatingSeed, definition)}
          instanceId={definition.id}
          labelTexture={labelTexture}
          onComplete={onComplete}
          onPhysicsDebrisChange={physicsDebris.registerSource}
          playCrackSound={playCrackSound}
          position={definition.position}
          reducedMotion={reducedMotion}
          unlockCrackAudio={unlockCrackAudio}
          visualSignals={visualSignals[index]}
          waxPalette={definition.wax}
        />
      ))}
      {physicsDebris.clusters.length > 0 ? (
        <Suspense fallback={null}>
          <LazyRapierDebris
            generation={coatingSeed}
            clusters={physicsDebris.clusters}
            maxActiveBodies={BUTTER_DEBRIS_BODY_LIMIT}
            staticColliders={staticColliders}
            onTransform={physicsDebris.handleTransform}
            onSettled={physicsDebris.handleSettled}
          />
        </Suspense>
      ) : null}
    </>
  )
}
