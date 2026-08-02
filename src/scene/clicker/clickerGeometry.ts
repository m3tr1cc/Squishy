import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  CLICKER_HOUSING,
  CLICKER_INNER_GROOVE,
} from './clickerDefinition'

export type RoundedFrameGeometryOptions = Readonly<{
  width: number
  height: number
  depth: number
  radius: number
  frameWidth: number
  curveSegments?: number
  bevelSize?: number
  bevelThickness?: number
  bevelSegments?: number
}>

function addRoundedRectangle(
  path: THREE.Path,
  width: number,
  height: number,
  radius: number,
  clockwise: boolean,
) {
  const halfWidth = width / 2
  const halfHeight = height / 2

  if (!clockwise) {
    path.moveTo(-halfWidth + radius, -halfHeight)
    path.lineTo(halfWidth - radius, -halfHeight)
    path.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius)
    path.lineTo(halfWidth, halfHeight - radius)
    path.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight)
    path.lineTo(-halfWidth + radius, halfHeight)
    path.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius)
    path.lineTo(-halfWidth, -halfHeight + radius)
    path.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight)
    return
  }

  path.moveTo(-halfWidth + radius, -halfHeight)
  path.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth, -halfHeight + radius)
  path.lineTo(-halfWidth, halfHeight - radius)
  path.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth + radius, halfHeight)
  path.lineTo(halfWidth - radius, halfHeight)
  path.quadraticCurveTo(halfWidth, halfHeight, halfWidth, halfHeight - radius)
  path.lineTo(halfWidth, -halfHeight + radius)
  path.quadraticCurveTo(halfWidth, -halfHeight, halfWidth - radius, -halfHeight)
  path.lineTo(-halfWidth + radius, -halfHeight)
}

export function createRoundedFrameGeometry({
  width,
  height,
  depth,
  radius,
  frameWidth,
  curveSegments = 8,
  bevelSize = 0.025,
  bevelThickness = 0.025,
  bevelSegments = 2,
}: RoundedFrameGeometryOptions) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(depth) ||
    !Number.isFinite(radius) ||
    !Number.isFinite(frameWidth) ||
    width <= 0 ||
    height <= 0 ||
    depth <= 0 ||
    frameWidth <= 0 ||
    frameWidth * 2 >= Math.min(width, height)
  ) {
    throw new Error('Rounded frame dimensions must define a positive open frame.')
  }

  const maximumOuterRadius = Math.min(width, height) / 2
  const safeOuterRadius = THREE.MathUtils.clamp(
    radius,
    0.001,
    maximumOuterRadius - 0.001,
  )
  const innerWidth = width - frameWidth * 2
  const innerHeight = height - frameWidth * 2
  const innerRadius = THREE.MathUtils.clamp(
    safeOuterRadius - frameWidth,
    0.001,
    Math.min(innerWidth, innerHeight) / 2 - 0.001,
  )
  const shape = new THREE.Shape()
  addRoundedRectangle(shape, width, height, safeOuterRadius, false)
  const hole = new THREE.Path()
  addRoundedRectangle(hole, innerWidth, innerHeight, innerRadius, true)
  shape.holes.push(hole)

  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: bevelSize > 0 || bevelThickness > 0,
    bevelSegments,
    bevelSize,
    bevelThickness,
    curveSegments,
    depth,
    steps: 1,
  })
  geometry.center()
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function createClickerHousingGeometry() {
  const outerFrame = createRoundedFrameGeometry({
    width: CLICKER_HOUSING.width,
    height: CLICKER_HOUSING.height,
    depth: CLICKER_HOUSING.depth,
    radius: CLICKER_HOUSING.radius,
    frameWidth: CLICKER_HOUSING.frameWidth,
    bevelSize: 0.055,
    bevelThickness: 0.055,
    bevelSegments: 3,
  })
  const innerFrame = createRoundedFrameGeometry({
    width: CLICKER_INNER_GROOVE.width,
    height: CLICKER_INNER_GROOVE.height,
    depth: CLICKER_INNER_GROOVE.depth,
    radius: CLICKER_INNER_GROOVE.radius,
    frameWidth: CLICKER_INNER_GROOVE.frameWidth,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    bevelSegments: 2,
  })
  innerFrame.translate(0, 0, CLICKER_INNER_GROOVE.z)
  const housing = mergeGeometries([outerFrame, innerFrame], false)
  outerFrame.dispose()
  innerFrame.dispose()

  if (!housing) {
    throw new Error('Unable to merge clicker acrylic rim geometry.')
  }
  housing.computeBoundingBox()
  housing.computeBoundingSphere()
  return housing
}
