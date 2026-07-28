import * as THREE from 'three'
import type {
  SoapAtlasUvBounds,
  SoapId,
} from './types'

export const SOAP_LABEL_ATLAS_COLUMNS = 4
export const SOAP_LABEL_ATLAS_ROWS = 2
export const SOAP_LABEL_ATLAS_WIDTH = 1_024
export const SOAP_LABEL_ATLAS_HEIGHT = 512

const CELL_UV_PADDING = 0.055

export type SoapLabelAtlasEntry = Readonly<{
  id: SoapId
  title: string
  subtitle: string
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
  const invertedRow =
    SOAP_LABEL_ATLAS_ROWS - row - 1
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
  title: string,
  subtitle: string,
  inkColor: string,
  atlasSlot: number,
): SoapLabelAtlasEntry {
  return Object.freeze({
    id,
    title,
    subtitle,
    inkColor,
    atlasSlot,
    atlasUvBounds: createAtlasUvBounds(atlasSlot),
  })
}

export const SOAP_LABEL_ATLAS_ENTRIES = Object.freeze([
  label('hard-wax', 'HARD WAX', 'PRESS & CRACK', '#5a160d', 0),
  label('plaster', 'PLASTER', 'DRY CAST', '#f5f8ff', 1),
  label('soft-wax', 'SOFT WAX', 'SLOW MELT', '#583100', 2),
  label('nail-polish', 'NAIL POLISH', 'HIGH GLOSS', '#fff3f9', 3),
  label('jelly', 'JELLY', 'WOBBLE BAR', '#003f39', 4),
  label('sprinkles', 'SPRINKLES', 'PARTY CRUNCH', '#fff6ff', 5),
  label('slime', 'SLIME', 'EXTRA GOO', '#153900', 6),
  label('sugar', 'SUGAR', 'SWEET CRYSTAL', '#00394f', 7),
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

function resolveTitleFontSize(title: string) {
  if (title.length >= 11) {
    return 31
  }
  if (title.length >= 9) {
    return 36
  }
  return 43
}

/**
 * Creates one procedural atlas for every soap label. Decal geometry remaps its
 * UVs to one cell, so all active soap label passes can share this texture.
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
    const top = row * cellHeight

    context.save()
    context.fillStyle = entry.inkColor
    context.globalAlpha = 0.78
    context.font =
      '800 18px "Arial Narrow", "Roboto Condensed", sans-serif'
    context.fillText('SOAP', centerX, top + cellHeight * 0.24)

    context.globalAlpha = 1
    context.font =
      `900 ${resolveTitleFontSize(entry.title)}px ` +
      '"Arial Narrow", "Roboto Condensed", sans-serif'
    context.fillText(
      entry.title,
      centerX,
      top + cellHeight * 0.49,
      cellWidth * 0.82,
    )

    context.globalAlpha = 0.72
    context.font =
      '700 15px "Arial Narrow", "Roboto Condensed", sans-serif'
    context.fillText(
      entry.subtitle,
      centerX,
      top + cellHeight * 0.71,
      cellWidth * 0.75,
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
