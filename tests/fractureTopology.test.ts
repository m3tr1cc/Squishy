import { beforeAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_WAX_INNER_CLEARANCE,
  DEFAULT_WAX_OUTER_OFFSET,
  DEFAULT_WAX_PLATE_COUNT,
  createWaxTopology,
  getWaxTriangleMetadata,
} from '../src/scene/fracture/topology'
import {
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
    expect([...duplicate.geometry.getAttribute('position').array]).toEqual([
      ...topology.geometry.getAttribute('position').array,
    ])
    expect(
      duplicate.bonds.map((bond) => [
        bond.fragmentA,
        bond.fragmentB,
        [...bond.boundaryEdges],
        bond.toughness,
      ]),
    ).toEqual(
      topology.bonds.map((bond) => [
        bond.fragmentA,
        bond.fragmentB,
        [...bond.boundaryEdges],
        bond.toughness,
      ]),
    )

    duplicate.geometry.dispose()
  }, 30_000)

  it('partitions every source triangle into exactly 128 connected plates', () => {
    expect(topology.plateCount).toBe(DEFAULT_WAX_PLATE_COUNT)
    expect(topology.fragments).toHaveLength(DEFAULT_WAX_PLATE_COUNT)
    expect(topology.sourceTriangleFragmentIds).toHaveLength(
      topology.source.triangleCount,
    )

    const coverage = new Uint8Array(topology.source.triangleCount)
    for (const fragment of topology.fragments) {
      expect(fragment.sourceTriangleIndices.length).toBeGreaterThan(0)
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

  it('builds a connected bond graph with complete raycast lookup data', () => {
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
          bond.toughness >= 0.88 &&
          bond.toughness <= 1.12,
      ),
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
