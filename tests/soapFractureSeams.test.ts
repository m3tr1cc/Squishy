import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createWaxTopology,
} from '../src/scene/fracture/topology'
import {
  WAX_SEAM_PROFILE,
  type WaxTopology,
} from '../src/scene/fracture/types'
import {
  SOAP_DEFINITIONS,
  mixSoapSeed,
  type SoapDefinition,
} from '../src/scene/soaps'

type SoapSeamFixture = {
  definition: SoapDefinition
  originalPositions: Float32Array
  standard: WaxTopology
  long: WaxTopology
}

const TEST_COATING_SEED = 0x12345678
const REPRESENTATIVE_COATING_SEEDS = Object.freeze([
  TEST_COATING_SEED,
  0x17156075,
  0xcc623a9b,
  0x6a99b44c,
  0x4540215f,
  0x736ae249,
  0xafd9d5ab,
  0x8a8042be,
])
const fixtures: SoapSeamFixture[] = []

function sourceEdgeKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function orderBoundaryChains(boundaryEdges: Uint32Array) {
  const adjacency = new Map<number, number[]>()
  const remaining = new Set<string>()
  for (let offset = 0; offset < boundaryEdges.length; offset += 2) {
    const a = boundaryEdges[offset]
    const b = boundaryEdges[offset + 1]
    adjacency.set(a, [...(adjacency.get(a) ?? []), b])
    adjacency.set(b, [...(adjacency.get(b) ?? []), a])
    remaining.add(sourceEdgeKey(a, b))
  }

  const chains: number[][] = []
  const walk = (start: number, firstNeighbor: number) => {
    const chain = [start, firstNeighbor]
    let previous = start
    let current = firstNeighbor
    remaining.delete(sourceEdgeKey(start, firstNeighbor))
    while ((adjacency.get(current)?.length ?? 0) === 2) {
      const neighbors = adjacency.get(current)!
      const next =
        neighbors[0] === previous ? neighbors[1] : neighbors[0]
      if (!remaining.delete(sourceEdgeKey(current, next))) {
        break
      }
      chain.push(next)
      previous = current
      current = next
    }
    return chain
  }

  for (const [start, neighbors] of adjacency) {
    if (neighbors.length === 2) {
      continue
    }
    for (const neighbor of neighbors) {
      if (remaining.has(sourceEdgeKey(start, neighbor))) {
        chains.push(walk(start, neighbor))
      }
    }
  }
  while (remaining.size > 0) {
    const [start, neighbor] = [...remaining]
      .sort()[0]
      .split(':')
      .map(Number)
    chains.push(walk(start, neighbor))
  }
  return chains
}

function countVisibleSharpTurns(
  topology: WaxTopology,
  positions: ArrayLike<number>,
  frontThreshold: number,
) {
  const boundaryPairsByVertex = Array.from(
    { length: topology.source.vertexCount },
    () => new Set<number>(),
  )
  for (let bondIndex = 0; bondIndex < topology.bonds.length; bondIndex += 1) {
    for (const vertex of topology.bonds[bondIndex].boundaryVertexIndices) {
      boundaryPairsByVertex[vertex].add(bondIndex)
    }
  }
  let sharpTurns = 0
  let totalTurns = 0
  for (const bond of topology.bonds) {
    if (bond.midpoint[2] <= frontThreshold) {
      continue
    }
    for (const chain of orderBoundaryChains(bond.boundaryEdges)) {
      for (let index = 1; index < chain.length - 1; index += 1) {
        if (boundaryPairsByVertex[chain[index]].size > 1) {
          continue
        }
        if (
          topology.source.normals[chain[index] * 3 + 2] <
          0.75
        ) {
          continue
        }
        const previous = chain[index - 1] * 3
        const current = chain[index] * 3
        const next = chain[index + 1] * 3
        const incomingX = positions[current] - positions[previous]
        const incomingY =
          positions[current + 1] - positions[previous + 1]
        const outgoingX = positions[next] - positions[current]
        const outgoingY =
          positions[next + 1] - positions[current + 1]
        const directionDot =
          (incomingX * outgoingX + incomingY * outgoingY) /
          Math.max(
            1e-9,
            Math.hypot(incomingX, incomingY) *
              Math.hypot(outgoingX, outgoingY),
          )
        totalTurns += 1
        if (directionDot < 0.25) {
          sharpTurns += 1
        }
      }
    }
  }
  return {
    sharpTurns,
    totalTurns,
    ratio: sharpTurns / Math.max(1, totalTurns),
  }
}

