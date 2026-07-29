import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  CHOCOLATE_RUNTIME_CONFIG,
  createChocolateShellGeometry,
  isChocolateGutter,
} from '../src/scene/chocolate'
import {
  createFractureModel,
  createFractureState,
  FRAGMENT_STATE,
} from '../src/scene/fracture/damage'
import { createWaxTopology } from '../src/scene/fracture/topology'
import {
  WAX_SURFACE_KIND,
  type WaxTopology,
} from '../src/scene/fracture/types'
import {
  createWaxGeometryRuntime,
  writeWaxGeometry,
} from '../src/scene/fracture/waxGeometryRuntime'

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

afterAll(() => {
  topology.geometry.dispose()
})

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

  it('keeps attached and peeling chocolate coupled to the slime field', () => {
    const model = createFractureModel({
      fragments: topology.fragments.map((fragment) => ({
        id: fragment.id,
        centroid: fragment.centroid,
        normal: fragment.averageNormal,
      })),
      bonds: topology.bonds.map((bond) => ({
        id: bond.id,
        fragmentA: bond.fragmentA,
        fragmentB: bond.fragmentB,
        length: bond.length,
        toughness: bond.toughness,
      })),
    })
    const state = createFractureState(model)
    const runtime = createWaxGeometryRuntime(topology)
    let selectedVertex = -1
    let bestScore = Number.NEGATIVE_INFINITY
    for (
      let vertex = 0;
      vertex < runtime.sourceVertexIds.length;
      vertex += 1
    ) {
      if (
        runtime.surfaceKinds[vertex] !== WAX_SURFACE_KIND.outer
      ) {
        continue
      }
      const sourceOffset = runtime.sourceVertexIds[vertex] * 3
      const sourceX = topology.source.positions[sourceOffset]
      const sourceY = topology.source.positions[sourceOffset + 1]
      const sourceZ = topology.source.positions[sourceOffset + 2]
      const score = sourceZ - Math.abs(sourceX) - Math.abs(sourceY)
      if (score > bestScore) {
        bestScore = score
        selectedVertex = vertex
      }
    }
    expect(selectedVertex).toBeGreaterThanOrEqual(0)

    const sourceVertexId = runtime.sourceVertexIds[selectedVertex]
    const sourceOffset = sourceVertexId * 3
    const impact = {
      id: 'plastic',
      localPoint: [
        topology.source.positions[sourceOffset],
        topology.source.positions[sourceOffset + 1],
        topology.source.positions[sourceOffset + 2],
      ] as const,
      localNormal: [
        topology.source.normals[sourceOffset],
        topology.source.normals[sourceOffset + 1],
        topology.source.normals[sourceOffset + 2],
      ] as const,
      amount: 0.8,
      velocity: 0,
      permanent: true,
    }
    const sampler = CHOCOLATE_RUNTIME_CONFIG.displacementSampler!
    const expected = { x: 0, y: 0, z: 0 }
    sampler(
      impact.localPoint[0],
      impact.localPoint[1],
      impact.localPoint[2],
      impact.localNormal[0],
      impact.localNormal[1],
      impact.localNormal[2],
      [impact],
      expected,
    )
    const peelAmounts = new Float32Array(topology.plateCount)

    writeWaxGeometry({
      runtime,
      topology,
      fractureModel: model,
      fractureState: state,
      impacts: [],
      peelAmounts,
      displacementSampler: sampler,
    })
    const positions = runtime.geometry.getAttribute('position')
    let restingMinimumY = Number.POSITIVE_INFINITY
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      if (
        runtime.surfaceKinds[vertex] !== WAX_SURFACE_KIND.outer
      ) {
        continue
      }
      restingMinimumY = Math.min(
        restingMinimumY,
        positions.getY(vertex),
      )
    }

    writeWaxGeometry({
      runtime,
      topology,
      fractureModel: model,
      fractureState: state,
      impacts: [impact],
      peelAmounts,
      displacementSampler: sampler,
    })
    let displacedMinimumY = Number.POSITIVE_INFINITY
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      if (
        runtime.surfaceKinds[vertex] !== WAX_SURFACE_KIND.outer
      ) {
        continue
      }
      displacedMinimumY = Math.min(
        displacedMinimumY,
        positions.getY(vertex),
      )
    }
    expect(displacedMinimumY).toBeLessThan(
      restingMinimumY - 0.02,
    )
    expect(positions.getX(selectedVertex)).toBeCloseTo(
      impact.localPoint[0] +
        impact.localNormal[0] *
          CHOCOLATE_RUNTIME_CONFIG.outerOffset +
        expected.x,
      5,
    )
    expect(positions.getY(selectedVertex)).toBeCloseTo(
      impact.localPoint[1] +
        impact.localNormal[1] *
          CHOCOLATE_RUNTIME_CONFIG.outerOffset +
        expected.y,
      5,
    )
    expect(positions.getZ(selectedVertex)).toBeCloseTo(
      impact.localPoint[2] +
        impact.localNormal[2] *
          CHOCOLATE_RUNTIME_CONFIG.outerOffset +
        expected.z,
      5,
    )

    const fragmentId = runtime.fragmentIds[selectedVertex]
    state.fragmentState[fragmentId] = FRAGMENT_STATE.PEELING
    peelAmounts[fragmentId] = 0.6
    writeWaxGeometry({
      runtime,
      topology,
      fractureModel: model,
      fractureState: state,
      impacts: [impact],
      peelAmounts,
      displacementSampler: sampler,
    })
    const pivotOffset = fragmentId * 3
    expect(
      Math.hypot(
        runtime.pivotDisplacements[pivotOffset],
        runtime.pivotDisplacements[pivotOffset + 1],
        runtime.pivotDisplacements[pivotOffset + 2],
      ),
    ).toBeGreaterThan(0.01)
  })
})
