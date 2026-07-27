import type {
  EventManager,
  RootStore,
} from '@react-three/fiber'
import { describe, expect, it } from 'vitest'
import { createSquishyPointerEvents } from '../src/scene/createSquishyPointerEvents'

type ListenerRecord = {
  listener: EventListener
  options?: AddEventListenerOptions | boolean
}

class RecordingTarget {
  readonly listeners = new Map<string, ListenerRecord>()

  addEventListener(
    name: string,
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ) {
    this.listeners.set(name, { listener, options })
  }

  removeEventListener(name: string, listener: EventListener) {
    if (this.listeners.get(name)?.listener === listener) {
      this.listeners.delete(name)
    }
  }
}

function createEventManagerHarness() {
  const state: {
    events?: EventManager<HTMLElement>
    set: (updater: (current: typeof state) => Partial<typeof state>) => void
  } = {
    set: (updater) => Object.assign(state, updater(state)),
  }
  const store = {
    getState: () => state,
  } as unknown as RootStore
  const manager = createSquishyPointerEvents(store)
  state.events = manager
  return manager
}

describe('squishy pointer events', () => {
  it('keeps pointerdown cancelable without making the canvas a click target', () => {
    const manager = createEventManagerHarness()
    const target = new RecordingTarget()

    manager.connect?.(target as unknown as HTMLElement)

    expect(target.listeners.has('click')).toBe(false)
    expect(target.listeners.has('contextmenu')).toBe(false)
    expect(target.listeners.has('dblclick')).toBe(false)
    expect(target.listeners.has('wheel')).toBe(false)
    expect(target.listeners.get('pointerdown')?.options).toEqual({
      passive: false,
    })
    expect(target.listeners.get('pointermove')?.options).toEqual({
      passive: true,
    })

    const nextTarget = new RecordingTarget()
    manager.connect?.(nextTarget as unknown as HTMLElement)
    expect(target.listeners.size).toBe(0)
    expect(nextTarget.listeners.has('click')).toBe(false)
    expect(nextTarget.listeners.get('pointerdown')?.options).toEqual({
      passive: false,
    })

    manager.disconnect?.()
    expect(nextTarget.listeners.size).toBe(0)
  })
})
