import { useThree } from '@react-three/fiber'
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react'
import * as THREE from 'three'
import type { DebrisStaticCollider } from './fracture/RapierDebris'
import { usePhysicsDebrisSources } from './fracture/usePhysicsDebrisSources'
import {
  SOAP_DEBRIS_BODY_LIMIT,
  SOAP_DEBRIS_FLOOR_CLEARANCE,
  SOAP_DEFINITIONS,
  SOAP_WAX_PHYSICAL_PROPERTIES,
  createSoapLabelAtlasTexture,
  createSoapLabelAtlasTextureAsync,
  getSoapWaxPalette,
  mixSoapSeed,
  type SoapId,
} from './soaps'
import {
  SOAP_OUTER_OFFSET,
  SoapSquishy,
} from './SoapSquishy'
import {
  PerformanceDiagnostics,
  SCENE_BACKGROUND,
  useReducedMotion,
} from './SquishyScene'

type SoapLayout = 'portrait' | 'landscape'

type SoapSceneProps = Readonly<{
  coatingSeed: number
  onComplete: (soapId: SoapId) => void
  playCrackSound: (brokenBondCount: number) => void
  unlockCrackAudio: () => void
}>

const LazyRapierDebris = lazy(() => import('./fracture/RapierDebris'))

export const SOAP_PRESENTATION_SCALE = [0.68, 1, 1] as const
const PORTRAIT_COLUMN_GAP = 3.15
const PORTRAIT_ROW_GAP = 2.22
const LANDSCAPE_COLUMN_GAP = 3.15
const LANDSCAPE_ROW_GAP = 2.22
const SOAP_SOURCE_IDS = SOAP_DEFINITIONS.map(
  (definition) => definition.id,
)

const SOAP_GRID_POSITIONS = {
  portrait: Array.from({ length: 6 }, (_, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    return Object.freeze([
      (column - 0.5) * PORTRAIT_COLUMN_GAP,
      (1 - row) * PORTRAIT_ROW_GAP,
      0,
    ]) as readonly [number, number, number]
  }),
  landscape: Array.from({ length: 6 }, (_, index) => {
    const column = index % 3
    const row = Math.floor(index / 3)
    return Object.freeze([
      (column - 1) * LANDSCAPE_COLUMN_GAP,
      (0.5 - row) * LANDSCAPE_ROW_GAP,
      0,
    ]) as readonly [number, number, number]
  }),
} as const

export function resolveSoapLayout(width: number, height: number): SoapLayout {
  return width >= height ? 'landscape' : 'portrait'
}

export function getSoapGridPosition(
  index: number,
  layout: SoapLayout,
): readonly [number, number, number] {
  const position = SOAP_GRID_POSITIONS[layout][index]
  if (!position) {
    throw new Error(`Soap grid index ${index} is out of bounds.`)
  }
  return position
}

export function getResponsiveSoapCameraPose(
  width: number,
  height: number,
  fieldOfViewDegrees = 32,
) {
  const layout = resolveSoapLayout(width, height)
  const aspect = Math.max(0.25, width / Math.max(1, height))
  const verticalFov = THREE.MathUtils.degToRad(fieldOfViewDegrees)
  const halfHeight =
    layout === 'landscape'
      ? LANDSCAPE_ROW_GAP * 0.5 + 1.18
      : PORTRAIT_ROW_GAP + 1.14
  const halfWidth =
    layout === 'landscape'
      ? LANDSCAPE_COLUMN_GAP + 1.62
      : PORTRAIT_COLUMN_GAP * 0.5 + 1.62
  const fitWidth =
    halfWidth / (Math.tan(verticalFov / 2) * aspect)
  const fitHeight = halfHeight / Math.tan(verticalFov / 2)
  const distance = Math.max(fitWidth, fitHeight) + 0.72

  return {
    layout,
    position: [0, 0, distance] as const,
    target: [0, 0, 0] as const,
  }
}

