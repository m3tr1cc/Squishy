import {
  createSoapDecalGeometry,
  createSoapSourceGeometry,
} from './soapGeometry'
import {
  createSoapLabelAtlasTexture,
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
      title: atlasEntry.title,
      subtitle: atlasEntry.subtitle,
      inkColor: atlasEntry.inkColor,
      atlasSlot: atlasEntry.atlasSlot,
      atlasUvBounds: atlasEntry.atlasUvBounds,
      createGeometry: () =>
        createSoapDecalGeometry({
          ...geometryBase,
          atlasUvBounds: atlasEntry.atlasUvBounds,
        }),
      createTexture: createSoapLabelAtlasTexture,
    }),
  })
}

export const SOAP_DEFINITIONS = Object.freeze([
  createSoapDefinition({
    id: 'hard-wax',
    name: 'Hard Wax',
    seedSalt: 0x4a7d2e19,
    size: [4.25, 1.5, 0.9],
    cornerRadius: 0.16,
    segments: [20, 9, 7],
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
      bodyColor: '#ff553d',
      accentPalette: ['#ff8a70', '#ffd1c7'],
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
    size: [3.85, 1.9, 1],
    cornerRadius: 0.12,
    segments: [18, 10, 7],
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
      bodyColor: '#5d77ff',
      accentPalette: ['#91a3ff', '#d5dcff'],
      roughness: 0.92,
      metalness: 0,
      clearcoat: 0,
      transmission: 0,
      sheen: 0.02,
    },
  }),
  createSoapDefinition({
    id: 'soft-wax',
    name: 'Soft Wax',
    seedSalt: 0x26e8d4a3,
    size: [4.15, 1.65, 1.08],
    cornerRadius: 0.28,
    segments: [19, 9, 7],
    deformation: {
      behavior: 'supple',
      dentRadius: 0.58,
      dentDepth: 0.18,
      maximumDentDepth: 0.22,
      compression: 0.035,
      spring: { stiffness: 150, damping: 17 },
    },
    style: {
      finish: 'soft-satin',
      bodyColor: '#ffb52e',
      accentPalette: ['#ffd066', '#fff0be'],
      roughness: 0.68,
      metalness: 0,
      clearcoat: 0.04,
      transmission: 0,
      sheen: 0.35,
    },
  }),
  createSoapDefinition({
    id: 'nail-polish',
    name: 'Nail Polish',
    seedSalt: 0xd47a106d,
    size: [3.75, 1.7, 0.92],
    cornerRadius: 0.2,
    segments: [18, 9, 7],
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
      bodyColor: '#ff2f92',
      accentPalette: ['#ff73b5', '#ffd0e5'],
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
    size: [4, 1.8, 1.12],
    cornerRadius: 0.34,
    segments: [19, 10, 7],
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
      bodyColor: '#12d6c5',
      accentPalette: ['#5eebdf', '#c2fff9'],
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
    size: [4.3, 1.55, 1],
    cornerRadius: 0.25,
    segments: [20, 9, 7],
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
      bodyColor: '#9b5de5',
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
    id: 'slime',
    name: 'Slime',
    seedSalt: 0x38adf271,
    size: [3.9, 1.85, 1.1],
    cornerRadius: 0.36,
    segments: [19, 10, 7],
    deformation: {
      behavior: 'gooey',
      dentRadius: 0.68,
      dentDepth: 0.22,
      maximumDentDepth: 0.27,
      compression: 0.055,
      spring: { stiffness: 85, damping: 11 },
    },
    style: {
      finish: 'wet-gloss',
      bodyColor: '#70e000',
      accentPalette: ['#a7f542', '#ddffad'],
      roughness: 0.3,
      metalness: 0,
      clearcoat: 0.52,
      transmission: 0.08,
      sheen: 0.2,
    },
  }),
  createSoapDefinition({
    id: 'sugar',
    name: 'Sugar',
    seedSalt: 0xe5068c9f,
    size: [4.1, 1.6, 0.96],
    cornerRadius: 0.18,
    segments: [19, 9, 7],
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
      bodyColor: '#55c7ff',
      accentPalette: ['#94ddff', '#e1f6ff'],
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
