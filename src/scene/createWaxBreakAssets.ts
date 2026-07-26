import * as THREE from 'three'

function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function vertex(
  positions: number[],
  x: number,
  y: number,
  z: number,
) {
  positions.push(x, y, z)
}

function triangle(
  positions: number[],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
) {
  vertex(positions, ...a)
  vertex(positions, ...b)
  vertex(positions, ...c)
}

function quad(
  positions: number[],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  d: readonly [number, number, number],
) {
  triangle(positions, a, b, c)
  triangle(positions, a, c, d)
}

export function createWaxShardGeometry(seed: number) {
  const random = createRandom(seed)
  const positions: number[] = []
  const shardCount = 7

  for (let index = 0; index < shardCount; index += 1) {
    const centerAngle = (index / shardCount) * Math.PI * 2 + (random() - 0.5) * 0.18
    const halfAngle = Math.PI / shardCount * (0.7 + random() * 0.17)
    const innerRadius = 0.105 + random() * 0.035
    const outerRadius = 0.36 + random() * 0.16
    const innerLift = 0.07 + random() * 0.055
    const outerLift = 0.012 + random() * 0.025
    const thickness = 0.035 + random() * 0.012
    const leftAngle = centerAngle - halfAngle
    const rightAngle = centerAngle + halfAngle

    const topInnerLeft = [
      Math.cos(leftAngle) * innerRadius,
      Math.sin(leftAngle) * innerRadius,
      innerLift,
    ] as const
    const topInnerRight = [
      Math.cos(rightAngle) * innerRadius,
      Math.sin(rightAngle) * innerRadius,
      innerLift * (0.9 + random() * 0.12),
    ] as const
    const topOuterRight = [
      Math.cos(rightAngle) * outerRadius,
      Math.sin(rightAngle) * outerRadius,
      outerLift,
    ] as const
    const topOuterLeft = [
      Math.cos(leftAngle) * outerRadius * (0.9 + random() * 0.12),
      Math.sin(leftAngle) * outerRadius * (0.9 + random() * 0.12),
      outerLift * (0.8 + random() * 0.25),
    ] as const

    const bottomInnerLeft = [
      topInnerLeft[0],
      topInnerLeft[1],
      topInnerLeft[2] - thickness,
    ] as const
    const bottomInnerRight = [
      topInnerRight[0],
      topInnerRight[1],
      topInnerRight[2] - thickness,
    ] as const
    const bottomOuterRight = [
      topOuterRight[0],
      topOuterRight[1],
      topOuterRight[2] - thickness,
    ] as const
    const bottomOuterLeft = [
      topOuterLeft[0],
      topOuterLeft[1],
      topOuterLeft[2] - thickness,
    ] as const

    quad(positions, topInnerLeft, topInnerRight, topOuterRight, topOuterLeft)
    quad(
      positions,
      bottomOuterLeft,
      bottomOuterRight,
      bottomInnerRight,
      bottomInnerLeft,
    )
    quad(
      positions,
      topInnerRight,
      topInnerLeft,
      bottomInnerLeft,
      bottomInnerRight,
    )
    quad(
      positions,
      topOuterLeft,
      topOuterRight,
      bottomOuterRight,
      bottomOuterLeft,
    )
    quad(
      positions,
      topInnerLeft,
      topOuterLeft,
      bottomOuterLeft,
      bottomInnerLeft,
    )
    quad(
      positions,
      topOuterRight,
      topInnerRight,
      bottomInnerRight,
      bottomOuterRight,
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function createCrackTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Could not create the wax crack texture.')
  }

  const random = createRandom(71839)
  const center = canvas.width / 2
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.lineCap = 'round'
  context.lineJoin = 'round'

  context.beginPath()
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2
    const radius = 42 + random() * 18
    const x = center + Math.cos(angle) * radius
    const y = center + Math.sin(angle) * radius
    if (index === 0) {
      context.moveTo(x, y)
    } else {
      context.lineTo(x, y)
    }
  }
  context.closePath()
  context.fillStyle = 'rgba(209, 153, 35, 0.94)'
  context.fill()

  for (let index = 0; index < 11; index += 1) {
    const angle = (index / 11) * Math.PI * 2 + (random() - 0.5) * 0.25
    const length = 132 + random() * 88
    const startRadius = 32 + random() * 18
    let x = center + Math.cos(angle) * startRadius
    let y = center + Math.sin(angle) * startRadius

    context.beginPath()
    context.moveTo(x, y)
    const points = 4
    for (let point = 1; point <= points; point += 1) {
      const distance = startRadius + (length * point) / points
      const sideways = (random() - 0.5) * 22
      x = center + Math.cos(angle) * distance - Math.sin(angle) * sideways
      y = center + Math.sin(angle) * distance + Math.cos(angle) * sideways
      context.lineTo(x, y)
    }
    context.strokeStyle = 'rgba(91, 56, 20, 0.86)'
    context.lineWidth = 5.5 - random() * 1.5
    context.stroke()

    if (index % 2 === 0) {
      const branchDistance = startRadius + length * (0.45 + random() * 0.2)
      const branchX = center + Math.cos(angle) * branchDistance
      const branchY = center + Math.sin(angle) * branchDistance
      const branchAngle = angle + (random() > 0.5 ? 0.46 : -0.46)
      context.beginPath()
      context.moveTo(branchX, branchY)
      context.lineTo(
        branchX + Math.cos(branchAngle) * length * 0.28,
        branchY + Math.sin(branchAngle) * length * 0.28,
      )
      context.lineWidth = 3
      context.stroke()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}
