import { beforeAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_WAX_INNER_CLEARANCE,
  DEFAULT_WAX_OUTER_OFFSET,
  DEFAULT_WAX_PLATE_COUNT,
  SEED_CANDIDATE_MINIMUM_DISTANCE_RATIO,
  WAX_GROWTH_SPEED_MODES,
  createWaxTopology,
  getWaxTriangleMetadata,
} from '../src/scene/fracture/topology'
import {
  WAX_FRACTURE_ROLE,
  WAX_SURFACE_KIND,
  type WaxTopology,
} from '../src/scene/fracture/types'

let topology: WaxTopology

beforeAll(() => {
  topology = createWaxTopology()
}, 30_000)

function positionKey(topologyValue: WaxTopology, vertex: number) {
  const positions = topologyValue.geometry.getAttribute('position')
  return `${positions.getX(vertex)},${positions.getY(vertex)},${positions.getZ(vertex)}`
}

function edgeKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

describe('wax shell topology', () => {
  it('is deterministic for the same seed', () => {
    const duplicate = createWaxTopology()

    expect(duplicate.seed).toBe(topology.seed)
    expect([...duplicate.sourceTriangleFragmentIds]).toEqual([
      ...topology.sourceTriangleFragmentIds,
    ])
    expect([...duplicate.seedTriangleIds]).toEqual([
      ...topology.seedTriangleIds,
    ])
    expect([...duplicate.growthSpeeds]).toEqual([
      ...topology.growthSpeeds,
    ])
    expect([...duplicate.geometry.getAttribute('position').array]).toEqual([
      ...topology.geometry.getAttribute('position').array,
    ])
    expect(
      duplicate.bonds.map((bond) => [
        bond.fragmentA,
        bond.fragmentB,
        [...bond.boundaryEdges],
        bond.fractureRole,
        bond.toughness,
      ]),
    ).toEqual(
      topology.bonds.map((bond) => [
        bond.fragmentA,
        bond.fragmentB,
        [...bond.boundaryEdges],
        bond.fractureRole,
        bond.toughness,
      ]),
    )

    duplicate.geometry.dispose()
  }, 30_000)

  it('partitions every source triangle into exactly 48 connected irregular plates', () => {
    expect(topology.plateCount).toBe(DEFAULT_WAX_PLATE_COUNT)
    expect(topology.fragments).toHaveLength(DEFAULT_WAX_PLATE_COUNT)
    expect(topology.sourceTriangleFragmentIds).toHaveLength(
      topology.source.triangleCount,
    )

    const coverage = new Uint8Array(topology.source.triangleCount)
    let minimumTriangleCount = Number.POSITIVE_INFINITY
    let maximumTriangleCount = 0
    for (const fragment of topology.fragments) {
      expect(fragment.sourceTriangleIndices.length).toBeGreaterThan(0)
      expect(fragment.sourceTriangleIndices).toContain(
        fragment.seedTriangleId,
      )
      expect(topology.sourceTriangleFragmentIds[fragment.seedTriangleId]).toBe(
        fragment.id,
      )
      expect(fragment.growthSpeed).toBe(topology.growthSpeeds[fragment.id])
      minimumTriangleCount = Math.min(
        minimumTriangleCount,
        fragment.sourceTriangleIndices.length,
      )
      maximumTriangleCount = Math.max(
        maximumTriangleCount,
        fragment.sourceTriangleIndices.length,
      )
      const allowed = new Set(fragment.sourceTriangleIndices)
      const visited = new Set<number>()
      const queue = [fragment.sourceTriangleIndices[0]]

      while (queue.length > 0) {
        const triangle = queue.pop()!
        if (visited.has(triangle)) {
          continue
        }
        visited.add(triangle)
        coverage[triangle] += 1

        for (let edge = 0; edge < 3; edge += 1) {
          const neighbor =
            topology.source.triangleNeighbors[triangle * 3 + edge]
          if (allowed.has(neighbor) && !visited.has(neighbor)) {
            queue.push(neighbor)
          }
        }
      }

      expect(visited.size).toBe(fragment.sourceTriangleIndices.length)
    }

    expect([...coverage].every((count) => count === 1)).toBe(true)
    expect(minimumTriangleCount).toBeGreaterThanOrEqual(12)
    expect(maximumTriangleCount / minimumTriangleCount).toBeGreaterThan(1.5)
  })

  it('selects separated irregular seeds and uses all three growth modes', () => {
    expect(new Set(topology.seedTriangleIds).size).toBe(
      DEFAULT_WAX_PLATE_COUNT,
    )
    expect(topology.seedSelectionDistanceRatios).toHaveLength(
      DEFAULT_WAX_PLATE_COUNT,
    )
    expect(topology.seedSelectionDistanceRatios[0]).toBe(1)
    for (
      let selection = 1;
      selection < topology.seedSelectionDistanceRatios.length;
      selection += 1
    ) {
      expect(
        topology.seedSelectionDistanceRatios[selection],
      ).toBeGreaterThanOrEqual(
        SEED_CANDIDATE_MINIMUM_DISTANCE_RATIO - 1e-6,
      )
    }

    const modeCounts = new Map<number, number>()
    for (const growthSpeed of topology.growthSpeeds) {
      const mode = WAX_GROWTH_SPEED_MODES.find((candidate) =>
        Math.abs(candidate - growthSpeed) < 1e-6
      )
      expect(mode).toBeDefined()
      modeCounts.set(mode!, (modeCounts.get(mode!) ?? 0) + 1)
    }
    expect(modeCounts.size).toBe(3)
    expect([...modeCounts.values()].every((count) => count >= 8)).toBe(true)
  })

  it('extrudes finite closed plates at the specified wax thickness', () => {
    const positions = topology.geometry.getAttribute('position')
    const normals = topology.geometry.getAttribute('normal')
    const shellOffsets = topology.geometry.getAttribute('shellOffset')
    const fragmentIds = topology.geometry.getAttribute('fragmentId')
    const surfaceKinds = topology.geometry.getAttribute('surfaceKind')
    const sourceVertexIds = topology.geometry.getAttribute('sourceVertexId')

    expect(topology.innerClearance).toBe(DEFAULT_WAX_INNER_CLEARANCE)
    expect(topology.outerOffset).toBe(DEFAULT_WAX_OUTER_OFFSET)
    expect(topology.thickness).toBeCloseTo(0.049, 8)
    expect(fragmentIds.count).toBe(positions.count)
    expect(surfaceKinds.count).toBe(positions.count)
    expect(sourceVertexIds.count).toBe(positions.count)

    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      expect(
        [
          positions.getX(vertex),
          positions.getY(vertex),
          positions.getZ(vertex),
          normals.getX(vertex),
          normals.getY(vertex),
          normals.getZ(vertex),
          shellOffsets.getX(vertex),
        ].every(Number.isFinite),
      ).toBe(true)
    }

    for (const fragment of topology.fragments) {
      const outer = fragment.outerVertexRange
      const inner = fragment.innerVertexRange
      expect(outer.count).toBe(inner.count)

      for (let localVertex = 0; localVertex < outer.count; localVertex += 1) {
        const outerVertex = outer.start + localVertex
        const innerVertex = inner.start + localVertex
        expect(sourceVertexIds.getX(outerVertex)).toBe(
          sourceVertexIds.getX(innerVertex),
        )
        expect(
          Math.hypot(
            positions.getX(outerVertex) - positions.getX(innerVertex),
            positions.getY(outerVertex) - positions.getY(innerVertex),
            positions.getZ(outerVertex) - positions.getZ(innerVertex),
          ),
        ).toBeCloseTo(topology.thickness, 5)
      }
    }

    const index = topology.geometry.getIndex()
    expect(index).not.toBeNull()
    const edgeCounts = Array.from(
      { length: topology.plateCount },
      () => new Map<string, number>(),
    )
    for (let triangle = 0; triangle < topology.triangleFragmentIds.length; triangle += 1) {
      const fragment = topology.triangleFragmentIds[triangle]
      const vertices = [
        index!.getX(triangle * 3),
        index!.getX(triangle * 3 + 1),
        index!.getX(triangle * 3 + 2),
      ]
      for (let edge = 0; edge < 3; edge += 1) {
        const key = edgeKey(
          positionKey(topology, vertices[edge]),
          positionKey(topology, vertices[(edge + 1) % 3]),
        )
        edgeCounts[fragment].set(
          key,
          (edgeCounts[fragment].get(key) ?? 0) + 1,
        )
      }
    }

    for (const fragmentEdges of edgeCounts) {
      expect(
        [...fragmentEdges.values()].every((incidence) => incidence === 2),
      ).toBe(true)
    }
  })

  it('keeps neighboring outer seams coincident before fracture', () => {
    const positions = topology.geometry.getAttribute('position')
    const normals = topology.geometry.getAttribute('normal')
    const sourceVertexIds = topology.geometry.getAttribute('sourceVertexId')
    const outerVertices = new Map<string, number>()

    for (const fragment of topology.fragments) {
      const range = fragment.outerVertexRange
      for (let localVertex = 0; localVertex < range.count; localVertex += 1) {
        const vertex = range.start + localVertex
        outerVertices.set(
          `${fragment.id}:${sourceVertexIds.getX(vertex)}`,
          vertex,
        )
      }
    }

    for (const bond of topology.bonds) {
      for (const sourceVertex of bond.boundaryVertexIndices) {
        const vertexA = outerVertices.get(`${bond.fragmentA}:${sourceVertex}`)
        const vertexB = outerVertices.get(`${bond.fragmentB}:${sourceVertex}`)
        expect(vertexA).toBeDefined()
        expect(vertexB).toBeDefined()

        expect([
          positions.getX(vertexA!),
          positions.getY(vertexA!),
          positions.getZ(vertexA!),
          normals.getX(vertexA!),
          normals.getY(vertexA!),
          normals.getZ(vertexA!),
        ]).toEqual([
          positions.getX(vertexB!),
          positions.getY(vertexB!),
          positions.getZ(vertexB!),
          normals.getX(vertexB!),
          normals.getY(vertexB!),
          normals.getZ(vertexB!),
        ])
      }
    }
  })

  it('builds a connected role-weighted bond graph with complete raycast lookup data', () => {
    const visited = new Set<number>()
    const queue = [0]
    while (queue.length > 0) {
      const fragment = queue.pop()!
      if (visited.has(fragment)) {
        continue
      }
      visited.add(fragment)
      queue.push(...topology.fragments[fragment].neighborFragmentIds)
    }

    expect(visited.size).toBe(topology.plateCount)
    expect(topology.bonds.length).toBeGreaterThan(topology.plateCount - 1)
    expect(topology.bonds.length).toBeLessThan(450)
    expect(
      topology.bonds.every(
        (bond) =>
          bond.length > 0 &&
          bond.boundaryEdges.length >= 2 &&
          Number.isInteger(bond.fractureRole) &&
          bond.fractureRole >= WAX_FRACTURE_ROLE.trunk &&
          bond.fractureRole <= WAX_FRACTURE_ROLE.ordinary &&
          bond.toughness >= 0.5 &&
          bond.toughness <= 1.24,
      ),
    ).toBe(true)
    expect(
      topology.bonds.every((bond) => {
        if (bond.fractureRole === WAX_FRACTURE_ROLE.trunk) {
          return bond.toughness >= 0.5 && bond.toughness <= 0.68
        }
        if (bond.fractureRole === WAX_FRACTURE_ROLE.branch) {
          return bond.toughness >= 0.7 && bond.toughness <= 0.86
        }
        return bond.toughness >= 1 && bond.toughness <= 1.24
      }),
    ).toBe(true)

    expect(topology.triangleFragmentIds).toHaveLength(
      topology.triangleSurfaceKinds.length,
    )
    expect(topology.triangleFragmentIds).toHaveLength(
      topology.triangleSourceTriangleIds.length,
    )
    expect(getWaxTriangleMetadata(topology, -1)).toBeNull()
    expect(getWaxTriangleMetadata(topology, 0)).toEqual({
      fragmentId: topology.triangleFragmentIds[0],
      surfaceKind: WAX_SURFACE_KIND.outer,
      sourceTriangleId: topology.triangleSourceTriangleIds[0],
    })
  })

  it('creates two long visible trunks inside a connected weak network', () => {
    const weakBonds = topology.bonds.filter(
      (bond) => bond.fractureRole !== WAX_FRACTURE_ROLE.ordinary,
    )
    const trunkBonds = topology.bonds.filter(
      (bond) => bond.fractureRole === WAX_FRACTURE_ROLE.trunk,
    )
    const branchBonds = topology.bonds.filter(
      (bond) => bond.fractureRole === WAX_FRACTURE_ROLE.branch,
    )
    const ordinaryBonds = topology.bonds.filter(
      (bond) => bond.fractureRole === WAX_FRACTURE_ROLE.ordinary,
    )

    expect(trunkBonds.length).toBeGreaterThan(3)
    expect(branchBonds.length).toBeGreaterThan(0)
    expect(ordinaryBonds.length).toBeGreaterThan(0)

    const trunkAdjacency = new Map<number, Set<number>>()
    for (const bond of trunkBonds) {
      const neighborsA = trunkAdjacency.get(bond.fragmentA) ?? new Set()
      const neighborsB = trunkAdjacency.get(bond.fragmentB) ?? new Set()
      neighborsA.add(bond.fragmentB)
      neighborsB.add(bond.fragmentA)
      trunkAdjacency.set(bond.fragmentA, neighborsA)
      trunkAdjacency.set(bond.fragmentB, neighborsB)
    }
    const trunkComponents: number[][] = []
    const unvisitedTrunkFragments = new Set(trunkAdjacency.keys())
    while (unvisitedTrunkFragments.size > 0) {
      const seed = unvisitedTrunkFragments.values().next().value!
      const component: number[] = []
      const queue = [seed]
      while (queue.length > 0) {
        const fragment = queue.pop()!
        if (!unvisitedTrunkFragments.delete(fragment)) {
          continue
        }
        component.push(fragment)
        queue.push(...(trunkAdjacency.get(fragment) ?? []))
      }
      trunkComponents.push(component)
    }
    expect(trunkComponents).toHaveLength(2)

    const allFragmentX = topology.fragments.map(
      (fragment) => fragment.centroid[0],
    )
    const requiredCorridorSpan =
      (Math.max(...allFragmentX) - Math.min(...allFragmentX)) * 0.65
    for (const component of trunkComponents) {
      const componentX = component.map(
        (fragment) => topology.fragments[fragment].centroid[0],
      )
      expect(Math.max(...componentX) - Math.min(...componentX)).toBeGreaterThanOrEqual(
        requiredCorridorSpan,
      )
      const componentSet = new Set(component)
      const componentBonds = trunkBonds.filter(
        (bond) =>
          componentSet.has(bond.fragmentA) &&
          componentSet.has(bond.fragmentB),
      )
      const averageTrunkZ =
        componentBonds.reduce(
          (total, bond) => total + bond.midpoint[2],
          0,
        ) / componentBonds.length
      expect(averageTrunkZ).toBeGreaterThan(0.3)
    }

    const weakAdjacency = Array.from(
      { length: topology.plateCount },
      () => [] as number[],
    )
    for (const bond of weakBonds) {
      weakAdjacency[bond.fragmentA].push(bond.fragmentB)
      weakAdjacency[bond.fragmentB].push(bond.fragmentA)
    }
    const weakVisited = new Set<number>()
    const weakQueue = [0]
    while (weakQueue.length > 0) {
      const fragment = weakQueue.pop()!
      if (weakVisited.has(fragment)) {
        continue
      }
      weakVisited.add(fragment)
      weakQueue.push(...weakAdjacency[fragment])
    }
    expect(weakVisited.size).toBe(topology.plateCount)

    const averageToughness = (bonds: typeof topology.bonds) =>
      bonds.reduce((total, bond) => total + bond.toughness, 0) /
      bonds.length
    expect(averageToughness(trunkBonds)).toBeLessThan(
      averageToughness(branchBonds),
    )
    expect(averageToughness(branchBonds)).toBeLessThan(
      averageToughness(ordinaryBonds),
    )
  })

  it('stays inside the shell triangle and draw-call budgets', () => {
    const surfaceKinds = [...topology.triangleSurfaceKinds]
    expect(
      surfaceKinds.filter((kind) => kind === WAX_SURFACE_KIND.outer),
    ).toHaveLength(topology.source.triangleCount)
    expect(
      surfaceKinds.filter((kind) => kind === WAX_SURFACE_KIND.inner),
    ).toHaveLength(topology.source.triangleCount)
    expect(
      surfaceKinds.filter((kind) => kind === WAX_SURFACE_KIND.side).length,
    ).toBeGreaterThan(0)
    expect(topology.triangleFragmentIds.length).toBeLessThan(35_000)
    expect(topology.geometry.groups).toHaveLength(3)
  })
})
