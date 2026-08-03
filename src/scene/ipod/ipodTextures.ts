import * as THREE from 'three'
import { IPOD_MENU_ITEMS } from './ipodDefinition'

const SCREEN_WIDTH = 138
const SCREEN_HEIGHT = 110

function createCanvasTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

function drawBattery(context: CanvasRenderingContext2D) {
  context.strokeStyle = '#303541'
  context.lineWidth = 1
  context.strokeRect(119.5, 4.5, 13, 7)
  context.fillStyle = '#303541'
  context.fillRect(133, 6.5, 1.5, 3)
  context.fillRect(121.5, 6.5, 8.5, 3)
}

function drawChevron(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  context.beginPath()
  context.moveTo(x - 2, y - 4)
  context.lineTo(x + 2, y)
  context.lineTo(x - 2, y + 4)
  context.stroke()
}

export function createIpodScreenTexture(selectedIndex: number) {
  const canvas = document.createElement('canvas')
  canvas.width = SCREEN_WIDTH
  canvas.height = SCREEN_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create iPod screen texture')
  }

  const texture = createCanvasTexture(canvas)
  updateIpodScreenTexture(texture, selectedIndex)
  return texture
}

export function updateIpodScreenTexture(
  texture: THREE.CanvasTexture,
  selectedIndex: number,
) {
  const canvas = texture.image as HTMLCanvasElement
  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  const safeIndex = Math.min(
    IPOD_MENU_ITEMS.length - 1,
    Math.max(0, Math.round(selectedIndex)),
  )
  context.imageSmoothingEnabled = false
  context.fillStyle = '#d9e1e7'
  context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
  context.fillStyle = '#303541'
  context.font = 'bold 12px Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('iPod', 69, 9)
  drawBattery(context)
  context.fillStyle = '#80859a'
  context.fillRect(0, 17, SCREEN_WIDTH, 1)

  const rowHeight = 18.4
  const rowTop = 18 + safeIndex * rowHeight
  context.fillStyle = '#686990'
  context.fillRect(1, rowTop, SCREEN_WIDTH - 2, rowHeight)

  context.font = 'bold 13px Arial, sans-serif'
  context.textAlign = 'left'
  context.lineWidth = 2
  IPOD_MENU_ITEMS.forEach((item, index) => {
    const y = 18 + index * rowHeight + rowHeight / 2
    const selected = index === safeIndex
    context.fillStyle = selected ? '#f4f6f7' : '#303541'
    context.strokeStyle = selected ? '#f4f6f7' : '#303541'
    context.fillText(item, 7, y + 0.5)
    drawChevron(context, 130, y)
  })

  texture.needsUpdate = true
}
