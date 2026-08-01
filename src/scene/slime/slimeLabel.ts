import * as THREE from 'three'
import {
  PRODUCT_LABEL_FONT_FAMILY,
  loadProductLabelFont,
} from '../labels/productLabelFont'
import {
  SLIME_CONTAINER_BASE_Y,
  SLIME_CONTAINER_RADIUS,
} from './slimeGeometry'

const LABEL_WIDTH_SEGMENTS = 24
const LABEL_HEIGHT_SEGMENTS = 6
const LABEL_HALF_ANGLE = 0.66
export const SLIME_LABEL_CENTER_ANGLE = Math.atan2(0.49, 0.8)
const LABEL_BOTTOM_Y = SLIME_CONTAINER_BASE_Y + 0.42
const LABEL_TOP_Y = SLIME_CONTAINER_BASE_Y + 1.32

export function createSlimeLabelGeometry() {
  const vertices: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const radius = SLIME_CONTAINER_RADIUS + 0.045

  for (let row = 0; row <= LABEL_HEIGHT_SEGMENTS; row += 1) {
    const v = row / LABEL_HEIGHT_SEGMENTS
    const y = THREE.MathUtils.lerp(LABEL_BOTTOM_Y, LABEL_TOP_Y, v)
    for (let column = 0; column <= LABEL_WIDTH_SEGMENTS; column += 1) {
      const u = column / LABEL_WIDTH_SEGMENTS
      const angle =
        SLIME_LABEL_CENTER_ANGLE +
        THREE.MathUtils.lerp(-LABEL_HALF_ANGLE, LABEL_HALF_ANGLE, u)
      vertices.push(
        Math.sin(angle) * radius,
        y,
        Math.cos(angle) * radius,
      )
      uvs.push(u, v)
    }
  }

  const stride = LABEL_WIDTH_SEGMENTS + 1
  for (let row = 0; row < LABEL_HEIGHT_SEGMENTS; row += 1) {
    for (let column = 0; column < LABEL_WIDTH_SEGMENTS; column += 1) {
      const a = row * stride + column
      const b = a + 1
      const c = a + stride
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  )
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.name = 'slime-label'
  return geometry
}

export function createSlimeLabelTexture() {
  if (typeof document === 'undefined') {
    throw new Error('Slime label textures require a browser document.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 384
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create the slime label texture.')
  }
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font =
    `600 220px "${PRODUCT_LABEL_FONT_FAMILY}", ` +
    '"Arial Rounded MT", sans-serif'
  context.fillStyle = '#7b214d'
  context.fillText('slime', canvas.width / 2, canvas.height / 2 + 8, 780)

  const texture = new THREE.CanvasTexture(canvas)
  texture.name = 'slime-label-texture'
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 4
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export async function createSlimeLabelTextureAsync() {
  await loadProductLabelFont()
  return createSlimeLabelTexture()
}
