import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  CLICKER_BACKPLATE,
  CLICKER_CLEAR_HOUSING_MATERIAL,
  CLICKER_CLEAR_INSERT_MATERIAL,
  CLICKER_HOUSING,
  CLICKER_INNER_GROOVE,
  CLICKER_KEY_COUNT,
  CLICKER_KEY_COLORS,
  CLICKER_KEY_FACE,
  CLICKER_KEY_FACE_MATERIAL,
  CLICKER_KEY_SHELL,
  CLICKER_KEY_SHELL_MATERIAL,
  CLICKER_KEYS,
  CLICKER_SOCKET,
  createClickerHousingGeometry,
  createRoundedFrameGeometry,
  createClickerSynesthesiaTheme,
  getClickerKeyPosition,
  getResponsiveClickerCameraPose,
} from '../src/scene/clicker'
import { createRoundedCuboidGeometry } from '../src/scene/createRoundedCuboidGeometry'

function triangleCount(geometry: THREE.BufferGeometry) {
  return geometry.getIndex()
    ? geometry.getIndex()!.count / 3
    : geometry.getAttribute('position').count / 3
}

describe('clicker definition', () => {
  it('uses nine evenly spaced keys in the reference neon layout', () => {
    expect(CLICKER_KEY_COUNT).toBe(9)
    expect(CLICKER_KEYS.map(({ id }) => id)).toEqual([
      'lime',
      'magenta',
      'cyan',
      'purple',
      'orange',
      'yellow',
      'pink',
      'blue',
      'green',
    ])
    expect(CLICKER_KEYS.map(({ color }) => color)).toEqual([
      '#93F504',
      '#FC04B0',
      '#02E9E3',
      '#9402FB',
      '#FD7802',
      '#FDEB03',
      '#FB0371',
      '#00C8F9',
      '#68F601',
    ])
    expect(new Set(CLICKER_KEY_COLORS).size).toBe(9)
    expect(getClickerKeyPosition(0)[1]).toBeGreaterThan(0)
    expect(getClickerKeyPosition(4)).toEqual([0, 0, 0])
    expect(getClickerKeyPosition(8)[1]).toBeLessThan(0)
    expect(() => getClickerKeyPosition(9)).toThrow(
      'Clicker key index must be between 0 and 8',
    )
  })

  it('defines clear acrylic housing and glossy resin key materials', () => {
    expect(CLICKER_CLEAR_HOUSING_MATERIAL).toMatchObject({
      transmission: 0,
      opacity: 0.23,
      transparent: true,
      roughness: 0.065,
      ior: 1.49,
      clearcoat: 1,
    })
    expect(CLICKER_CLEAR_INSERT_MATERIAL.transmission).toBe(0)
    expect(CLICKER_KEY_SHELL_MATERIAL).toMatchObject({
      transparent: true,
      clearcoat: 1,
    })
    expect(CLICKER_KEY_SHELL_MATERIAL.transmission).toBe(0)
    expect(CLICKER_KEY_FACE_MATERIAL.transmission).toBe(0)
    expect(CLICKER_KEY_FACE_MATERIAL.clearcoat).toBe(1)
  })

  it('derives a reproducible palette-loop theme from the experience seed', () => {
    const first = createClickerSynesthesiaTheme(0x12345678)
    const second = createClickerSynesthesiaTheme(0x12345678)
    const different = createClickerSynesthesiaTheme(0x87654321)

    expect(first).toEqual(second)
    expect(first.seed).not.toBe(different.seed)
    expect(first.colorLoop?.colors).toEqual(CLICKER_KEY_COLORS)
    expect(Object.isFrozen(first.colorLoop?.colors)).toBe(true)
  })

  it('keeps the inner groove concentric with the molded housing', () => {
    expect(CLICKER_INNER_GROOVE.width).toBeCloseTo(
      CLICKER_HOUSING.width - CLICKER_INNER_GROOVE.inset * 2,
    )
    expect(CLICKER_INNER_GROOVE.height).toBeCloseTo(
      CLICKER_HOUSING.height - CLICKER_INNER_GROOVE.inset * 2,
    )
    expect(CLICKER_INNER_GROOVE.radius).toBeCloseTo(
      CLICKER_HOUSING.radius - CLICKER_INNER_GROOVE.inset,
    )
    expect(CLICKER_INNER_GROOVE.radius).toBeGreaterThan(0)
  })

  it('uses genuinely open rounded frames for the housing and nine sockets', () => {
    const housing = createClickerHousingGeometry()
    const socket = createRoundedFrameGeometry({
      width: CLICKER_SOCKET.width,
      height: CLICKER_SOCKET.height,
      depth: CLICKER_SOCKET.depth,
      radius: CLICKER_SOCKET.radius,
      frameWidth: CLICKER_SOCKET.frameWidth,
    })
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    const housingMesh = new THREE.Mesh(housing, material)
    const socketMesh = new THREE.Mesh(socket, material)
    const raycaster = new THREE.Raycaster()
    const direction = new THREE.Vector3(0, 0, -1)

    try {
      for (const mesh of [housingMesh, socketMesh]) {
        mesh.updateMatrixWorld(true)
        raycaster.set(new THREE.Vector3(0, 0, 2), direction)
        expect(raycaster.intersectObject(mesh)).toHaveLength(0)
      }

      raycaster.set(
        new THREE.Vector3(
          CLICKER_HOUSING.width / 2 - CLICKER_HOUSING.frameWidth / 2,
          0,
          2,
        ),
        direction,
      )
      expect(raycaster.intersectObject(housingMesh).length).toBeGreaterThan(0)

      raycaster.set(
        new THREE.Vector3(
          CLICKER_SOCKET.width / 2 - CLICKER_SOCKET.frameWidth / 2,
          0,
          2,
        ),
        direction,
      )
      expect(raycaster.intersectObject(socketMesh).length).toBeGreaterThan(0)
    } finally {
      housing.dispose()
      socket.dispose()
      material.dispose()
    }
  })

  it('keeps the complete procedural device below the triangle budget', () => {
    const housing = createClickerHousingGeometry()
    const backplate = createRoundedCuboidGeometry({
      width: CLICKER_BACKPLATE.width,
      height: CLICKER_BACKPLATE.height,
      depth: CLICKER_BACKPLATE.depth,
      radius: CLICKER_BACKPLATE.radius,
      widthSegments: 6,
      heightSegments: 6,
      depthSegments: 1,
    })
    const keyShell = createRoundedCuboidGeometry({
      width: CLICKER_KEY_SHELL.size,
      height: CLICKER_KEY_SHELL.size,
      depth: CLICKER_KEY_SHELL.depth,
      radius: CLICKER_KEY_SHELL.radius,
      widthSegments: 5,
      heightSegments: 5,
      depthSegments: 2,
    })
    const keyFace = createRoundedCuboidGeometry({
      width: CLICKER_KEY_FACE.size,
      height: CLICKER_KEY_FACE.size,
      depth: CLICKER_KEY_FACE.depth,
      radius: CLICKER_KEY_FACE.radius,
      widthSegments: 6,
      heightSegments: 6,
      depthSegments: 3,
    })
    const socket = createRoundedFrameGeometry({
      width: CLICKER_SOCKET.width,
      height: CLICKER_SOCKET.height,
      depth: CLICKER_SOCKET.depth,
      radius: CLICKER_SOCKET.radius,
      frameWidth: CLICKER_SOCKET.frameWidth,
      curveSegments: 5,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      bevelSegments: 1,
    })
    const stem = createRoundedCuboidGeometry({
      width: 0.48,
      height: 0.48,
      depth: 0.34,
      radius: 0.09,
      widthSegments: 2,
      heightSegments: 2,
      depthSegments: 1,
    })

    try {
      const triangles =
        triangleCount(housing) +
        triangleCount(backplate) +
        triangleCount(keyShell) * 9 +
        triangleCount(keyFace) * 9 +
        triangleCount(socket) * 9 +
        triangleCount(stem) * 9
      expect(triangles).toBeLessThanOrEqual(12_000)
    } finally {
      housing.dispose()
      backplate.dispose()
      keyShell.dispose()
      keyFace.dispose()
      socket.dispose()
      stem.dispose()
    }
  })

  it('fits the full square housing in portrait and landscape cameras', () => {
    for (const [width, height] of [
      [280, 560],
      [390, 844],
      [844, 390],
      [1440, 900],
    ]) {
      const pose = getResponsiveClickerCameraPose(width, height)
      const camera = new THREE.PerspectiveCamera(
        32,
        width / height,
        0.1,
        100,
      )
      camera.position.fromArray(pose.position)
      camera.lookAt(...pose.target)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      for (const x of [-CLICKER_HOUSING.width / 2, CLICKER_HOUSING.width / 2]) {
        for (const y of [
          -CLICKER_HOUSING.height / 2,
          CLICKER_HOUSING.height / 2,
        ]) {
          const projected = new THREE.Vector3(x, y, 0).project(camera)
          expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.9)
          expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.9)
        }
      }
    }
  })
})
