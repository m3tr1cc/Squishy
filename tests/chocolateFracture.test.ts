import { beforeAll, describe, expect, it } from 'vitest'
import {
  CHOCOLATE_RUNTIME_CONFIG,
  createChocolateShellGeometry,
  isChocolateGutter,
} from '../src/scene/chocolate'
import { createWaxTopology } from '../src/scene/fracture/topology'
import type { WaxTopology } from '../src/scene/fracture/types'

let topology: WaxTopology

beforeAll(() => {
  const geometry = createChocolateShellGeometry()
  try {
    topology = createWaxTopology({
      sourceGeometry: geometry,
      seed: 0x51a7c0de,
      plateCount: CHOCOLATE_RUNTIME_CONFIG.plateCount,
      innerClearance: CHOCOLATE_RUNTIME_CONFIG.innerClearance,
      outerOffset: CHOCOLATE_RUNTIME_CONFIG.outerOffset,
      seamProfile: CHOCOLATE_RUNTIME_CONFIG.seamProfile,
    })
  } finally {
    geometry.dispose()
  }
}, 30_000)

describe('chocolate fracture topology', () => {
  it('creates 72 connected small plates deterministically', () => {
    expect(topology.fragments).toHaveLength(72)
    expect(
      topology.fragments.every(
        (fragment) => fragment.sourceTriangleIndices.length >= 16,
      ),
    ).toBe(true)
    expect(topology.bonds.length).toBeGreaterThan(71)

    const geometry = createChocolateShellGeometry()
    const duplicate = createWaxTopology({
      sourceGeometry: geometry,
      seed: 0x51a7c0de,
      plateCount: 72,
      innerClearance: CHOCOLATE_RUNTIME_CONFIG.innerClearance,
      outerOffset: CHOCOLATE_RUNTIME_CONFIG.outerOffset,
      seamProfile: CHOCOLATE_RUNTIME_CONFIG.seamProfile,
    })
    expect([...duplicate.sourceTriangleFragmentIds]).toEqual([
      ...topology.sourceTriangleFragmentIds,
    ])
    duplicate.geometry.dispose()
    geometry.dispose()
  }, 30_000)

  it('biases front gutter bonds to crack before cell faces', () => {
    const gutterBonds = topology.bonds.filter((bond) =>
      isChocolateGutter(...bond.midpoint),
    )
    const faceBonds = topology.bonds.filter(
      (bond) =>
        bond.midpoint[2] > 0.18 &&
        !isChocolateGutter(...bond.midpoint),
    )
    expect(gutterBonds.length).toBeGreaterThan(0)
    expect(faceBonds.length).toBeGreaterThan(0)
    expect(
      CHOCOLATE_RUNTIME_CONFIG.bondToughnessScale!(
        gutterBonds[0],
      ),
    ).toBe(0.78)
    expect(
      CHOCOLATE_RUNTIME_CONFIG.bondToughnessScale!(faceBonds[0]),
    ).toBe(1)
  })
})
