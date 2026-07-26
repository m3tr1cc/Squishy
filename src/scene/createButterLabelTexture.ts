import * as THREE from 'three'

export function createButterLabelTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1536
  canvas.height = 420

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create the butter label texture.')
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#15516c'
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  context.font = '800 126px "Arial Narrow", "Roboto Condensed", sans-serif'
  context.fillText('4oz.', 350, 196)

  context.globalAlpha = 0.74
  context.font = '600 47px "Arial Narrow", "Roboto Condensed", sans-serif'
  context.fillText('NET WT. (113 G)', 350, 322)

  context.globalAlpha = 0.9
  context.font = '800 42px "Arial Narrow", "Roboto Condensed", sans-serif'
  context.fillText('SALTED', 1036, 72)

  context.globalAlpha = 1
  context.font = '900 128px "Arial Narrow", "Roboto Condensed", sans-serif'
  context.fillText('BUTTER', 1036, 220)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 8
  texture.needsUpdate = true

  return texture
}
