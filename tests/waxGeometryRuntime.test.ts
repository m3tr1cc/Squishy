import { describe, expect, it } from 'vitest'
import { createRoundedCuboidGeometry } from '../src/scene/createRoundedCuboidGeometry'
import {
  createFractureModel,
  createFractureState,
  type FractureModel,
  type FractureState,
} from '../src/scene/fracture/damage'
import {
  createWaxTopology,
} from '../src/scene/fracture/topology'
import {
  createWaxGeometryRuntime,
  writeWaxGeometry,
  type WaxGeometryRuntime,
} from '../src/scene/fracture/waxGeometryRuntime'
import type { WaxTopology } from '../src/scene/fracture/types'

function createRuntimeFixture() {
  const source = createRoundedCuboidGeometry({
    widthSegments: 12,
    heightSegments: 6,
    depthSegments: 6,
  })
  const topology = createWaxTopology({
    sourceGeometry: source,
    plateCount: 16,
  })
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

  return { source, topology, model, state, runtime }
}

function findOuterVertex(
  topology: WaxTopology,
  runtime: WaxGeometryRuntime,
  fragmentId: number,
  sourceVertexId: number,
) {
  const range = topology.fragments[fragmentId].outerVertexRange
  for (let vertex = range.start; vertex < range.start + range.count; vertex += 1) {
    if (runtime.sourceVertexIds[vertex] === sourceVertexId) {
      return vertex
    }
  }
  throw new Error(
    `Missing outer vertex for fragment ${fragmentId}, source ${sourceVertexId}.`,
  )
}

function readPosition(topology: WaxTopology, vertex: number) {
  const positions = topology.geometry.getAttribute('position')
  return [
    positions.getX(vertex),
    positions.getY(vertex),
    positions.getZ(vertex),
  ] as const
}

function pointDistance(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
) {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  )
}

function writeRestingWax({
  runtime,
  topology,
  model,
  state,
}: {
  runtime: WaxGeometryRuntime
  topology: WaxTopology
  model: FractureModel
  state: FractureState
}) {
  writeWaxGeometry({
    runtime,
    topology,
    fractureModel: model,
    fractureState: state,
    impacts: [],
    peelAmounts: new Float32Array(topology.plateCount),
  })
}

