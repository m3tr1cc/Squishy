import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  SLIME_CROWN_Y,
  SLIME_INNER_RADIUS,
  SLIME_MAX_DENT_DEPTH,
  SLIME_MAX_GROWTH,
  SLIME_MAX_INTERACTIONS,
  SLIME_MAX_RADIAL_SPREAD,
  SLIME_RIM_Y,
  applySlimeInteraction,
  createSlimeInteractionRuntime,
  getSlimeGrowthProgress,
  getSlimeMixProgress,
  resetSlimeInteractionRuntime,
  sampleSlimeColor,
  sampleSlimeDisplacement,
} from '../src/scene/slime'

function sampleDisplacement(
  runtime: ReturnType<typeof createSlimeInteractionRuntime>,
  x: number,
  y: number,
  z: number,
) {
  const output = { x: 0, y: 0, z: 0 }
  sampleSlimeDisplacement(
    x,
    y,
    z,
    SLIME_RIM_Y,
    SLIME_CROWN_Y,
    SLIME_INNER_RADIUS,
    runtime,
    null,
    runtime.interactionCount,
    null,
    output,
  )
  return output
}

function sampleColor(
  runtime: ReturnType<typeof createSlimeInteractionRuntime>,
  x: number,
  y: number,
  z: number,
) {
  const output = { r: 0, g: 0, b: 0 }
  sampleSlimeColor(
    x,
    y,
    z,
    runtime,
    runtime.interactionCount,
    output,
  )
  return output
}

describe('slime interaction runtime', () => {
  it('uses decreasing growth increments and reaches its exact cap', () => {
    const progress = Array.from(
      { length: SLIME_MAX_INTERACTIONS + 1 },
      (_, count) => getSlimeGrowthProgress(count),
    )
    const increments = progress.slice(1).map(
      (value, index) => value - progress[index],
    )

    expect(progress[0]).toBe(0)
    expect(progress.at(-1)).toBeCloseTo(1, 8)
    expect(SLIME_MAX_INTERACTIONS).toBe(48)
    expect(getSlimeMixProgress(12)).toBeCloseTo(0.25, 8)
    expect(getSlimeGrowthProgress(12)).toBeGreaterThan(0.5)
    expect(getSlimeGrowthProgress(12)).toBeLessThan(0.6)
    for (let index = 1; index < increments.length; index += 1) {
      expect(increments[index]).toBeLessThan(increments[index - 1])
      expect(increments[index]).toBeGreaterThan(0)
    }
  })

  it('records forty-eight permanent impacts and rejects unbounded growth', () => {
    const runtime = createSlimeInteractionRuntime()
    for (let index = 0; index < SLIME_MAX_INTERACTIONS; index += 1) {
      const result = applySlimeInteraction(
        runtime,
        Math.sin(index) * 0.8,
        Math.cos(index) * 0.8,
      )
      expect(result.changedPermanently).toBe(true)
      expect(result.becameSaturated).toBe(
        index === SLIME_MAX_INTERACTIONS - 1,
      )
    }
    expect(applySlimeInteraction(runtime, 0, 0)).toMatchObject({
      changedPermanently: false,
      becameSaturated: false,
      interactionCount: SLIME_MAX_INTERACTIONS,
    })
    expect(getSlimeMixProgress(runtime.interactionCount)).toBe(1)
  })

  it('keeps a local dent while bounding crown growth and radial spread', () => {
    const pristine = createSlimeInteractionRuntime()
    const pressed = createSlimeInteractionRuntime()
    applySlimeInteraction(pressed, 0, 0)

    const pristineCenter = sampleDisplacement(
      pristine,
      0,
      SLIME_CROWN_Y,
      0,
    )
    const pressedCenter = sampleDisplacement(
      pressed,
      0,
      SLIME_CROWN_Y,
      0,
    )
    const repeated = sampleDisplacement(
      pressed,
      0,
      SLIME_CROWN_Y,
      0,
    )
    expect(pressedCenter.y).toBeLessThan(pristineCenter.y)
    expect(repeated).toEqual(pressedCenter)

    for (let index = 1; index < SLIME_MAX_INTERACTIONS; index += 1) {
      applySlimeInteraction(pressed, 0, 0)
    }
    const crown = sampleDisplacement(pressed, 0, SLIME_CROWN_Y, 0)
    const rim = sampleDisplacement(
      pressed,
      SLIME_INNER_RADIUS,
      SLIME_RIM_Y,
      0,
    )
    expect(crown.y).toBeLessThanOrEqual(SLIME_MAX_GROWTH)
    expect(crown.y).toBeGreaterThanOrEqual(-SLIME_MAX_DENT_DEPTH)
    expect(Math.hypot(rim.x, rim.z)).toBeLessThanOrEqual(
      SLIME_MAX_RADIAL_SPREAD,
    )
  })

  it('mixes locally before converging every vertex to one coral color', () => {
    const runtime = createSlimeInteractionRuntime()
    const orange = sampleColor(runtime, -1, 0, 0)
    const pink = sampleColor(runtime, 1, 0, 0)
    expect(orange.g).toBeGreaterThan(pink.g)
    expect(pink.b).toBeGreaterThan(orange.b)

    applySlimeInteraction(runtime, -1, 0)
    const locallyMixed = sampleColor(runtime, -1, 0, 0)
    expect(locallyMixed.g).toBeLessThan(orange.g)
    expect(locallyMixed.b).toBeGreaterThan(orange.b)

    for (let index = 1; index < 12; index += 1) {
      applySlimeInteraction(runtime, index % 2 === 0 ? -1 : 1, 0)
    }
    const quarterOrange = sampleColor(runtime, -1.4, 0.2, 0.3)
    const quarterPink = sampleColor(runtime, 1.4, -0.4, -0.2)
    expect(Math.abs(quarterOrange.g - quarterPink.g)).toBeGreaterThan(0.02)

    for (let index = 12; index < SLIME_MAX_INTERACTIONS; index += 1) {
      applySlimeInteraction(runtime, index % 2 === 0 ? -1 : 1, 0)
    }
    expect(sampleColor(runtime, -1.4, 0.2, 0.3)).toEqual(
      sampleColor(runtime, 1.4, -0.4, -0.2),
    )
    const fullyMixed = sampleColor(runtime, 0, SLIME_CROWN_Y, 0)
    const expectedCoral = new THREE.Color('#ff6f73')
    expect(fullyMixed.r).toBeCloseTo(expectedCoral.r, 8)
    expect(fullyMixed.g).toBeCloseTo(expectedCoral.g, 8)
    expect(fullyMixed.b).toBeCloseTo(expectedCoral.b, 8)
  })

  it('resets the complete deterministic state exactly', () => {
    const runtime = createSlimeInteractionRuntime()
    applySlimeInteraction(runtime, 0.5, -0.25)
    expect(resetSlimeInteractionRuntime(runtime)).toBe(runtime)
    expect(runtime.interactionCount).toBe(0)
    expect([...runtime.impactCoordinates]).toEqual(
      Array.from({ length: SLIME_MAX_INTERACTIONS * 2 }, () => 0),
    )
  })
})
