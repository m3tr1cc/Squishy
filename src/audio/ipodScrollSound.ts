export const IPOD_SCROLL_SOUND = Object.freeze({
  frequencyHz: 1846,
  driveSeconds: 0.0004,
  durationSeconds: 0.004,
  gain: 0.12,
  minimumIntervalSeconds: 0.012,
})

export function getIpodScrollSample(
  timeSeconds: number,
  frequencyHz = IPOD_SCROLL_SOUND.frequencyHz,
) {
  if (
    timeSeconds < 0 ||
    timeSeconds > IPOD_SCROLL_SOUND.durationSeconds
  ) {
    return 0
  }
  const driveEnvelope =
    timeSeconds <= IPOD_SCROLL_SOUND.driveSeconds
      ? 1
      : Math.exp(
          -1050 *
            (timeSeconds - IPOD_SCROLL_SOUND.driveSeconds),
        )
  const fundamental = Math.sin(
    Math.PI * 2 * frequencyHz * timeSeconds,
  )
  const overtone =
    0.2 * Math.sin(Math.PI * 4 * frequencyHz * timeSeconds)
  return (fundamental + overtone) * driveEnvelope * 0.78
}