describe('wax geometry runtime', () => {
  it('keeps the generated shell finite while following a butter dent', () => {
    const { source, topology, model, state, runtime } =
      createRuntimeFixture()

    writeWaxGeometry({
      runtime,
      topology,
      fractureModel: model,
      fractureState: state,
      impacts: [
        {
          id: 'front',
          localPoint: [0, 0, 0.68],
          localNormal: [0, 0, 1],
          amount: 1,
          velocity: 0,
        },
      ],
      peelAmounts: new Float32Array(topology.plateCount),
    })

    const positions = topology.geometry.getAttribute('position')
    for (let index = 0; index < positions.count; index += 1) {
      expect(
        [
          positions.getX(index),
          positions.getY(index),
          positions.getZ(index),
        ].every(Number.isFinite),
      ).toBe(true)
    }

    topology.geometry.dispose()
    source.dispose()
  })

  it('stores compact, bounded per-vertex seam influences', () => {
    const { source, topology, runtime } = createRuntimeFixture()
    const vertexCount = topology.geometry.getAttribute('position').count
    const influenceCount =
      runtime.seamInfluenceStarts[runtime.seamInfluenceStarts.length - 1]

    expect(runtime.seamInfluenceStarts).toHaveLength(vertexCount + 1)
    expect(runtime.seamInfluenceBondIds).toHaveLength(influenceCount)
    expect(runtime.seamInfluenceSigns).toHaveLength(influenceCount)
    expect(runtime.seamInfluenceWeights).toHaveLength(influenceCount)
    expect(influenceCount).toBeGreaterThan(0)
    expect(
      [...runtime.seamInfluenceBondIds].every(
        (bondIndex) => bondIndex < topology.bonds.length,
      ),
    ).toBe(true)
    expect(
      [...runtime.seamInfluenceSigns].every(
        (sign) => sign === -1 || sign === 1,
      ),
    ).toBe(true)
    expect(
      [...runtime.seamInfluenceWeights].every(
        (weight) => weight > 0 && weight <= 255,
      ),
    ).toBe(true)
    expect(
      [...runtime.seamBondOpenings].every(
        (opening) => opening >= 0.0119 && opening <= 0.0281,
      ),
    ).toBe(true)

    topology.geometry.dispose()
    source.dispose()
  })

  it('opens only a broken bond symmetrically while intact seams stay closed', () => {
    const { source, topology, model, state, runtime } =
      createRuntimeFixture()
    const selectedBondIndex = topology.bonds.findIndex(
      (bond) => bond.boundaryVertexIndices.length > 0,
    )
    const selectedBond = topology.bonds[selectedBondIndex]
    const sourceVertex = selectedBond.boundaryVertexIndices[
      Math.floor(selectedBond.boundaryVertexIndices.length / 2)
    ]
    const vertexA = findOuterVertex(
      topology,
      runtime,
      selectedBond.fragmentA,
      sourceVertex,
    )
    const vertexB = findOuterVertex(
      topology,
      runtime,
      selectedBond.fragmentB,
      sourceVertex,
    )
    const unrelatedBond = topology.bonds.find(
      (bond) =>
        bond.id !== selectedBond.id &&
        bond.fragmentA !== selectedBond.fragmentA &&
        bond.fragmentA !== selectedBond.fragmentB &&
        bond.fragmentB !== selectedBond.fragmentA &&
        bond.fragmentB !== selectedBond.fragmentB &&
        bond.boundaryVertexIndices.length > 0,
    )
    expect(unrelatedBond).toBeDefined()

    writeRestingWax({ runtime, topology, model, state })
    const restA = readPosition(topology, vertexA)
    const restB = readPosition(topology, vertexB)
    expect(pointDistance(restA, restB)).toBeLessThan(1e-6)

    state.bondDamage[selectedBondIndex] =
      model.bondToughness[selectedBondIndex]
    state.bondBroken[selectedBondIndex] = 1
    writeRestingWax({ runtime, topology, model, state })
    expect(
      pointDistance(
        readPosition(topology, vertexA),
        readPosition(topology, vertexB),
      ),
    ).toBeLessThan(1e-6)

    state.bondSeamOpen[selectedBondIndex] = 0.5
    writeRestingWax({ runtime, topology, model, state })
    const partialGap = pointDistance(
      readPosition(topology, vertexA),
      readPosition(topology, vertexB),
    )

    state.bondSeamOpen[selectedBondIndex] = 1
    writeRestingWax({ runtime, topology, model, state })
    const openedA = readPosition(topology, vertexA)
    const openedB = readPosition(topology, vertexB)
    const fullGap = pointDistance(openedA, openedB)
    expect(partialGap).toBeGreaterThan(0)
    expect(fullGap).toBeGreaterThan(partialGap)
    expect(fullGap).toBeGreaterThanOrEqual(0.0119)
    expect(fullGap).toBeLessThanOrEqual(0.0281)

    for (let axis = 0; axis < 3; axis += 1) {
      expect((openedA[axis] + openedB[axis]) * 0.5).toBeCloseTo(
        (restA[axis] + restB[axis]) * 0.5,
        5,
      )
    }

    const intactSourceVertex = unrelatedBond!.boundaryVertexIndices[0]
    const intactA = findOuterVertex(
      topology,
      runtime,
      unrelatedBond!.fragmentA,
      intactSourceVertex,
    )
    const intactB = findOuterVertex(
      topology,
      runtime,
      unrelatedBond!.fragmentB,
      intactSourceVertex,
    )
    expect(
      pointDistance(
        readPosition(topology, intactA),
        readPosition(topology, intactB),
      ),
    ).toBeLessThan(1e-6)

    topology.geometry.dispose()
    source.dispose()
  })
})
