import { describe, expect, it } from 'vitest'
import {
  getResponsiveIpodCameraPose,
  IPOD_MENU_ITEMS,
  IPOD_MINI_BODY,
  IPOD_MINI_SCREEN,
  IPOD_MINI_WHEEL,
} from '../src/scene/ipod'

describe('iPod mini presentation', () => {
  it('uses the first-generation iPod mini proportions and menu', () => {
    expect(IPOD_MINI_BODY).toMatchObject({
      width: 2,
      height: 3.6,
      depth: 0.54,
    })
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