function createSoapTopology(
  definition: SoapDefinition,
  seamProfile: (typeof WAX_SEAM_PROFILE)[keyof typeof WAX_SEAM_PROFILE],
  plateCount = 16,
  seed = mixSoapSeed(TEST_COATING_SEED, definition),
) {
  const sourceGeometry = definition.geometry.createSourceGeometry()
  try {
    return createWaxTopology({
      sourceGeometry,
      plateCount,
      seed,
      innerClearance: 0.008,
      outerOffset: 0.045,
      seamProfile,
    })
  } finally {
    sourceGeometry.dispose()
  }
}

function expectOwnershipToMatch(
  standard: WaxTopology,
  long: WaxTopology,
) {
  expect([...long.sourceTriangleFragmentIds]).toEqual([
    ...standard.sourceTriangleFragmentIds,
  ])
  expect([...long.triangleFragmentIds]).toEqual([
    ...standard.triangleFragmentIds,
  ])
  expect([...long.triangleSourceTriangleIds]).toEqual([
    ...standard.triangleSourceTriangleIds,
  ])
  expect(
    long.bonds.map((bond) => [
      bond.fragmentA,
      bond.fragmentB,
      ...bond.boundaryEdges,
    ]),
  ).toEqual(
    standard.bonds.map((bond) => [
      bond.fragmentA,
      bond.fragmentB,
      ...bond.boundaryEdges,
    ]),
  )
}

beforeAll(() => {
  for (const definition of SOAP_DEFINITIONS) {
    const sourceGeometry = definition.geometry.createSourceGeometry()
    const originalPositions = new Float32Array(
      sourceGeometry.getAttribute('position').array,
    )
    sourceGeometry.dispose()
    fixtures.push({
      definition,
      originalPositions,
      standard: createSoapTopology(
        definition,
        WAX_SEAM_PROFILE.standard,
      ),
      long: createSoapTopology(
        definition,
        WAX_SEAM_PROFILE.long,
      ),
    })
  }
}, 30_000)

afterAll(() => {
  for (const fixture of fixtures) {
    fixture.standard.geometry.dispose()
    fixture.long.geometry.dispose()
  }
})

