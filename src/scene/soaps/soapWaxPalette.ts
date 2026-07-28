import * as THREE from 'three'

export type SoapWaxPalette = Readonly<{
  surfaceColor: string
  attenuationColor: string
}>

export const SOAP_WAX_PHYSICAL_PROPERTIES = Object.freeze({
  attenuationDistance: 0.75,
  clearcoat: 0.65,
  clearcoatRoughness: 0.12,
  ior: 1.44,
  metalness: 0,
  opacity: 1,
  roughness: 0.16,
  sheen: 0.08,
  specularIntensity: 0.72,
  thickness: 0.045,
  transmission: 0.62,
  transparent: false,
} as const)

const paletteCache = new Map<string, SoapWaxPalette>()
const hslScratch = { h: 0, s: 0, l: 0 }

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function toCssHex(color: THREE.Color) {
  return `#${color.getHexString(THREE.SRGBColorSpace)}`
}

/**
 * Keeps the core hue while lifting it into a pale paraffin range. The surface
 * color provides the visible tint; the stronger attenuation color lets the
 * saturated soap beneath influence light travelling through the wax.
 */
export function getSoapWaxPalette(bodyColor: string): SoapWaxPalette {
  const cached = paletteCache.get(bodyColor)
  if (cached) {
    return cached
  }

  const core = new THREE.Color(bodyColor)
  core.getHSL(hslScratch)
  const surfaceSaturation = clamp(
    hslScratch.s * 0.38,
    0.2,
    0.38,
  )
  const attenuationSaturation = clamp(
    hslScratch.s * 0.72,
    0.5,
    0.72,
  )
  const palette = Object.freeze({
    surfaceColor: toCssHex(
      new THREE.Color().setHSL(
        hslScratch.h,
        surfaceSaturation,
        0.86,
      ),
    ),
    attenuationColor: toCssHex(
      new THREE.Color().setHSL(
        hslScratch.h,
        attenuationSaturation,
        0.7,
      ),
    ),
  })
  paletteCache.set(bodyColor, palette)
  return palette
}
