import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createRoundedCuboidGeometry } from '../src/scene/createRoundedCuboidGeometry'
import {
  createSquishyImpact,
  isQualifiedTap,
} from '../src/scene/interaction'

describe('impact records', () => {
  it('copies normalized local and world surface data', () => {
    const geometry = createRoundedCuboidGeometry({
      widthSegments: 4,
      heightSegments: 4,
      depthSegments: 4,
    })
    const mesh = new THREE.Mesh(geometry)
    mesh.position.set(1.5, -0.25, 2)
    mesh.rotation.set(0.1, 0.3, -0.05)
    mesh.updateWorldMatrix(true, false)

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(1.5, -0.25, 10),
      new THREE.Vector3(0, 0, -1),
    )
    const intersection = raycaster.intersectObject(mesh)[0]
    expect(intersection?.face).toBeTruthy()

    const impact = createSquishyImpact({
      id: 'test-impact',
      timestampMs: 123,
      pointerType: 'mouse',
      object: mesh,
      worldPoint: intersection.point,
      face: intersection.face!,
    })

    expect(Object.isFrozen(impact)).toBe(true)
    expect(Object.isFrozen(impact.localPoint)).toBe(true)
    expect(Math.hypot(...impact.localNormal)).toBeCloseTo(1, 5)
    expect(Math.hypot(...impact.worldNormal)).toBeCloseTo(1, 5)
    expect(impact.worldPoint).toEqual([
      intersection.point.x,
      intersection.point.y,
      intersection.point.z,
    ])

    geometry.dispose()
  })

  it('qualifies taps without accepting scroll gestures or long presses', () => {
    expect(
      isQualifiedTap({
        startX: 20,
        startY: 20,
        endX: 27,
        endY: 24,
        durationMs: 180,
      }),
    ).toBe(true)
    expect(
      isQualifiedTap({
        startX: 20,
        startY: 20,
        endX: 20,
        endY: 44,
        durationMs: 180,
      }),
    ).toBe(false)
    expect(
      isQualifiedTap({
        startX: 20,
        startY: 20,
        endX: 20,
        endY: 20,
        durationMs: 500,
      }),
    ).toBe(false)
  })
})