describe('soap long fracture seams', () => {
  it('keeps the fully hydrated six-soap geometry bounded', () => {
    let renderedTriangles = 0
    for (const fixture of fixtures) {
      const decal = fixture.definition.decal.createGeometry()
      renderedTriangles += fixture.long.source.triangleCount
      renderedTriangles += fixture.long.geometry.getIndex()!.count / 3
      renderedTriangles += (decal.getIndex()!.count / 3) * 2
      decal.dispose()
    }
    expect(renderedTriangles).toBeLessThanOrEqual(70_000)
  })

  for (const coatingSeed of REPRESENTATIVE_COATING_SEEDS) {
    it(
      `substantially removes visible grid turns for coating seed 0x${coatingSeed
        .toString(16)
        .padStart(8, '0')}`,
      () => {
        for (const definition of SOAP_DEFINITIONS) {
          const sourceGeometry =
            definition.geometry.createSourceGeometry()
          const originalPositions = new Float32Array(
            sourceGeometry.getAttribute('position').array,
          )
          sourceGeometry.dispose()
          const standard = createSoapTopology(
            definition,
            WAX_SEAM_PROFILE.standard,
            16,
            mixSoapSeed(coatingSeed, definition),
          )
          const long = createSoapTopology(
            definition,
            WAX_SEAM_PROFILE.long,
            16,
            mixSoapSeed(coatingSeed, definition),
          )
          try {
            const frontThreshold =
              definition.geometry.size[2] * 0.22
            const standardTurns = countVisibleSharpTurns(
              standard,
              standard.source.positions,
              frontThreshold,
            )
            const longTurns = countVisibleSharpTurns(
              long,
              long.source.positions,
              frontThreshold,
            )
            expect(
              longTurns.totalTurns,
              definition.id,
            ).toBeGreaterThan(0)
            expect(
              longTurns.ratio,
              definition.id,
            ).toBeLessThanOrEqual(0.22)
            if (standardTurns.ratio > 0.2) {
              expect(
                longTurns.ratio,
                definition.id,
              ).toBeLessThan(standardTurns.ratio)
            }
            expectOwnershipToMatch(standard, long)
            let maximumDisplacement = 0
            for (
              let vertex = 0;
              vertex < long.source.vertexCount;
              vertex += 1
            ) {
              const offset = vertex * 3
              maximumDisplacement = Math.max(
                maximumDisplacement,
                Math.hypot(
                  long.source.positions[offset] -
                    originalPositions[offset],
                  long.source.positions[offset + 1] -
                    originalPositions[offset + 1],
                  long.source.positions[offset + 2] -
                    originalPositions[offset + 2],
                ),
              )
            }
            expect(
              maximumDisplacement,
              definition.id,
            ).toBeLessThanOrEqual(0.240_001)
          } finally {
            standard.geometry.dispose()
            long.geometry.dispose()
          }
        }
      },
      15_000,
    )
  }

  it('preserves fragment, bond, and raycast ownership IDs', () => {
    for (const { standard, long } of fixtures) {
      expectOwnershipToMatch(standard, long)
    }
  })

  it('keeps all moved triangles finite, forward-wound, and above the area guard', () => {
    for (const { originalPositions, long } of fixtures) {
      let maximumDisplacement = 0
      for (let vertex = 0; vertex < long.source.vertexCount; vertex += 1) {
        const offset = vertex * 3
        maximumDisplacement = Math.max(
          maximumDisplacement,
          Math.hypot(
            long.source.positions[offset] - originalPositions[offset],
            long.source.positions[offset + 1] -
              originalPositions[offset + 1],
            long.source.positions[offset + 2] -
              originalPositions[offset + 2],
          ),
        )
      }
      expect(maximumDisplacement).toBeLessThanOrEqual(0.240_001)

      for (
        let triangle = 0;
        triangle < long.source.triangleCount;
        triangle += 1
      ) {
        const indexOffset = triangle * 3
        const a = long.source.indices[indexOffset] * 3
        const b = long.source.indices[indexOffset + 1] * 3
        const c = long.source.indices[indexOffset + 2] * 3
        const readCross = (positions: Float32Array) => {
          const abX = positions[b] - positions[a]
          const abY = positions[b + 1] - positions[a + 1]
          const abZ = positions[b + 2] - positions[a + 2]
          const acX = positions[c] - positions[a]
          const acY = positions[c + 1] - positions[a + 1]
          const acZ = positions[c + 2] - positions[a + 2]
          return [
            abY * acZ - abZ * acY,
            abZ * acX - abX * acZ,
            abX * acY - abY * acX,
          ] as const
        }
        const originalCross = readCross(originalPositions)
        const cleanCross = readCross(long.source.positions)
        const originalArea =
          Math.hypot(...originalCross) * 0.5
        const cleanArea = Math.hypot(...cleanCross) * 0.5
        const orientation =
          originalCross[0] * cleanCross[0] +
          originalCross[1] * cleanCross[1] +
          originalCross[2] * cleanCross[2]

        expect(cleanCross.every(Number.isFinite)).toBe(true)
        expect(orientation).toBeGreaterThan(0)
        expect(cleanArea / originalArea).toBeGreaterThanOrEqual(
          0.15 - 1e-6,
        )
      }
    }
  })

  it('handles a closed two-region boundary without changing its topology', () => {
    const definition = SOAP_DEFINITIONS[0]
    const standard = createSoapTopology(
      definition,
      WAX_SEAM_PROFILE.standard,
      2,
      123,
    )
    const long = createSoapTopology(
      definition,
      WAX_SEAM_PROFILE.long,
      2,
      123,
    )
    try {
      const chains = orderBoundaryChains(long.bonds[0].boundaryEdges)
      expect(
        chains.some((chain) => chain[0] === chain[chain.length - 1]),
      ).toBe(true)
      expect([...long.sourceTriangleFragmentIds]).toEqual([
        ...standard.sourceTriangleFragmentIds,
      ])
      expect(long.source.positions).not.toEqual(
        standard.source.positions,
      )
      expect(
        [...long.source.positions].every(Number.isFinite),
      ).toBe(true)
    } finally {
      standard.geometry.dispose()
      long.geometry.dispose()
    }
  })

  it('is deterministic for the same product seed and long profile', () => {
    const fixture = fixtures[3]
    const duplicate = createSoapTopology(
      fixture.definition,
      WAX_SEAM_PROFILE.long,
    )
    try {
      expect([...duplicate.source.positions]).toEqual([
        ...fixture.long.source.positions,
      ])
      expect([...duplicate.sourceTriangleFragmentIds]).toEqual([
        ...fixture.long.sourceTriangleFragmentIds,
      ])
    } finally {
      duplicate.geometry.dispose()
    }
  })
})
