import { describe, expect, it } from 'vitest'
import {
  BUTTER_DEFINITIONS,
  BUTTER_SOURCE_SEGMENTS,
  BUTTER_STACK_PLATE_COUNT,
  mixButterSeed,
} from '../src/scene/butters'
import { createButterLabelGeometry } from '../src/scene/createButterLabelGeometry'
import { createRoundedCuboidGeometry } from '../src/scene/createRoundedCuboidGeometry'
import { createWaxTopology } from '../src/scene/fracture/topology'
import { WAX_SEAM_PROFILE } from '../src/scene/fracture/types'

const MAX_VISIBLE_BUTTER_TRIANGLES = 48_000
const REPRESENTATIVE_COATING_SEEDS = Object.freeze([
  0x6a4e2c1d,
  0x12345678,
  0xcc623a9b,
  0x4540215f,
  0x736ae249,
  0xafd9d5ab,
  0x8a8042be,
  0xf01dcafe,
])

describe('butter scene rendering budget', () => {
  it('keeps all three complete sticks below the aggregate triangle ceiling across coating seeds', () => {
    const labelGeometry = createButterLabelGeometry()
    const labelTriangles = labelGeometry.getIndex()!.count / 3

    try {
      for (const coatingSeed of REPRESENTATIVE_COATING_SEEDS) {
        let visibleTriangles = 0
        for (const definition of BUTTER_DEFINITIONS) {
          const bodyGeometry = createRoundedCuboidGeometry({
            widthSegments: BUTTER_SOURCE_SEGMENTS.width,
            heightSegments: BUTTER_SOURCE_SEGMENTS.height,
            depthSegments: BUTTER_SOURCE_SEGMENTS.depth,
          })
          const topology = createWaxTopology({
            sourceGeometry: bodyGeometry,
            plateCount: BUTTER_STACK_PLATE_COUNT,
            seamProfile: WAX_SEAM_PROFILE.long,
            seed: mixButterSeed(coatingSeed, definition),
          })

          try {
            visibleTriangles +=
              bodyGeometry.getIndex()!.count / 3 +
              topology.geometry.getIndex()!.count / 3 +
              labelTriangles
          } finally {
            topology.geometry.dispose()
            bodyGeometry.dispose()
          }
        }

        expect(visibleTriangles).toBeGreaterThan(40_000)
        expect(visibleTriangles).toBeLessThanOrEqual(
          MAX_VISIBLE_BUTTER_TRIANGLES,
        )
      }
    } finally {
      labelGeometry.dispose()
    }
  }, 15_000)
})
