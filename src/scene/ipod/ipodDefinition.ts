export const IPOD_MENU_ITEMS = Object.freeze([
  'Playlists',
  'Browse',
  'Extras',
  'Settings',
  'Backlight',
] as const)

export const IPOD_MENU_ITEM_COUNT = IPOD_MENU_ITEMS.length
export const IPOD_WHEEL_DEGREES_PER_MENU_STEP = 18.75

export const IPOD_MINI_BODY = Object.freeze({
  width: 2,
  height: 3.6,
  depth: 0.54,
  radius: 0.12,
})

export const IPOD_MINI_SCREEN = Object.freeze({
  width: 1.3,
  height: 1.01,
  y: 1.02,
})

export const IPOD_MINI_WHEEL = Object.freeze({
  radius: 0.72,
  centerRadius: 0.24,
  y: -0.66,
})

export const IPOD_GREEN = '#c7dd76'
export const IPOD_BACKGROUND_GREEN = '#b8cf68'

export function clampIpodMenuIndex(index: number) {
  return Math.min(
    IPOD_MENU_ITEM_COUNT - 1,
    Math.max(0, Math.round(index)),
  )
}

export function getResponsiveIpodCameraPose(
  width: number,
  height: number,
  fieldOfViewDegrees = 32,
) {
  const aspect = Math.max(0.25, width / Math.max(1, height))
  const verticalFov = (fieldOfViewDegrees * Math.PI) / 180
  const paddedHalfWidth = 1.02
  const paddedHalfHeight = 1.72
  const fitWidth =
    paddedHalfWidth / (Math.tan(verticalFov / 2) * aspect)
  const fitHeight = paddedHalfHeight / Math.tan(verticalFov / 2)
  const distance = Math.max(fitWidth, fitHeight) + 0.52

  return {
    position: [0, 0.02, distance] as const,
    target: [0, 0.02, 0] as const,
  }
}
