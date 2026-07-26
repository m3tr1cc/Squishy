export type VectorTuple = readonly [number, number, number]

export type SquishyImpact = Readonly<{
  id: string
  timestampMs: number
  pointerType: 'mouse' | 'touch' | 'pen'
  localPoint: VectorTuple
  localNormal: VectorTuple
  worldPoint: VectorTuple
  worldNormal: VectorTuple
}>

export type SurfaceLayer = 'wax' | 'butter'

export type SurfaceHit = SquishyImpact &
  Readonly<{
    faceIndex: number
    fragmentId: number | null
    layer: SurfaceLayer
    pointerId: number
    pressure: number
  }>

export type DentImpact = {
  id: string
  localPoint: VectorTuple
  localNormal: VectorTuple
  amount: number
  velocity: number
}
