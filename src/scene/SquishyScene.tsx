import { ContactShadows } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { ButterSquishy } from './ButterSquishy'
import {
  BUTTER_SIZE,
  GROUND_Y,
  SHELL_OFFSET,
} from './constants'

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

function ResponsiveCamera() {
  const { camera, size } = useThree()

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return
    }

    const verticalFov = THREE.MathUtils.degToRad(camera.fov)
    const aspect = Math.max(0.25, size.width / Math.max(1, size.height))
    const paddedWidth = (BUTTER_SIZE.width + SHELL_OFFSET * 2) * 1.16
    const paddedHeight = (BUTTER_SIZE.height + SHELL_OFFSET * 2) * 1.32
    const fitWidth = paddedWidth / 2 / (Math.tan(verticalFov / 2) * aspect)
    const fitHeight = paddedHeight / 2 / Math.tan(verticalFov / 2)
    const distance =
      Math.max(fitWidth, fitHeight) + (BUTTER_SIZE.depth + SHELL_OFFSET * 2) * 0.45
    const elevation = Math.min(1.45, distance * 0.19)

    camera.position.set(0, elevation, distance)
    camera.lookAt(0, -0.02, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.height, size.width])

  return null
}

type SquishySceneProps = {
  onComplete: () => void
  resetKey: number
}

export function SquishyScene({
  onComplete,
  resetKey,
}: SquishySceneProps) {
  const reducedMotion = useReducedMotion()

  return (
    <>
      <ResponsiveCamera />
      <ambientLight color="#fff9ed" intensity={1.15} />
      <hemisphereLight
        args={['#fffaf1', '#9f7558', 1.3]}
        position={[0, 4, 0]}
      />
      <directionalLight
        castShadow
        color="#fff0c0"
        intensity={2.6}
        position={[-3.5, 5.5, 4.5]}
        shadow-bias={-0.00015}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      <directionalLight
        color="#b9ccff"
        intensity={0.75}
        position={[4, 2, -3]}
      />
      <ButterSquishy
        key={resetKey}
        onComplete={onComplete}
        reducedMotion={reducedMotion}
      />
      <mesh
        position={[0, GROUND_Y - 0.035, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#eadfd5" roughness={0.94} />
      </mesh>
      <ContactShadows
        position={[0, GROUND_Y, 0]}
        opacity={0.3}
        scale={7}
        blur={2.8}
        far={2.4}
        resolution={512}
        frames={60}
        color="#6c4932"
      />
    </>
  )
}
