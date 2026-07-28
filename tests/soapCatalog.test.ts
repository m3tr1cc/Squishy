import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  SOAP_DECAL_TRIANGLE_BUDGET,
  SOAP_DEFINITION_COUNT,
  SOAP_DEFINITIONS,
  SOAP_LABEL_ATLAS_COLUMNS,
  SOAP_LABEL_ATLAS_ENTRIES,
  SOAP_LABEL_ATLAS_ROWS,
  SOAP_SHARED_SIZE,
  SOAP_SOURCE_TRIANGLE_BUDGET,
  getSoapDefinition,
  mixSoapSeed,
} from '../src/scene/soaps'

const EXPECTED_SOAPS = [
  ['hard-wax', 'Hard Wax', 0x4a7d2e19],
  ['plaster', 'Plaster', 0x91c5b30f],
  ['nail-polish', 'Nail Polish', 0xd47a106d],
  ['jelly', 'Jelly', 0x6f32c9b5],
  ['sprinkles', 'Sprinkles', 0xb1e75943],
  ['sugar', 'Sugar', 0xe5068c9f],
] as const

function expectFiniteGeometry(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position')
  const normals = geometry.getAttribute('normal')

  expect(positions).toBeDefined()
  expect(normals).toBeDefined()
  expect(normals.count).toBe(positions.count)
  for (let index = 0; index < positions.count; index += 1) {
    const values = [
      positions.getX(index),
      positions.getY(index),
      positions.getZ(index),
      normals.getX(index),
      normals.getY(index),
      normals.getZ(index),
    ]
    expect(values.every(Number.isFinite)).toBe(true)
    expect(
      Math.hypot(
        normals.getX(index),
        normals.getY(index),
        normals.getZ(index),
      ),
    ).toBeCloseTo(1, 3)
  }
}

function expectClosedManifold(geometry: THREE.BufferGeometry) {
  const index = geometry.getIndex()
  expect(index).not.toBeNull()
  const edgeUse = new Map<string, number>()

  for (let offset = 0; offset < index!.count; offset += 3) {
    const triangle = [
      index!.getX(offset),
      index!.getX(offset + 1),
      index!.getX(offset + 2),
    ]
    expect(new Set(triangle).size).toBe(3)
    for (let edge = 0; edge < 3; edge += 1) {
      const left = triangle[edge]
      const right = triangle[(edge + 1) % 3]
      const key =
        left < right ? `${left}:${right}` : `${right}:${left}`
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1)
    }
  }

  expect(edgeUse.size).toBeGreaterThan(0)
  expect([...edgeUse.values()].every((count) => count === 2)).toBe(
    true,
  )
}

function circularHueDistance(left: number, right: number) {
  const distance = Math.abs(left - right)
  return Math.min(distance, 1 - distance)
}