export function getSoapDebrisFloorY(layout: SoapLayout) {
  let lowestSurfaceY = Number.POSITIVE_INFINITY
  for (let index = 0; index < SOAP_DEFINITIONS.length; index += 1) {
    const definition = SOAP_DEFINITIONS[index]
    const position = getSoapGridPosition(index, layout)
    const halfHeight =
      definition.geometry.size[1] *
        SOAP_PRESENTATION_SCALE[1] *
        0.5 +
      SOAP_OUTER_OFFSET
    lowestSurfaceY = Math.min(
      lowestSurfaceY,
      position[1] - halfHeight,
    )
  }
  return lowestSurfaceY - SOAP_DEBRIS_FLOOR_CLEARANCE
}

export function createSoapStaticColliders(
  layout: SoapLayout,
): readonly DebrisStaticCollider[] {
  const colliders: DebrisStaticCollider[] = SOAP_DEFINITIONS.flatMap(
    (definition, index) => {
      const [width, height, depth] = definition.geometry.size
      const position = getSoapGridPosition(index, layout)
      const scaledWidth = width * SOAP_PRESENTATION_SCALE[0]
      const scaledHeight = height * SOAP_PRESENTATION_SCALE[1]
      const scaledDepth = depth * SOAP_PRESENTATION_SCALE[2]
      const lobeOffset = scaledWidth * 0.22
      const borderRadius = Math.min(
        scaledHeight * 0.15,
        scaledDepth * 0.2,
      )
      const halfExtents = [
        Math.max(
          0.02,
          scaledWidth * 0.5 - lobeOffset - borderRadius,
        ),
        Math.max(0.02, scaledHeight * 0.44 - borderRadius),
        Math.max(0.02, scaledDepth * 0.47 - borderRadius),
      ] as const

      return ([-1, 1] as const).map((side) => ({
        id: `soap-body-${definition.id}-${side < 0 ? 'left' : 'right'}`,
        kind: 'round-cuboid' as const,
        halfExtents,
        borderRadius,
        position: [
          position[0] + side * lobeOffset,
          position[1],
          position[2],
        ] as const,
        friction: 0.88,
        restitution: 0.015,
      }))
    },
  )
  const floorY = getSoapDebrisFloorY(layout)
  colliders.push({
    id: 'soap-debris-floor',
    kind: 'cuboid',
    halfExtents: [20, 0.05, 20],
    position: [0, floorY - 0.05, 0],
    friction: 0.94,
    restitution: 0.01,
  })
  return colliders
}

