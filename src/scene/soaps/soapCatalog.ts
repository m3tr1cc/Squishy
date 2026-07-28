import {
  createSoapDecalGeometry,
  createSoapSourceGeometry,
  SOAP_SHARED_CORNER_RADIUS,
  SOAP_SHARED_SEGMENTS,
  SOAP_SHARED_SIZE,
} from './soapGeometry'
import {
  createSoapLabelAtlasTextureAsync,
  getSoapLabelAtlasEntry,
} from './soapLabelAtlas'
import type {
  SoapDefinition,
  SoapDeformationDefinition,
  SoapGeometryDefinition,
  SoapId,
  SoapStyleDefinition,
  SoapVector3,
} from './types'

type SoapDefinitionInput = Readonly<{
  id: SoapId
  name: string
  seedSalt: number
  size: SoapVector3
  cornerRadius: number
  segments: SoapVector3
  deformation: SoapDeformationDefinition
  style: SoapStyleDefinition
}>

function vector3(value: SoapVector3): SoapVector3 {
  return Object.freeze([value[0], value[1], value[2]])
}

function deformation(
  definition: SoapDeformationDefinition,
): SoapDeformationDefinition {
  return Object.freeze({
    ...definition,
    spring: Object.freeze({ ...definition.spring }),
  })
}

function style(
  definition: SoapStyleDefinition,
): SoapStyleDefinition {
  return Object.freeze({
    ...definition,
    accentPalette: Object.freeze([
      ...definition.accentPalette,
    ]),
  })
}

function createSoapDefinition({
  id,
  name,
  seedSalt,
  size,
  cornerRadius,
  segments,
  deformation: deformationDefinition,
  style: styleDefinition,
}: SoapDefinitionInput): SoapDefinition {
  const geometryBase = {
    size: vector3(size),
    cornerRadius,
    segments: vector3(segments),
  }
  const geometry: SoapGeometryDefinition = Object.freeze({
    ...geometryBase,
    createSourceGeometry: () =>
      createSoapSourceGeometry(geometryBase),
  })
  const atlasEntry = getSoapLabelAtlasEntry(id)

  return Object.freeze({
    id,
    name,
    seedSalt: seedSalt >>> 0,
    geometry,
    deformation: deformation(deformationDefinition),
    style: style(styleDefinition),
    decal: Object.freeze({
      text: atlasEntry.text,
      inkColor: atlasEntry.inkColor,
      atlasSlot: atlasEntry.atlasSlot,
      atlasUvBounds: atlasEntry.atlasUvBounds,
      createGeometry: () =>
        createSoapDecalGeometry({
          ...geometryBase,
          atlasUvBounds: atlasEntry.atlasUvBounds,
        }),
      createTexture: createSoapLabelAtlasTextureAsync,
    }),
  })
}

