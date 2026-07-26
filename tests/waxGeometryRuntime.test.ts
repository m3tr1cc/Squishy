import { describe, expect, it } from 'vitest'
import { createRoundedCuboidGeometry } from '../src/scene/createRoundedCuboidGeometry'
import {
  createFractureModel,
  createFractureState,
} from '../src/scene/fracture/damage'
import {
  createWaxTopology,
} from '../src/scene/fracture/topology'
import {
  createWaxGeometryRuntime,
  writeWaxGeometry,
} from '../src/scene/fracture/waxGeometryRuntime'

describe('wax geometry runtime', () => {
  it('keeps the generated shell finite while following a butter dent', () => {
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
})
