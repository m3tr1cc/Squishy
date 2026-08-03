import { describe, expect, it } from 'vitest'
import {
  getIpodScrollSample,
  IPOD_SCROLL_SOUND,
} from '../src/audio/ipodScrollSound'

describe('iPod mini scroll sound', () => {
  it('models the documented short piezo pulse', () => {
    expect(IPOD_SCROLL_SOUND.frequencyHz).toBe(1846)
    expect(IPOD_SCROLL_SOUND.driveSeconds).toBe(0.0004)
    expect(IPOD_SCROLL_SOUND.durationSeconds).toBe(0.004)
  })

  it('is silent outside the pulse and decays after the drive', () => {
    expect(getIpodScrollSample(-0.001)).toBe(0)
    expect(getIpodScrollSample(0.005)).toBe(0)
    expect(Math.abs(getIpodScrollSample(0.003))).toBeLessThan(
      Math.abs(getIpodScrollSample(0.0003)),
    )
  })
})
