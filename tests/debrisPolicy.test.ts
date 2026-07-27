import { describe, expect, it } from 'vitest'
import {
  DESKTOP_DEBRIS_BODY_LIMIT,
  MOBILE_DEBRIS_BODY_LIMIT,
  resolveDebrisBodyLimit,
} from '../src/scene/fracture/RapierDebris'

describe('Rapier debris body policy', () => {
  it('uses device-specific safety ceilings by default', () => {
    expect(resolveDebrisBodyLimit(true)).toBe(MOBILE_DEBRIS_BODY_LIMIT)
    expect(resolveDebrisBodyLimit(false)).toBe(DESKTOP_DEBRIS_BODY_LIMIT)
  })

  it('allows lower budgets but never exceeds a device ceiling', () => {
    expect(resolveDebrisBodyLimit(true, 12)).toBe(12)
    expect(resolveDebrisBodyLimit(true, 100)).toBe(MOBILE_DEBRIS_BODY_LIMIT)
    expect(resolveDebrisBodyLimit(false, 100)).toBe(DESKTOP_DEBRIS_BODY_LIMIT)
  })

  it('normalizes fractional, negative, and invalid overrides', () => {
    expect(resolveDebrisBodyLimit(false, 10.9)).toBe(10)
    expect(resolveDebrisBodyLimit(false, -4)).toBe(0)
    expect(resolveDebrisBodyLimit(false, Number.NaN)).toBe(
      DESKTOP_DEBRIS_BODY_LIMIT,
    )
  })
})
