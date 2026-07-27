import crack1Url from '../../audio/crack1.wav?url'
import crack2Url from '../../audio/crack2.wav?url'
import crack3Url from '../../audio/crack3.wav?url'
import crack4Url from '../../audio/crack4.wav?url'
import crack5Url from '../../audio/crack5.wav?url'

export type CrackTrackId =
  | 'crack-1'
  | 'crack-2'
  | 'crack-3'
  | 'crack-4'
  | 'crack-5'

export type CrackTrackDescriptor = Readonly<{
  id: CrackTrackId
  url: string
  gain: number
}>

export const CRACK_TRACKS = [
  { id: 'crack-1', url: crack1Url, gain: 0.72 },
  { id: 'crack-2', url: crack2Url, gain: 0.64 },
  { id: 'crack-3', url: crack3Url, gain: 0.9 },
  { id: 'crack-4', url: crack4Url, gain: 0.78 },
  { id: 'crack-5', url: crack5Url, gain: 0.56 },
] as const satisfies readonly CrackTrackDescriptor[]

export type CrackTrack = (typeof CRACK_TRACKS)[number]

export const CRACK_TRACK_COUNT = CRACK_TRACKS.length
