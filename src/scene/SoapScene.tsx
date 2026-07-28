import { useThree } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import * as THREE from 'three'
import {
  SOAP_DEFINITIONS,
  SOAP_WAX_PHYSICAL_PROPERTIES,
  createSoapLabelAtlasTexture,
  getSoapWaxPalette,
  mixSoapSeed,
  type SoapId,
} from './soaps'
import { SoapSquishy } from './SoapSquishy'
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

const SOAP_PRESENTATION_SCALE = [0.68, 1, 1] as const
const PORTRAIT_COLUMN_GAP = 3.08
const PORTRAIT_ROW_GAP = 2.08
const LANDSCAPE_COLUMN_GAP = 3.08
const LANDSCAPE_ROW_GAP = 2.18

const SOAP_GRID_POSITIONS = {
  portrait: Array.from({ length: 8 }, (_, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    return Object.freeze([
      (column - 0.5) * PORTRAIT_COLUMN_GAP,
      (1.5 - row) * PORTRAIT_ROW_GAP,
      0,
    ]) as readonly [number, number, number]
  }),
  landscape: Array.from({ length: 8 }, (_, index) => {
    const column = index % 4
    const row = Math.floor(index / 4)
    return Object.freeze([
      (column - 1.5) * LANDSCAPE_COLUMN_GAP,
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
      : PORTRAIT_ROW_GAP * 1.5 + 1.14
  const halfWidth =
    layout === 'landscape'
      ? LANDSCAPE_COLUMN_GAP * 1.5 + 1.62
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
}

function SoapPreview({
  definition,
  position,
}: {
  definition: (typeof SOAP_DEFINITIONS)[number]
  position: readonly [number, number, number]
}) {
  const size = definition.geometry.size
  const waxPalette = getSoapWaxPalette(
    definition.style.bodyColor,
  )
  return (
    <group position={position} scale={SOAP_PRESENTATION_SCALE}>
      <mesh>
        <boxGeometry
          args={[size[0], size[1], size[2], 3, 3, 3]}
        />
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
  playCrackSound,
  reducedMotion,
  unlockCrackAudio,
}: SoapFieldProps) {
  const labelTexture = useMemo(createSoapLabelAtlasTexture, [])
  const [readyCount, setReadyCount] = useState(0)

  useEffect(() => () => labelTexture.dispose(), [labelTexture])
  useEffect(() => {
    if (readyCount >= SOAP_DEFINITIONS.length) {
      return
    }
    const timeout = window.setTimeout(
      () => setReadyCount((current) => current + 1),
      readyCount === 0 ? 80 : 180,
    )
    return () => window.clearTimeout(timeout)
  }, [readyCount])

  return (
    <group>
      {SOAP_DEFINITIONS.map((definition, index) =>
        index < readyCount ? (
          <SoapSquishy
            key={`${definition.id}:${coatingSeed}`}
            coatingSeed={mixSoapSeed(coatingSeed, definition)}
            definition={definition}
            introDelay={index * 0.045}
            labelTexture={labelTexture}
            onComplete={onComplete}
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
        playCrackSound={playCrackSound}
        reducedMotion={reducedMotion}
        unlockCrackAudio={unlockCrackAudio}
      />
    </>
  )
}
