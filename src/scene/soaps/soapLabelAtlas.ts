import * as THREE from 'three'
import {
  PRODUCT_LABEL_FONT_FAMILY,
  loadProductLabelFont,
} from '../labels/productLabelFont'
import type {
  SoapAtlasUvBounds,
  SoapId,
} from './types'

export const SOAP_LABEL_ATLAS_COLUMNS = 3
export const SOAP_LABEL_ATLAS_ROWS = 2
export const SOAP_LABEL_ATLAS_WIDTH = 1_024
export const SOAP_LABEL_ATLAS_HEIGHT = 512
export const SOAP_LABEL_FONT_FAMILY = PRODUCT_LABEL_FONT_FAMILY

const CELL_UV_PADDING = 0.055

export type SoapLabelAtlasEntry = Readonly<{
  id: SoapId
  text: 'Soap'
  inkColor: string
  atlasSlot: number
  atlasUvBounds: SoapAtlasUvBounds
}>

function createAtlasUvBounds(atlasSlot: number): SoapAtlasUvBounds {
  const column = atlasSlot % SOAP_LABEL_ATLAS_COLUMNS
  const row = Math.floor(atlasSlot / SOAP_LABEL_ATLAS_COLUMNS)
  const localMinimum = CELL_UV_PADDING
  const localMaximum = 1 - CELL_UV_PADDING
  const minimumU =
    (column + localMinimum) / SOAP_LABEL_ATLAS_COLUMNS
  const maximumU =
    (column + localMaximum) / SOAP_LABEL_ATLAS_COLUMNS
  const invertedRow = SOAP_LABEL_ATLAS_ROWS - row - 1
  const minimumV =
    (invertedRow + localMinimum) / SOAP_LABEL_ATLAS_ROWS
  const maximumV =
    (invertedRow + localMaximum) / SOAP_LABEL_ATLAS_ROWS

  return Object.freeze([
    minimumU,
    minimumV,
    maximumU,
    maximumV,
  ])
}

function label(
  id: SoapId,
  inkColor: string,
  atlasSlot: number,
): SoapLabelAtlasEntry {
  return Object.freeze({
    id,
    text: 'Soap',
    inkColor,
    atlasSlot,
    atlasUvBounds: createAtlasUvBounds(atlasSlot),
  })
}

export const SOAP_LABEL_ATLAS_ENTRIES = Object.freeze([
  label('hard-wax', '#ad7400', 0),
  label('plaster', '#e62f86', 1),
  label('nail-polish', '#5940bd', 2),
  label('jelly', '#175fa8', 3),
  label('sprinkles', '#e94370', 4),
  label('sugar', '#3f7d2c', 5),
] as const)

const atlasEntryById = new Map(
  SOAP_LABEL_ATLAS_ENTRIES.map((entry) => [entry.id, entry]),
)

export function getSoapLabelAtlasEntry(id: SoapId) {
  const entry = atlasEntryById.get(id)
  if (!entry) {
    throw new Error(`Missing SOAP label atlas entry for ${id}.`)
  }
  return entry
}

export function loadSoapLabelFont() {
  return loadProductLabelFont()
}

/**
 * Creates one procedural atlas after the bundled Fredoka face is ready. Decal
 * geometry remaps its UVs to one cell, so every active Soap label shares one
 * texture and one smooth display face.
 */
export function createSoapLabelAtlasTexture() {
  if (typeof document === 'undefined') {
    throw new Error('SOAP label textures require a browser document.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = SOAP_LABEL_ATLAS_WIDTH
  canvas.height = SOAP_LABEL_ATLAS_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create the SOAP label atlas.')
  }

  const cellWidth =
    SOAP_LABEL_ATLAS_WIDTH / SOAP_LABEL_ATLAS_COLUMNS
  const cellHeight =
    SOAP_LABEL_ATLAS_HEIGHT / SOAP_LABEL_ATLAS_ROWS
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  for (const entry of SOAP_LABEL_ATLAS_ENTRIES) {
    const column = entry.atlasSlot % SOAP_LABEL_ATLAS_COLUMNS
    const row = Math.floor(
      entry.atlasSlot / SOAP_LABEL_ATLAS_COLUMNS,
    )
    const centerX = column * cellWidth + cellWidth / 2
    const centerY = row * cellHeight + cellHeight / 2

    context.save()
    context.font =
      `600 88px "${SOAP_LABEL_FONT_FAMILY}", ` +
      '"Arial Rounded MT", sans-serif'
    context.fillStyle = entry.inkColor
    context.fillText(
      entry.text,
      centerX,
      centerY,
      cellWidth * 0.72,
    )
    context.restore()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.name = 'soap-label-atlas'
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = 4
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export async function createSoapLabelAtlasTextureAsync() {
  await loadSoapLabelFont()
  return createSoapLabelAtlasTexture()
}
