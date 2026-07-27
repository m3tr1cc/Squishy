import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createRoundedCuboidGeometry } from '../src/scene/createRoundedCuboidGeometry'
import {
  bindPointerCancellation,
  createSurfaceHit,
  createSquishyImpact,
  isQualifiedTap,
} from '../src/scene/interaction'

function createPointerEvent(
  type: 'lostpointercapture' | 'pointercancel',
  pointerId: number,
  clientX: number,
  clientY: number,
) {
  const event = new Event(type)
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
  })
  return event
}

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

  it('preserves the struck layer and fragment alongside exact hit data', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2)
    const mesh = new THREE.Mesh(geometry)
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 4),
      new THREE.Vector3(0, 0, -1),
    )
    const intersection = raycaster.intersectObject(mesh)[0]
    const hit = createSurfaceHit({
      id: 'wax-press',
      timestampMs: 18,
      pointerType: 'touch',
      pointerId: 4,
      pressure: 0.5,
      layer: 'wax',
      fragmentId: 12,
      faceIndex: intersection.faceIndex ?? 0,
      object: mesh,
      worldPoint: intersection.point,
      face: intersection.face!,
    })

    expect(hit.layer).toBe('wax')
    expect(hit.fragmentId).toBe(12)
    expect(hit.pointerId).toBe(4)
    expect(Math.hypot(...hit.worldNormal)).toBeCloseTo(1, 5)
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

  it('releases presses canceled by native touch ownership changes', () => {
    const target = new EventTarget()
    const cancellations: Array<{
      pointerId: number
      clientX: number
      clientY: number
    }> = []
    const unbind = bindPointerCancellation(target, (event) => {
      cancellations.push(event)
    })

    target.dispatchEvent(createPointerEvent('pointercancel', 4, 18, 29))
    target.dispatchEvent(
      createPointerEvent('lostpointercapture', 8, 41, 52),
    )
    expect(cancellations).toEqual([
      { pointerId: 4, clientX: 18, clientY: 29 },
      { pointerId: 8, clientX: 41, clientY: 52 },
    ])

    unbind()
    target.dispatchEvent(createPointerEvent('pointercancel', 9, 63, 74))
    expect(cancellations).toHaveLength(2)
  })
})