function ResponsiveSoapCamera() {
  const { camera, size } = useThree()

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return
    }
    const pose = getResponsiveSoapCameraPose(
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

type SoapFieldProps = Pick<
  SoapSceneProps,
  | 'coatingSeed'
  | 'onComplete'
  | 'playCrackSound'
  | 'unlockCrackAudio'
> & {
  reducedMotion: boolean
  layout: SoapLayout
  onPhysicsDebrisChange: Parameters<
    typeof SoapSquishy
  >[0]['onPhysicsDebrisChange']
}

function SoapPreview({
  definition,
  position,
}: {
  definition: (typeof SOAP_DEFINITIONS)[number]
  position: readonly [number, number, number]
}) {
  const geometry = useMemo(
    () => definition.geometry.createSourceGeometry(),
    [definition],
  )
  const waxPalette = getSoapWaxPalette(
    definition.style.bodyColor,
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <group position={position} scale={SOAP_PRESENTATION_SCALE}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          {...SOAP_WAX_PHYSICAL_PROPERTIES}
          attenuationColor={waxPalette.attenuationColor}
          color={waxPalette.surfaceColor}
        />
      </mesh>
    </group>
  )
}

function SoapField({
  coatingSeed,
  layout,
  onComplete,
  onPhysicsDebrisChange,
  playCrackSound,
  reducedMotion,
  unlockCrackAudio,
}: SoapFieldProps) {
  const [labelTexture, setLabelTexture] =
    useState<THREE.CanvasTexture | null>(null)
  const [readyCount, setReadyCount] = useState(0)

  useEffect(() => {
    let active = true
    void createSoapLabelAtlasTextureAsync()
      .catch(() => createSoapLabelAtlasTexture())
      .then((texture) => {
        if (active) {
          setLabelTexture(texture)
        } else {
          texture.dispose()
        }
      })
    return () => {
      active = false
    }
  }, [])
  useEffect(
    () => () => labelTexture?.dispose(),
    [labelTexture],
  )
  useEffect(() => {
    if (
      !labelTexture ||
      readyCount >= SOAP_DEFINITIONS.length
    ) {
      return
    }
    const timeout = window.setTimeout(
      () => setReadyCount((current) => current + 1),
      readyCount === 0 ? 80 : 180,
    )
    return () => window.clearTimeout(timeout)
  }, [labelTexture, readyCount])

  return (
    <group>
      {SOAP_DEFINITIONS.map((definition, index) =>
        index < readyCount && labelTexture ? (
          <SoapSquishy
            key={`${definition.id}:${coatingSeed}`}
            coatingSeed={mixSoapSeed(coatingSeed, definition)}
            definition={definition}
            introDelay={index * 0.045}
            labelTexture={labelTexture}
            onComplete={onComplete}
            onPhysicsDebrisChange={onPhysicsDebrisChange}
            playCrackSound={playCrackSound}
            position={getSoapGridPosition(index, layout)}
            reducedMotion={reducedMotion}
            scale={SOAP_PRESENTATION_SCALE}
            unlockCrackAudio={unlockCrackAudio}
          />
        ) : (
          <SoapPreview
            key={`${definition.id}:preview`}
            definition={definition}
            position={getSoapGridPosition(index, layout)}
          />
        ),
      )}
    </group>
  )
}

export function SoapScene({
  coatingSeed,
  onComplete,
  playCrackSound,
  unlockCrackAudio,
}: SoapSceneProps) {
  const reducedMotion = useReducedMotion()
  const size = useThree((state) => state.size)
  const layout = resolveSoapLayout(size.width, size.height)
  const physicsDebris =
    usePhysicsDebrisSources<SoapId>(SOAP_SOURCE_IDS)
  const staticColliders = useMemo(
    () => createSoapStaticColliders(layout),
    [layout],
  )

  return (
    <>
      <color attach="background" args={[SCENE_BACKGROUND]} />
      {import.meta.env.DEV ? <PerformanceDiagnostics /> : null}
      <ResponsiveSoapCamera />
      <ambientLight color="#ffffff" intensity={0.42} />
      <hemisphereLight
        args={['#ffffff', '#060606', 0.72]}
        position={[0, 5, 2]}
      />
      <directionalLight
        color="#ffffff"
        intensity={2.1}
        position={[-4, 6, 7]}
      />
      <directionalLight
        color="#d8e9ff"
        intensity={0.72}
        position={[5, 1, -3]}
      />
      <SoapField
        coatingSeed={coatingSeed}
        layout={layout}
        onComplete={onComplete}
        onPhysicsDebrisChange={physicsDebris.registerSource}
        playCrackSound={playCrackSound}
        reducedMotion={reducedMotion}
        unlockCrackAudio={unlockCrackAudio}
      />
      {physicsDebris.clusters.length > 0 ? (
        <Suspense fallback={null}>
          <LazyRapierDebris
            clusters={physicsDebris.clusters}
            generation={coatingSeed}
            maxActiveBodies={SOAP_DEBRIS_BODY_LIMIT}
            onSettled={physicsDebris.handleSettled}
            onTransform={physicsDebris.handleTransform}
            staticColliders={staticColliders}
          />
        </Suspense>
      ) : null}
    </>
  )
}
