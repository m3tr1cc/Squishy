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

export type DentImpact = {
  id: string
  localPoint: VectorTuple
  localNormal: VectorTuple
  amount: number
  velocity: number
}
