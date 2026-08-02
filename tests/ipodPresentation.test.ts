import { describe, expect, it } from 'vitest'
import {
  createIpodBodyGeometry,
  getResponsiveIpodCameraPose,
  IPOD_COMPLEMENTARY_PINK,
  IPOD_MENU_ITEMS,
  IPOD_MINI_BODY,
  IPOD_MINI_SCREEN,
  IPOD_MINI_WHEEL,
  IPOD_PRESENTATION_SCALE,
} from '../src/scene/ipod'

describe('iPod mini presentation', () => {
  it('uses a smooth slot cross-section with a square front silhouette', () => {
    const geometry = createIpodBodyGeometry({
      width: IPOD_MINI_BODY.width,
      height: IPOD_MINI_BODY.height,
      depth: IPOD_MINI_BODY.depth,
      sideSegments: 16,
    })
    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox
    expect(bounds).not.toBeNull()
    expect(bounds?.min.x).toBeCloseTo(-IPOD_MINI_BODY.width / 2, 5)
    expect(bounds?.max.x).toBeCloseTo(IPOD_MINI_BODY.width / 2, 5)
    expect(bounds?.min.y).toBeCloseTo(-IPOD_MINI_BODY.height / 2, 5)
    expect(bounds?.max.y).toBeCloseTo(IPOD_MINI_BODY.height / 2, 5)
    expect(bounds?.min.z).toBeCloseTo(-IPOD_MINI_BODY.depth / 2, 5)
    expect(bounds?.max.z).toBeCloseTo(IPOD_MINI_BODY.depth / 2, 5)

    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')
    let hasCurvedSideNormal = false
    let hasHardTopNormal = false
    for (let index = 0; index < positions.count; index += 1) {
      const normalX = normals.getX(index)
      const normalY = normals.getY(index)
      const normalZ = normals.getZ(index)
      hasCurvedSideNormal ||=
        Math.abs(normalX) > 0.1 && Math.abs(normalZ) > 0.1
      hasHardTopNormal ||=
        normalY === 1 &&
        Math.abs(positions.getY(index) - IPOD_MINI_BODY.height / 2) <
          1e-5
    }
    expect(hasCurvedSideNormal).toBe(true)
    expect(hasHardTopNormal).toBe(true)
    geometry.dispose()
  })

  it('uses the first-generation iPod mini proportions and menu', () => {
    expect(IPOD_MINI_BODY).toMatchObject({
      width: 2,
      height: 3.6,
      depth: 0.54,
      radius: 0,
    })
    expect(IPOD_MINI_SCREEN.radius).toBe(0)
    expect(IPOD_PRESENTATION_SCALE).toBe(0.75)
    expect(IPOD_COMPLEMENTARY_PINK).toBe('#ff1493')
    expect(IPOD_MINI_SCREEN.width / IPOD_MINI_SCREEN.height).toBeCloseTo(
      138 / 110,
      1,
    )
    expect(IPOD_MINI_WHEEL.radius).toBeLessThan(
      IPOD_MINI_BODY.width / 2,
    )
    expect(IPOD_MENU_ITEMS).toEqual([
      'Playlists',
      'Browse',
      'Extras',
      'Settings',
      'Backlight',
    ])
  })

  it('fits portrait and landscape viewports without changing target', () => {
    const portrait = getResponsiveIpodCameraPose(390, 844)
    const landscape = getResponsiveIpodCameraPose(1280, 720)
    expect(portrait.position[2]).toBeGreaterThan(landscape.position[2])
    expect(portrait.target).toEqual(landscape.target)
  })
})
