import * as THREE from 'three'

export type SoapWaxPalette = Readonly<{
  surfaceColor: string
  attenuationColor: string
}>

export const SOAP_WAX_PHYSICAL_PROPERTIES = Object.freeze({
  attenuationDistance: 0.3,
  clearcoat: 0,
  ior: 1.44,
  metalness: 0,
  opacity: 1,
  roughness: 0.68,
  sheen: 0.03,
  specularIntensity: 0.26,
  thickness: 0.04,
  transmission: 0.18,
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
  const surfaceSaturation = clamp(hslScratch.s * 0.55, 0.3, 0.56)
  const attenuationSaturation = clamp(
    hslScratch.s * 0.64,
    0.38,
    0.68,
  )
  const palette = Object.freeze({
    surfaceColor: toCssHex(
      new THREE.Color().setHSL(
        hslScratch.h,
        surfaceSaturation,
        0.78,
      ),
    ),
    attenuationColor: toCssHex(
      new THREE.Color().setHSL(
        hslScratch.h,
        attenuationSaturation,
        0.67,
      ),
    ),
  })
  paletteCache.set(bodyColor, palette)
  return palette
}
