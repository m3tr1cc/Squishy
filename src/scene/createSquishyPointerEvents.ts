import {
  events as createPointerEvents,
  type RootStore,
} from '@react-three/fiber'

const UNUSED_CANVAS_EVENTS = [
  ['click', 'onClick'],
  ['contextmenu', 'onContextMenu'],
  ['dblclick', 'onDoubleClick'],
  ['wheel', 'onWheel'],
] as const

/**
 * Keeps the R3F pointer pipeline while preventing the full-screen canvas
 * wrapper from being classified as a native click target on touch browsers.
 */
export function createSquishyPointerEvents(store: RootStore) {
  const manager = createPointerEvents(store)
  const connectDefaultEvents = manager.connect

  manager.connect = (target) => {
    connectDefaultEvents?.(target)

    const handlers = manager.handlers
    if (!handlers) {
      return
    }

    for (const [domEventName, handlerName] of UNUSED_CANVAS_EVENTS) {
      const handler = handlers[handlerName]
      if (handler) {
        target.removeEventListener(
          domEventName,
          handler as unknown as EventListener,
        )
      }
    }

    const pointerDown = handlers.onPointerDown
    if (pointerDown) {
      target.removeEventListener(
        'pointerdown',
        pointerDown as unknown as EventListener,
      )
      target.addEventListener(
        'pointerdown',
        pointerDown as unknown as EventListener,
        { passive: false },
      )
    }
  }

  return manager
}
