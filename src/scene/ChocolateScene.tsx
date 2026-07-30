import { useThree } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import {
  CHOCOLATE_DEBRIS_BODY_LIMIT,
  CHOCOLATE_DEBRIS_FLOOR_Y,
  CHOCOLATE_DEFINITION,
  CHOCOLATE_ID,
  CHOCOLATE_RUNTIME_CONFIG,
  CHOCOLATE_SYNESTHESIA_THEME,
} from './chocolate'
import type { DebrisStaticCollider } from './fracture/RapierDebris'
import { usePhysicsDebrisSources } from './fracture/usePhysicsDebrisSources'
import { SoapSquishy } from './SoapSquishy'
import {
  PerformanceDiagnostics,
  useReducedMotion,
} from './SquishyScene'
import {
  createSquishyVisualSignals,
  SynesthesiaBackground,
} from './synesthesia'

type ChocolateSceneProps = Readonly<{
  coatingSeed: number
  onComplete: () => void
  playCrackSound: (brokenBondCount: number) => void
  unlockCrackAudio: () => void
}>

const LazyRapierDebris = lazy(() => import('./fracture/RapierDebris'))
const CHOCOLATE_SOURCE_IDS = [CHOCOLATE_ID] as const

export function getResponsiveChocolateCameraPose(
  width: number,
  height: number,
  fieldOfViewDegrees = 32,
) {
  const aspect = Math.max(0.25, width / Math.max(1, height))
  const verticalFov = THREE.MathUtils.degToRad(fieldOfViewDegrees)
  const halfHeight = 2.42
  const halfWidth = 4.05
  const fitWidth =
    halfWidth / (Math.tan(verticalFov / 2) * aspect)
  const fitHeight = halfHeight / Math.tan(verticalFov / 2)
  const distance = Math.max(fitWidth, fitHeight) + 0.48

  return {
    position: [0, 0.12, distance] as const,
    target: [0, 0.12, 0] as const,
  }
}

export function createChocolateStaticColliders(): readonly DebrisStaticCollider[] {
  return [
    {
      id: 'chocolate-body',
      kind: 'round-cuboid',
      halfExtents: [2.92, 1.58, 0.24],
      borderRadius: 0.24,
      position: [0, 0, 0],
      friction: 0.82,
      restitution: 0.02,
    },
    {
      id: 'chocolate-debris-floor',
      kind: 'cuboid',
      halfExtents: [20, 0.05, 20],
      position: [0, CHOCOLATE_DEBRIS_FLOOR_Y - 0.05, 0],
      friction: 0.94,
      restitution: 0.01,
    },
  ]
}

function ResponsiveChocolateCamera() {
  const { camera, size } = useThree()

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return
    }
    const pose = getResponsiveChocolateCameraPose(
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

export function ChocolateScene({
  coatingSeed,
  onComplete,
  playCrackSound,
  unlockCrackAudio,
}: ChocolateSceneProps) {
  const reducedMotion = useReducedMotion()
  const physicsDebris = usePhysicsDebrisSources<string>(
    CHOCOLATE_SOURCE_IDS,
  )
  const staticColliders = useMemo(
    createChocolateStaticColliders,
    [],
  )
  const visualSignals = useMemo(
    createSquishyVisualSignals,
    [],
  )

  return (
    <>
      <color
        attach="background"
        args={[CHOCOLATE_SYNESTHESIA_THEME.shadowColor]}
      />
      <SynesthesiaBackground
        reducedMotion={reducedMotion}
        signals={visualSignals}
        theme={CHOCOLATE_SYNESTHESIA_THEME}
      />
      {import.meta.env.DEV ? <PerformanceDiagnostics /> : null}
      <ResponsiveChocolateCamera />
      <ambientLight color="#fffaf3" intensity={0.34} />
      <hemisphereLight
        args={['#fff8ee', '#040403', 0.55]}
        position={[0, 5, 2]}
      />
      <directionalLight
        color="#fff7eb"
        intensity={2.5}
        position={[-4, 6, 8]}
      />
      <directionalLight
        color="#d9f7c2"
        intensity={0.62}
        position={[5, -1, 4]}
      />
      <directionalLight
        color="#ffffff"
        intensity={0.72}
        position={[1, 3, -5]}
      />
      <SoapSquishy
        coatingSeed={coatingSeed ^ CHOCOLATE_DEFINITION.seedSalt}
        definition={CHOCOLATE_DEFINITION}
        onComplete={onComplete}
        onPhysicsDebrisChange={physicsDebris.registerSource}
        playCrackSound={playCrackSound}
        position={[0, 0, 0]}
        reducedMotion={reducedMotion}
        runtimeConfig={CHOCOLATE_RUNTIME_CONFIG}
        unlockCrackAudio={unlockCrackAudio}
        visualSignals={visualSignals}
      />
      {physicsDebris.clusters.length > 0 ? (
        <Suspense fallback={null}>
          <LazyRapierDebris
            clusters={physicsDebris.clusters}
            generation={coatingSeed}
            maxActiveBodies={CHOCOLATE_DEBRIS_BODY_LIMIT}
            onSettled={physicsDebris.handleSettled}
            onTransform={physicsDebris.handleTransform}
            staticColliders={staticColliders}
          />
        </Suspense>
      ) : null}
    </>
  )
}
