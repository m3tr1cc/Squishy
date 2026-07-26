import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { SquishyImpact } from './types'
import { createWaxShardGeometry } from './createWaxBreakAssets'

export type WaxBreakRecord = {
  impact: SquishyImpact
  seed: number
}

type WaxBreakProps = {
  crackTexture: THREE.Texture
  record: WaxBreakRecord
}

const FORWARD = new THREE.Vector3(0, 0, 1)
const NO_RAYCAST = () => null

export function WaxBreak({ crackTexture, record }: WaxBreakProps) {
  const shardGeometry = useMemo(
    () => createWaxShardGeometry(record.seed),
    [record.seed],
  )
  const transform = useMemo(() => {
    const normal = new THREE.Vector3(...record.impact.localNormal).normalize()
    const alignment = new THREE.Quaternion().setFromUnitVectors(FORWARD, normal)
    const roll = new THREE.Quaternion().setFromAxisAngle(
      FORWARD,
      (record.seed % 628) / 100,
    )
    const quaternion = alignment.multiply(roll)
    const position = new THREE.Vector3(...record.impact.localPoint).addScaledVector(
      normal,
      0.008,
    )

    return {
      position,
      quaternion,
    }
  }, [record])

  useEffect(() => () => shardGeometry.dispose(), [shardGeometry])

  return (
    <group
      position={transform.position}
      quaternion={transform.quaternion}
      renderOrder={5}
    >
      <mesh
        position={[0, 0, 0.002]}
        raycast={NO_RAYCAST}
        renderOrder={4}
      >
        <planeGeometry args={[0.86, 0.86]} />
        <meshBasicMaterial
          map={crackTexture}
          transparent
          depthWrite={false}
          alphaTest={0.015}
          polygonOffset
          polygonOffsetFactor={-12}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={shardGeometry} castShadow raycast={NO_RAYCAST}>
        <meshPhysicalMaterial
          color="#f4c945"
          clearcoat={0.52}
          clearcoatRoughness={0.32}
          metalness={0}
          roughness={0.42}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
