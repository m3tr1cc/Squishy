import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { getResponsiveSlimeCameraPose } from '../src/scene/SlimeScene'

describe('slime responsive presentation', () => {
  it('keeps the fresh and fully grown tub inside desktop and mobile views', () => {
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ]) {
      const pose = getResponsiveSlimeCameraPose(width, height)
      const camera = new THREE.PerspectiveCamera(
        32,
        width / height,
        0.1,
        100,
      )
      camera.position.fromArray(pose.position)
      camera.lookAt(...pose.target)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()

      for (const x of [-2.55, 2.55]) {
        for (const y of [-1.5, 2.38]) {
          const projected = new THREE.Vector3(x, y, 0).project(camera)
          expect(Math.abs(projected.x)).toBeLessThan(0.96)
          expect(Math.abs(projected.y)).toBeLessThan(0.96)
        }
      }
      expect(pose.position[1]).toBeGreaterThan(pose.target[1])
      expect(pose.position[2]).toBeGreaterThan(pose.target[2])
    }
  })
})
