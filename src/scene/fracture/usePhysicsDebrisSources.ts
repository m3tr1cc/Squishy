import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  DebrisCluster,
  DebrisTransform,
} from './RapierDebris'

export type PhysicsDebrisSource = Readonly<{
  clusters: readonly DebrisCluster[]
  onTransform: (clusterId: string, transform: DebrisTransform) => void
  onSettled: (clusterId: string, transform: DebrisTransform) => void
}>

export function usePhysicsDebrisSources<SourceId extends string>(
  orderedSourceIds: readonly SourceId[],
) {
  const [sources, setSources] = useState<
    ReadonlyMap<SourceId, PhysicsDebrisSource>
  >(() => new Map())
  const registerSource = useCallback(
    (sourceId: SourceId, source: PhysicsDebrisSource | null) => {
      setSources((current) => {
        if (source === null) {
          if (!current.has(sourceId)) {
            return current
          }
          const next = new Map(current)
          next.delete(sourceId)
          return next
        }
        if (current.get(sourceId) === source) {
          return current
        }
        const next = new Map(current)
        next.set(sourceId, source)
        return next
      })
    },
    [],
  )
  const runtime = useMemo(() => {
    const clusters: DebrisCluster[] = []
    const sourceByClusterId = new Map<string, PhysicsDebrisSource>()
    for (const sourceId of orderedSourceIds) {
      const source = sources.get(sourceId)
      if (!source) {
        continue
      }
      for (const cluster of source.clusters) {
        clusters.push(cluster)
        sourceByClusterId.set(cluster.id, source)
      }
    }
    return {
      clusters,
      sourceByClusterId,
    }
  }, [orderedSourceIds, sources])
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime

  const handleTransform = useCallback(
    (clusterId: string, transform: DebrisTransform) => {
      runtimeRef.current.sourceByClusterId
        .get(clusterId)
        ?.onTransform(clusterId, transform)
    },
    [],
  )
  const handleSettled = useCallback(
    (clusterId: string, transform: DebrisTransform) => {
      runtimeRef.current.sourceByClusterId
        .get(clusterId)
        ?.onSettled(clusterId, transform)
    },
    [],
  )

  return {
    clusters: runtime.clusters,
    registerSource,
    handleTransform,
    handleSettled,
  } as const
}
