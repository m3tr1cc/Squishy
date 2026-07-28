import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  SOAP_DEFINITIONS,
  SOAP_WAX_PHYSICAL_PROPERTIES,
  getSoapWaxPalette,
} from '../src/scene/soaps'

function circularHueDistance(left: number, right: number) {
  const direct = Math.abs(left - right)
  return Math.min(direct, 1 - direct)
}

function readHsl(color: string) {
  const result = { h: 0, s: 0, l: 0 }
  new THREE.Color(color).getHSL(result)
  return result
}

describe('soap wax palette', () => {
  it('creates a distinct pale transmissive tint related to every soap core', () => {
    const palettes = SOAP_DEFINITIONS.map((definition) => ({
      definition,
      palette: getSoapWaxPalette(definition.style.bodyColor),
    }))

    expect(
      new Set(palettes.map(({ palette }) => palette.surfaceColor)).size,
    ).toBe(SOAP_DEFINITIONS.length)
    expect(
      new Set(
        palettes.map(({ palette }) => palette.attenuationColor),
      ).size,
    ).toBe(SOAP_DEFINITIONS.length)

    for (const { definition, palette } of palettes) {
      const coreHsl = readHsl(definition.style.bodyColor)
      const surfaceHsl = readHsl(palette.surfaceColor)
      const attenuationHsl = readHsl(palette.attenuationColor)

      expect(palette.surfaceColor).toMatch(/^#[0-9a-f]{6}$/i)
      expect(palette.attenuationColor).toMatch(/^#[0-9a-f]{6}$/i)
      expect(
        circularHueDistance(coreHsl.h, surfaceHsl.h),
      ).toBeLessThan(0.025)
      expect(
        circularHueDistance(coreHsl.h, attenuationHsl.h),
      ).toBeLessThan(0.025)
      expect(surfaceHsl.l).toBeGreaterThanOrEqual(0.76)
      expect(surfaceHsl.l).toBeLessThanOrEqual(0.8)
      expect(surfaceHsl.s).toBeGreaterThanOrEqual(0.28)
      expect(surfaceHsl.s).toBeLessThanOrEqual(0.58)
      expect(attenuationHsl.l).toBeLessThan(surfaceHsl.l)
      expect(attenuationHsl.s).toBeGreaterThan(surfaceHsl.s)
    }
  })

  it('shares immutable palettes and an opaque transmissive material contract', () => {
    for (const definition of SOAP_DEFINITIONS) {
      const first = getSoapWaxPalette(definition.style.bodyColor)
      const second = getSoapWaxPalette(definition.style.bodyColor)
      expect(second).toBe(first)
      expect(Object.isFrozen(first)).toBe(true)
    }

    expect(SOAP_WAX_PHYSICAL_PROPERTIES.opacity).toBe(1)
    expect(SOAP_WAX_PHYSICAL_PROPERTIES.transparent).toBe(false)
    expect(
      SOAP_WAX_PHYSICAL_PROPERTIES.transmission,
    ).toBeGreaterThan(0.12)
    expect(
      SOAP_WAX_PHYSICAL_PROPERTIES.transmission,
    ).toBeLessThanOrEqual(0.25)
    expect(SOAP_WAX_PHYSICAL_PROPERTIES.ior).toBeGreaterThan(1)
    expect(SOAP_WAX_PHYSICAL_PROPERTIES.thickness).toBeGreaterThan(0)
    expect(Object.isFrozen(SOAP_WAX_PHYSICAL_PROPERTIES)).toBe(true)
  })
})
