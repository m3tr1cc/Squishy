import { describe, expect, it } from 'vitest'
import {
  createSoapStaticColliders,
  getSoapDebrisFloorY,
  getSoapGridPosition,
  SOAP_PRESENTATION_SCALE,
} from '../src/scene/SoapScene'
import {
  SOAP_DEBRIS_BODY_LIMIT,
  SOAP_DEBRIS_FADE_POLICY,
  SOAP_DEBRIS_FLOOR_CLEARANCE,
  SOAP_DEFINITIONS,
  createSoapDebrisLaunch,
} from '../src/scene/soaps'
import { SOAP_OUTER_OFFSET } from '../src/scene/SoapSquishy'

describe('soap debris launch', () => {
  it('uses deterministic gravity-led movement with restrained rotation', () => {
    const first = createSoapDebrisLaunch(42, [0.3, 0.4, 0.8])
    const repeated = createSoapDebrisLaunch(42, [0.3, 0.4, 0.8])
    const different = createSoapDebrisLaunch(43, [0.3, 0.4, 0.8])

    expect(first).toEqual(repeated)
    expect(first).not.toEqual(different)
    expect(first.linearVelocity[1]).toBeLessThan(0)
    expect(first.gravityScale).toBeGreaterThan(1)
    expect(Math.hypot(...first.angularVelocity)).toBeLessThan(0.3)
  })

  it('keeps fragments visible long enough to reach the lower floor', () => {
    const floorY = getSoapDebrisFloorY('portrait')
    const highestSoapY = Math.max(
      ...SOAP_DEFINITIONS.map(
        (_, index) => getSoapGridPosition(index, 'portrait')[1],
      ),
    )
    const fallDistance = highestSoapY - floorY
    const fallSeconds = Math.sqrt(
      (2 * fallDistance) / (9.81 * 1.1),
    )

    expect(fallSeconds).toBeLessThan(
      SOAP_DEBRIS_FADE_POLICY.maximumSimulationSeconds ?? 0,
    )
    expect(
      SOAP_DEBRIS_FADE_POLICY.maximumSimulationSeconds,
    ).toBeGreaterThanOrEqual(2.5)
  })
})

describe('soap debris collision field', () => {
  it.each(['portrait', 'landscape'] as const)(
    'creates two lobe colliders per soap and a floor in %s layout',
    (layout) => {
      const colliders = createSoapStaticColliders(layout)
      const soapBodies = colliders.filter(
        (collider) => collider.kind === 'round-cuboid',
      )
      const floor = colliders.find(
        (collider) => collider.id === 'soap-debris-floor',
      )

      expect(soapBodies).toHaveLength(SOAP_DEFINITIONS.length * 2)
      expect(colliders).toHaveLength(SOAP_DEFINITIONS.length * 2 + 1)
      expect(SOAP_DEBRIS_BODY_LIMIT).toBe(24)
      expect(floor?.kind).toBe('cuboid')

      for (let index = 0; index < SOAP_DEFINITIONS.length; index += 1) {
        const center = getSoapGridPosition(index, layout)
        const left = soapBodies[index * 2]
        const right = soapBodies[index * 2 + 1]
        expect(left.position?.[0]).toBeLessThan(center[0])
        expect(right.position?.[0]).toBeGreaterThan(center[0])
        expect(left.position?.[1]).toBe(center[1])
        expect(right.position?.[1]).toBe(center[1])
        expect(left.halfExtents.every((value) => value > 0)).toBe(true)
        expect(right.halfExtents).toEqual(left.halfExtents)
      }
    },
  )

  it('places the invisible floor below every wax-covered soap', () => {
    for (const layout of ['portrait', 'landscape'] as const) {
      const floorY = getSoapDebrisFloorY(layout)
      for (let index = 0; index < SOAP_DEFINITIONS.length; index += 1) {
        const definition = SOAP_DEFINITIONS[index]
        const position = getSoapGridPosition(index, layout)
        const soapBottom =
          position[1] -
          definition.geometry.size[1] *
            SOAP_PRESENTATION_SCALE[1] *
            0.5 -
          SOAP_OUTER_OFFSET

        expect(soapBottom - floorY).toBeGreaterThanOrEqual(
          SOAP_DEBRIS_FLOOR_CLEARANCE - 1e-10,
        )
      }
    }
  })
})