describe('soap catalog', () => {
  it('contains exactly the six stable products in their intended order', () => {
    expect(SOAP_DEFINITION_COUNT).toBe(6)
    expect(
      SOAP_DEFINITIONS.map(({ id, name, seedSalt }) => [
        id,
        name,
        seedSalt,
      ]),
    ).toEqual(EXPECTED_SOAPS)

    for (const definition of SOAP_DEFINITIONS) {
      expect(getSoapDefinition(definition.id)).toBe(definition)
    }
  })

  it('keeps IDs, salts, bright colors, and response styles distinct', () => {
    const unique = (values: readonly unknown[]) =>
      new Set(values).size

    expect(unique(SOAP_DEFINITIONS.map(({ id }) => id))).toBe(6)
    expect(unique(SOAP_DEFINITIONS.map(({ seedSalt }) => seedSalt))).toBe(
      6,
    )
    expect(
      unique(
        SOAP_DEFINITIONS.map(({ deformation }) => deformation.behavior),
      ),
    ).toBe(6)
    expect(
      unique(SOAP_DEFINITIONS.map(({ style }) => style.finish)),
    ).toBe(6)
    expect(
      unique(SOAP_DEFINITIONS.map(({ style }) => style.bodyColor)),
    ).toBe(6)

    for (const definition of SOAP_DEFINITIONS) {
      expect(definition.style.bodyColor).toMatch(/^#[0-9a-f]{6}$/i)
      expect(definition.seedSalt).toBe(definition.seedSalt >>> 0)
      expect(definition.deformation.dentDepth).toBeGreaterThan(0)
      expect(
        definition.deformation.maximumDentDepth,
      ).toBeGreaterThanOrEqual(definition.deformation.dentDepth)
      expect(
        definition.deformation.maximumDentDepth,
      ).toBeLessThan(definition.geometry.size[2] / 2)
    }
  })

  it('deep-freezes catalog data while factories return owned assets', () => {
    expect(Object.isFrozen(SOAP_DEFINITIONS)).toBe(true)

    for (const definition of SOAP_DEFINITIONS) {
      expect(Object.isFrozen(definition)).toBe(true)
      expect(Object.isFrozen(definition.geometry)).toBe(true)
      expect(Object.isFrozen(definition.geometry.size)).toBe(true)
      expect(Object.isFrozen(definition.geometry.segments)).toBe(true)
      expect(Object.isFrozen(definition.deformation)).toBe(true)
      expect(Object.isFrozen(definition.deformation.spring)).toBe(true)
      expect(Object.isFrozen(definition.style)).toBe(true)
      expect(Object.isFrozen(definition.style.accentPalette)).toBe(true)
      expect(Object.isFrozen(definition.decal)).toBe(true)
      expect(Object.isFrozen(definition.decal.atlasUvBounds)).toBe(true)

      const first = definition.geometry.createSourceGeometry()
      const second = definition.geometry.createSourceGeometry()
      const firstDecal = definition.decal.createGeometry()
      const secondDecal = definition.decal.createGeometry()
      expect(first).not.toBe(second)
      expect(firstDecal).not.toBe(secondDecal)
      first.dispose()
      second.dispose()
      firstDecal.dispose()
      secondDecal.dispose()
    }
  }, 15_000)

  it('mixes each product salt into a repeatable unsigned generation seed', () => {
    const coatingSeed = 0xf01dcafe
    const mixed = SOAP_DEFINITIONS.map((definition) =>
      mixSoapSeed(coatingSeed, definition),
    )

    expect(mixed).toEqual(
      SOAP_DEFINITIONS.map(
        ({ seedSalt }) => (coatingSeed ^ seedSalt) >>> 0,
      ),
    )
    expect(new Set(mixed).size).toBe(6)
    expect(
      mixSoapSeed(coatingSeed, SOAP_DEFINITIONS[0].id),
    ).toBe(mixed[0])
  })
})

describe('soap procedural geometry', () => {
  it('creates identical finite pinched source meshes inside the mobile budget', () => {
    let expectedPositions: Float32Array | null = null
    for (const definition of SOAP_DEFINITIONS) {
      const geometry = definition.geometry.createSourceGeometry()
      const index = geometry.getIndex()
      expect(index).not.toBeNull()
      expect(index!.count % 3).toBe(0)
      expect(index!.count / 3).toBeLessThanOrEqual(
        SOAP_SOURCE_TRIANGLE_BUDGET,
      )
      expect(index!.count / 3).toBeGreaterThan(1_000)
      expectFiniteGeometry(geometry)
      expectClosedManifold(geometry)

      geometry.computeBoundingBox()
      const bounds = geometry.boundingBox!
      const size = bounds.getSize(new THREE.Vector3())
      const center = bounds.getCenter(new THREE.Vector3())
      expect(definition.geometry.size).toEqual(SOAP_SHARED_SIZE)
      expect(size.x).toBeCloseTo(definition.geometry.size[0], 4)
      expect(size.y).toBeGreaterThan(
        definition.geometry.size[1] * 0.97,
      )
      expect(size.y).toBeLessThanOrEqual(
        definition.geometry.size[1],
      )
      expect(size.z).toBeCloseTo(
        definition.geometry.size[2] + 0.11,
        3,
      )
      expect(center.length()).toBeLessThan(1e-5)
      expect(bounds.max.z).toBeGreaterThan(0)
      const positions = geometry.getAttribute(
        'position',
      ).array as Float32Array
      if (expectedPositions) {
        expect([...positions]).toEqual([...expectedPositions])
      } else {
        expectedPositions = new Float32Array(positions)
      }

      let centerHalfHeight = 0
      let lobeHalfHeight = 0
      const halfWidth = definition.geometry.size[0] * 0.5
      for (let index = 0; index < positions.length; index += 3) {
        const normalizedX = Math.abs(positions[index] / halfWidth)
        const absoluteY = Math.abs(positions[index + 1])
        if (normalizedX < 0.04) {
          centerHalfHeight = Math.max(
            centerHalfHeight,
            absoluteY,
          )
        } else if (normalizedX >= 0.65 && normalizedX <= 0.75) {
          lobeHalfHeight = Math.max(lobeHalfHeight, absoluteY)
        }
      }
      const waistRatio = centerHalfHeight / lobeHalfHeight
      expect(waistRatio).toBeGreaterThanOrEqual(0.86)
      expect(waistRatio).toBeLessThanOrEqual(0.9)
      geometry.dispose()
    }
  })

  it('creates conformal atlas-mapped decals inside their own budget', () => {
    const textureFactories = new Set(
      SOAP_DEFINITIONS.map(
        ({ decal }) => decal.createTexture,
      ),
    )
    expect(textureFactories.size).toBe(1)

    for (const definition of SOAP_DEFINITIONS) {
      const geometry = definition.decal.createGeometry()
      const index = geometry.getIndex()
      const uvs = geometry.getAttribute('uv')
      const [
        minimumU,
        minimumV,
        maximumU,
        maximumV,
      ] = definition.decal.atlasUvBounds

      expect(index).not.toBeNull()
      expect(index!.count / 3).toBeLessThanOrEqual(
        SOAP_DECAL_TRIANGLE_BUDGET,
      )
      expectFiniteGeometry(geometry)
      for (let vertex = 0; vertex < uvs.count; vertex += 1) {
        expect(uvs.getX(vertex)).toBeGreaterThanOrEqual(
          minimumU - 1e-6,
        )
        expect(uvs.getX(vertex)).toBeLessThanOrEqual(
          maximumU + 1e-6,
        )
        expect(uvs.getY(vertex)).toBeGreaterThanOrEqual(
          minimumV - 1e-6,
        )
        expect(uvs.getY(vertex)).toBeLessThanOrEqual(
          maximumV + 1e-6,
        )
      }

      geometry.computeBoundingBox()
      expect(geometry.boundingBox!.max.z).toBeCloseTo(
        definition.geometry.size[2] / 2 + 0.055 + 0.004,
        4,
      )
      geometry.dispose()
    }
  })
})

describe('shared SOAP label atlas', () => {
  it('assigns one immutable non-overlapping cell to every soap', () => {
    expect(SOAP_LABEL_ATLAS_ENTRIES).toHaveLength(6)
    expect(Object.isFrozen(SOAP_LABEL_ATLAS_ENTRIES)).toBe(true)
    expect(
      new Set(
        SOAP_LABEL_ATLAS_ENTRIES.map(({ atlasSlot }) => atlasSlot),
      ).size,
    ).toBe(6)

    for (const entry of SOAP_LABEL_ATLAS_ENTRIES) {
      expect(Object.isFrozen(entry)).toBe(true)
      expect(Object.isFrozen(entry.atlasUvBounds)).toBe(true)
      expect(entry.atlasSlot).toBeGreaterThanOrEqual(0)
      expect(entry.atlasSlot).toBeLessThan(
        SOAP_LABEL_ATLAS_COLUMNS * SOAP_LABEL_ATLAS_ROWS,
      )
      const [minimumU, minimumV, maximumU, maximumV] =
        entry.atlasUvBounds
      expect(minimumU).toBeGreaterThanOrEqual(0)
      expect(minimumV).toBeGreaterThanOrEqual(0)
      expect(maximumU).toBeLessThanOrEqual(1)
      expect(maximumV).toBeLessThanOrEqual(1)
      expect(maximumU).toBeGreaterThan(minimumU)
      expect(maximumV).toBeGreaterThan(minimumV)
      expect(entry.text).toBe('SOAP')

      const definition = getSoapDefinition(entry.id)
      const coreHsl = { h: 0, s: 0, l: 0 }
      const inkHsl = { h: 0, s: 0, l: 0 }
      new THREE.Color(definition.style.bodyColor).getHSL(coreHsl)
      new THREE.Color(entry.inkColor).getHSL(inkHsl)
      expect(
        circularHueDistance(coreHsl.h, inkHsl.h),
      ).toBeLessThan(0.08)
      expect(coreHsl.l - inkHsl.l).toBeGreaterThan(0.15)
    }
  })
})
