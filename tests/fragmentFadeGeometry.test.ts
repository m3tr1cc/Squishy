import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  attachFragmentFadeColorAttribute,
  writeFragmentFadeColorAlpha,
} from '../src/scene/fracture/fragmentFadeGeometry'

function createGeometry(vertexCount = 4) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertexCount * 3, 3),
  )
  return geometry
}

describe('fragment fade geometry colors', () => {
  it('attaches white RGBA dynamic colors with the selected alpha', () => {
    const geometry = createGeometry()
    const attribute = attachFragmentFadeColorAttribute(geometry, 0.75)

    expect(geometry.getAttribute('color')).toBe(attribute)
    expect(attribute.itemSize).toBe(4)
    expect(attribute.count).toBe(4)
    expect(attribute.usage).toBe(THREE.DynamicDrawUsage)
    for (let vertex = 0; vertex < attribute.count; vertex += 1) {
      expect([
        attribute.getX(vertex),
        attribute.getY(vertex),
        attribute.getZ(vertex),
        attribute.getW(vertex),
      ]).toEqual([1, 1, 1, 0.75])
    }

    geometry.dispose()
  })

  it('preserves existing RGB colors while replacing alpha', () => {
    const geometry = createGeometry(2)
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute([
        0.1, 0.2, 0.3,
        0.4, 0.5, 0.6,
      ], 3),
    )

    const attribute = attachFragmentFadeColorAttribute(geometry, 0.6)

    expect([
      attribute.getX(0),
      attribute.getY(0),
      attribute.getZ(0),
      attribute.getW(0),
    ]).toEqual([
      expect.closeTo(0.1, 6),
      expect.closeTo(0.2, 6),
      expect.closeTo(0.3, 6),
      expect.closeTo(0.6, 6),
    ])
    expect([
      attribute.getX(1),
      attribute.getY(1),
      attribute.getZ(1),
      attribute.getW(1),
    ]).toEqual([
      expect.closeTo(0.4, 6),
      expect.closeTo(0.5, 6),
      expect.closeTo(0.6, 6),
      expect.closeTo(0.6, 6),
    ])

    geometry.dispose()
  })

  it('updates only the selected contiguous vertex range in place', () => {
    const geometry = createGeometry(5)
    const attribute = attachFragmentFadeColorAttribute(geometry)
    const versionBefore = attribute.version

    expect(
      writeFragmentFadeColorAlpha(attribute, 1, 3, 0.25),
    ).toBe(attribute)

    expect([
      attribute.getW(0),
      attribute.getW(1),
      attribute.getW(2),
      attribute.getW(3),
      attribute.getW(4),
    ]).toEqual([1, 0.25, 0.25, 0.25, 1])
    expect(attribute.version).toBe(versionBefore + 1)

    geometry.dispose()
  })

  it('clamps finite alpha values and leaves zero-length writes untouched', () => {
    const geometry = createGeometry(2)
    const attribute = attachFragmentFadeColorAttribute(geometry, 2)
    expect([...attribute.array]).toEqual([
      1, 1, 1, 1,
      1, 1, 1, 1,
    ])

    writeFragmentFadeColorAlpha(attribute, 0, 1, -0.5)
    expect(attribute.getW(0)).toBe(0)
    const versionBefore = attribute.version
    writeFragmentFadeColorAlpha(attribute, 2, 0, 0.5)
    expect(attribute.version).toBe(versionBefore)

    geometry.dispose()
  })

  it('validates geometry, attributes, ranges, and alpha values', () => {
    expect(() =>
      attachFragmentFadeColorAttribute(new THREE.BufferGeometry()),
    ).toThrow('position attribute')

    const geometry = createGeometry(2)
    const attribute = attachFragmentFadeColorAttribute(geometry)
    const rgb = new THREE.Float32BufferAttribute(6, 3)

    expect(() =>
      writeFragmentFadeColorAlpha(rgb, 0, 1, 0.5),
    ).toThrow('RGBA')
    expect(() =>
      writeFragmentFadeColorAlpha(attribute, -1, 1, 0.5),
    ).toThrow('out of bounds')
    expect(() =>
      writeFragmentFadeColorAlpha(attribute, 1, 2, 0.5),
    ).toThrow('out of bounds')
    expect(() =>
      writeFragmentFadeColorAlpha(attribute, 0, 1, Number.NaN),
    ).toThrow('alpha must be finite')

    geometry.dispose()
  })
})