export const SOAP_DEFINITIONS = Object.freeze([
  createSoapDefinition({
    id: 'hard-wax',
    name: 'Hard Wax',
    seedSalt: 0x4a7d2e19,
    size: SOAP_SHARED_SIZE,
    cornerRadius: SOAP_SHARED_CORNER_RADIUS,
    segments: SOAP_SHARED_SEGMENTS,
    deformation: {
      behavior: 'brittle',
      dentRadius: 0.42,
      dentDepth: 0.08,
      maximumDentDepth: 0.11,
      compression: 0.018,
      spring: { stiffness: 250, damping: 25 },
    },
    style: {
      finish: 'hard-satin',
      bodyColor: '#f7d93d',
      accentPalette: ['#ffe972', '#fff3b2'],
      roughness: 0.58,
      metalness: 0,
      clearcoat: 0.08,
      transmission: 0,
      sheen: 0.05,
    },
  }),
  createSoapDefinition({
    id: 'plaster',
    name: 'Plaster',
    seedSalt: 0x91c5b30f,
    size: SOAP_SHARED_SIZE,
    cornerRadius: SOAP_SHARED_CORNER_RADIUS,
    segments: SOAP_SHARED_SEGMENTS,
    deformation: {
      behavior: 'chalky',
      dentRadius: 0.48,
      dentDepth: 0.11,
      maximumDentDepth: 0.14,
      compression: 0.022,
      spring: { stiffness: 210, damping: 23 },
    },
    style: {
      finish: 'powder-matte',
      bodyColor: '#f4c4d7',
      accentPalette: ['#ffd9e7', '#fff1f6'],
      roughness: 0.92,
      metalness: 0,
      clearcoat: 0,
      transmission: 0,
      sheen: 0.02,
    },
  }),
  createSoapDefinition({
    id: 'nail-polish',
    name: 'Nail Polish',
    seedSalt: 0xd47a106d,
    size: SOAP_SHARED_SIZE,
    cornerRadius: SOAP_SHARED_CORNER_RADIUS,
    segments: SOAP_SHARED_SEGMENTS,
    deformation: {
      behavior: 'snappy',
      dentRadius: 0.46,
      dentDepth: 0.1,
      maximumDentDepth: 0.13,
      compression: 0.02,
      spring: { stiffness: 235, damping: 24 },
    },
    style: {
      finish: 'wet-lacquer',
      bodyColor: '#cfc7ff',
      accentPalette: ['#e3ddff', '#f4f1ff'],
      roughness: 0.2,
      metalness: 0.04,
      clearcoat: 0.78,
      transmission: 0,
      sheen: 0.22,
    },
  }),
  createSoapDefinition({
    id: 'jelly',
    name: 'Jelly',
    seedSalt: 0x6f32c9b5,
    size: SOAP_SHARED_SIZE,
    cornerRadius: SOAP_SHARED_CORNER_RADIUS,
    segments: SOAP_SHARED_SEGMENTS,
    deformation: {
      behavior: 'wobbly',
      dentRadius: 0.62,
      dentDepth: 0.2,
      maximumDentDepth: 0.24,
      compression: 0.05,
      spring: { stiffness: 105, damping: 13 },
    },
    style: {
      finish: 'translucent-gel',
      bodyColor: '#8fdcf7',
      accentPalette: ['#b9eaff', '#e3f7ff'],
      roughness: 0.26,
      metalness: 0,
      clearcoat: 0.28,
      transmission: 0.18,
      sheen: 0.12,
    },
  }),
  createSoapDefinition({
    id: 'sprinkles',
    name: 'Sprinkles',
    seedSalt: 0xb1e75943,
    size: SOAP_SHARED_SIZE,
    cornerRadius: SOAP_SHARED_CORNER_RADIUS,
    segments: SOAP_SHARED_SEGMENTS,
    deformation: {
      behavior: 'crunchy',
      dentRadius: 0.5,
      dentDepth: 0.14,
      maximumDentDepth: 0.18,
      compression: 0.03,
      spring: { stiffness: 175, damping: 19 },
    },
    style: {
      finish: 'confetti-matte',
      bodyColor: '#ffb8b0',
      accentPalette: [
        '#ff5d8f',
        '#ffe66d',
        '#4dd9ff',
        '#7bf1a8',
      ],
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.06,
      transmission: 0,
      sheen: 0.18,
    },
  }),
  createSoapDefinition({
    id: 'sugar',
    name: 'Sugar',
    seedSalt: 0xe5068c9f,
    size: SOAP_SHARED_SIZE,
    cornerRadius: SOAP_SHARED_CORNER_RADIUS,
    segments: SOAP_SHARED_SEGMENTS,
    deformation: {
      behavior: 'granular',
      dentRadius: 0.45,
      dentDepth: 0.1,
      maximumDentDepth: 0.13,
      compression: 0.024,
      spring: { stiffness: 220, damping: 22 },
    },
    style: {
      finish: 'crystal-satin',
      bodyColor: '#b6df69',
      accentPalette: ['#d0ed98', '#eff9d3'],
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.16,
      transmission: 0.03,
      sheen: 0.26,
    },
  }),
] as const)

export const SOAP_DEFINITION_COUNT = SOAP_DEFINITIONS.length

const soapDefinitionById = new Map(
  SOAP_DEFINITIONS.map((definition) => [
    definition.id,
    definition,
  ]),
)

export function getSoapDefinition(id: SoapId) {
  const definition = soapDefinitionById.get(id)
  if (!definition) {
    throw new Error(`Unknown soap definition: ${id}.`)
  }
  return definition
}

export function mixSoapSeed(
  coatingSeed: number,
  soap: SoapDefinition | SoapId,
) {
  const definition =
    typeof soap === 'string' ? getSoapDefinition(soap) : soap
  return (coatingSeed ^ definition.seedSalt) >>> 0
}
