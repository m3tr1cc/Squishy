import type * as THREE from 'three'

export type SoapId =
  | 'hard-wax'
  | 'plaster'
  | 'nail-polish'
  | 'jelly'
  | 'sprinkles'
  | 'sugar'

export type SoapVector3 = readonly [
  x: number,
  y: number,
  z: number,
]

export type SoapGeometryDefinition = Readonly<{
  /** Canonical local dimensions: X is width, Y is up, and +Z is front. */
  size: SoapVector3
  cornerRadius: number
  segments: SoapVector3
  createSourceGeometry: () => THREE.BufferGeometry
}>

export type SoapDeformationBehavior =
  | 'brittle'
  | 'chalky'
  | 'supple'
  | 'snappy'
  | 'wobbly'
  | 'crunchy'
  | 'gooey'
  | 'granular'

export type SoapDeformationDefinition = Readonly<{
  behavior: SoapDeformationBehavior
  dentRadius: number
  dentDepth: number
  maximumDentDepth: number
  compression: number
  spring: Readonly<{
    stiffness: number
    damping: number
  }>
}>

export type SoapSurfaceFinish =
  | 'hard-satin'
  | 'powder-matte'
  | 'soft-satin'
  | 'wet-lacquer'
  | 'translucent-gel'
  | 'confetti-matte'
  | 'wet-gloss'
  | 'crystal-satin'

export type SoapStyleDefinition = Readonly<{
  finish: SoapSurfaceFinish
  bodyColor: string
  accentPalette: readonly string[]
  roughness: number
  metalness: number
  clearcoat: number
  transmission: number
  sheen: number
}>

export type SoapAtlasUvBounds = readonly [
  minimumU: number,
  minimumV: number,
  maximumU: number,
  maximumV: number,
]

export type SoapDecalDefinition = Readonly<{
  text: 'SOAP'
  inkColor: string
  atlasSlot: number
  atlasUvBounds: SoapAtlasUvBounds
  createGeometry: () => THREE.BufferGeometry
  createTexture: () => Promise<THREE.CanvasTexture>
}>

export type SoapDefinition = Readonly<{
  id: SoapId
  name: string
  /** Stable per-product salt mixed with each coating's random generation. */
  seedSalt: number
  geometry: SoapGeometryDefinition
  deformation: SoapDeformationDefinition
  style: SoapStyleDefinition
  decal: SoapDecalDefinition
}>
