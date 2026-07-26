import type { ThreeEvent } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  MAX_ACTIVE_IMPACTS,
  SHELL_OFFSET,
} from './constants'
import { createRoundedCuboidGeometry } from './createRoundedCuboidGeometry'
import { createButterLabelTexture } from './createButterLabelTexture'
import {
  captureDeformationSource,
  writeDeformedPositions,
} from './deformation'
import { createSquishyImpact, isQualifiedTap } from './interaction'
import {
  INTRO_SPRING,
  PRESS_SPRING,
  stepSpring,
} from './spring'
import type { DentImpact, SquishyImpact } from './types'
import { WaxBreak, type WaxBreakRecord } from './WaxBreak'
import { createCrackTexture } from './createWaxBreakAssets'

type ButterSquishyProps = {
  reducedMotion: boolean
  onImpact?: (impact: SquishyImpact) => void
}

type PendingTouch = {
  clientX: number
  clientY: number
  startedAt: number
  impact: SquishyImpact
}

let impactSequence = 0
const DEFAULT_NORMAL = [0, 0, 1] as const
const NO_RAYCAST = () => null
const REDUCED_PRESS_SPRING = {
  ...PRESS_SPRING,
  damping: 31,
} as const

function normalizePointerType(value: string): SquishyImpact['pointerType'] {
  if (value === 'touch' || value === 'pen') {
    return value
  }
  return 'mouse'
}

export function ButterSquishy({
  reducedMotion,
  onImpact,
}: ButterSquishyProps) {
  const presentationRef = useRef<THREE.Group>(null)
  const compressionRef = useRef<THREE.Group>(null)
  const hoverLightRef = useRef<THREE.PointLight>(null)
  const innerGeometry = useMemo(() => createRoundedCuboidGeometry(), [])
  const shellGeometry = useMemo(() => innerGeometry.clone(), [innerGeometry])
  const labelTexture = useMemo(createButterLabelTexture, [])
  const crackTexture = useMemo(createCrackTexture, [])
  const source = useMemo(
    () => captureDeformationSource(innerGeometry),
    [innerGeometry],
  )
  const impactsRef = useRef<DentImpact[]>([])
  const [waxBreaks, setWaxBreaks] = useState<WaxBreakRecord[]>([])
  const historyRef = useRef<SquishyImpact[]>([])
  const pendingTouchesRef = useRef(new Map<number, PendingTouch>())
  const hoverTargetRef = useRef(new THREE.Vector3(0, 0, 2))
  const hoverStrengthRef = useRef(0)
  const hoverGoalRef = useRef(0)
  const introRef = useRef({
    value: reducedMotion ? 1 : 0.72,
    velocity: 0,
  })
  const springScratchRef = useRef({ value: 0, velocity: 0 })
  const lastInteractionRef = useRef(performance.now())
  const needsBaselineRestoreRef = useRef(true)

  useEffect(() => {
    writeDeformedPositions(innerGeometry, source, [], 0)
    writeDeformedPositions(shellGeometry, source, [], SHELL_OFFSET)

    return () => {
      innerGeometry.dispose()
      shellGeometry.dispose()
      labelTexture.dispose()
      crackTexture.dispose()
      document.body.style.cursor = ''
    }
  }, [
    crackTexture,
    innerGeometry,
    labelTexture,
    shellGeometry,
    source,
  ])

  const commitImpact = useCallback(
    (impact: SquishyImpact) => {
      const impacts = impactsRef.current
      const nextImpact: DentImpact = {
        id: impact.id,
        localPoint: impact.localPoint,
        localNormal: impact.localNormal,
        amount: 1,
        velocity: 0,
      }

      if (impacts.length >= MAX_ACTIVE_IMPACTS) {
        impacts.sort((left, right) => Math.abs(left.amount) - Math.abs(right.amount))
        impacts.shift()
      }
      impacts.push(nextImpact)

      const history = historyRef.current
      history.push(impact)
      if (history.length > 16) {
        history.shift()
      }

      lastInteractionRef.current = performance.now()
      needsBaselineRestoreRef.current = true
      setWaxBreaks((current) => [
        ...current.slice(-7),
        {
          impact,
          seed: impactSequence * 7919,
        },
      ])
      onImpact?.(impact)
    },
    [onImpact],
  )

  const impactFromEvent = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!event.face || !(event.object instanceof THREE.Mesh)) {
        return null
      }

      impactSequence += 1
      return createSquishyImpact({
        id: `impact-${Math.round(performance.now())}-${impactSequence}`,
        timestampMs: performance.now(),
        pointerType: normalizePointerType(event.nativeEvent.pointerType),
        object: event.object,
        worldPoint: event.point,
        face: event.face,
      })
    },
    [],
  )

  const setHoverTarget = useCallback((impact: SquishyImpact) => {
    hoverTargetRef.current.set(
      impact.worldPoint[0] + impact.worldNormal[0] * 0.16,
      impact.worldPoint[1] + impact.worldNormal[1] * 0.16,
      impact.worldPoint[2] + impact.worldNormal[2] * 0.16,
    )
    hoverGoalRef.current = 1
  }, [])

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (event.nativeEvent.pointerType === 'touch') {
        const pending = pendingTouchesRef.current.get(event.nativeEvent.pointerId)
        if (pending) {
          const movement = Math.hypot(
            event.nativeEvent.clientX - pending.clientX,
            event.nativeEvent.clientY - pending.clientY,
          )
          if (movement > 10) {
            pendingTouchesRef.current.delete(event.nativeEvent.pointerId)
          }
        }
        return
      }

      const impact = impactFromEvent(event)
      if (impact) {
        setHoverTarget(impact)
        lastInteractionRef.current = performance.now()
      }
    },
    [impactFromEvent, setHoverTarget],
  )

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      const impact = impactFromEvent(event)
      if (!impact) {
        return
      }

      setHoverTarget(impact)

      if (impact.pointerType === 'touch') {
        const captureTarget = event.target as EventTarget & {
          setPointerCapture?: (pointerId: number) => void
        }
        try {
          captureTarget.setPointerCapture?.(event.nativeEvent.pointerId)
        } catch {
          // Pointer capture is an enhancement; the stored tap still works
          // when a browser declines capture for a synthetic or canceled event.
        }
        pendingTouchesRef.current.set(event.nativeEvent.pointerId, {
          clientX: event.nativeEvent.clientX,
          clientY: event.nativeEvent.clientY,
          startedAt: performance.now(),
          impact,
        })
        return
      }

      commitImpact(impact)
    },
    [commitImpact, impactFromEvent, setHoverTarget],
  )

  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const pending = pendingTouchesRef.current.get(event.nativeEvent.pointerId)
      const captureTarget = event.target as EventTarget & {
        hasPointerCapture?: (pointerId: number) => boolean
        releasePointerCapture?: (pointerId: number) => void
      }

      if (captureTarget.hasPointerCapture?.(event.nativeEvent.pointerId)) {
        try {
          captureTarget.releasePointerCapture?.(event.nativeEvent.pointerId)
        } catch {
          // The browser may already have released a canceled touch pointer.
        }
      }

      if (!pending) {
        return
      }

      pendingTouchesRef.current.delete(event.nativeEvent.pointerId)
      const duration = performance.now() - pending.startedAt

      if (
        isQualifiedTap({
          startX: pending.clientX,
          startY: pending.clientY,
          endX: event.nativeEvent.clientX,
          endY: event.nativeEvent.clientY,
          durationMs: duration,
        })
      ) {
        commitImpact(pending.impact)
        hoverGoalRef.current = 1
      }
    },
    [commitImpact],
  )

  const handlePointerCancel = useCallback((event: ThreeEvent<PointerEvent>) => {
    pendingTouchesRef.current.delete(event.nativeEvent.pointerId)
    hoverGoalRef.current = 0
  }, [])

  useFrame((state, delta) => {
    const now = performance.now()
    const impacts = impactsRef.current

    if (reducedMotion) {
      introRef.current.value = 1
      introRef.current.velocity = 0
    } else {
      stepSpring(introRef.current, 1, delta, INTRO_SPRING)
    }

    for (const impact of impacts) {
      const springScratch = springScratchRef.current
      springScratch.value = impact.amount
      springScratch.velocity = impact.velocity
      stepSpring(
        springScratch,
        0,
        delta,
        reducedMotion ? REDUCED_PRESS_SPRING : PRESS_SPRING,
      )
      impact.amount = springScratch.value
      impact.velocity = springScratch.velocity
    }

    for (let index = impacts.length - 1; index >= 0; index -= 1) {
      const impact = impacts[index]
      if (Math.abs(impact.amount) < 0.001 && Math.abs(impact.velocity) < 0.001) {
        impacts.splice(index, 1)
      }
    }

    if (impacts.length > 0) {
      writeDeformedPositions(innerGeometry, source, impacts, 0)
      writeDeformedPositions(shellGeometry, source, impacts, SHELL_OFFSET)
      needsBaselineRestoreRef.current = true
    } else if (needsBaselineRestoreRef.current) {
      writeDeformedPositions(innerGeometry, source, [], 0)
      writeDeformedPositions(shellGeometry, source, [], SHELL_OFFSET)
      needsBaselineRestoreRef.current = false
    }

    const newestImpact = impacts[impacts.length - 1]
    const compression = newestImpact ? Math.max(0, newestImpact.amount) : 0
    if (compressionRef.current) {
      const normal = newestImpact?.localNormal ?? DEFAULT_NORMAL
      compressionRef.current.scale.set(
        1 - 0.025 * Math.abs(normal[0]) * compression +
          0.006 * (1 - Math.abs(normal[0])) * compression,
        1 - 0.025 * Math.abs(normal[1]) * compression +
          0.006 * (1 - Math.abs(normal[1])) * compression,
        1 - 0.025 * Math.abs(normal[2]) * compression +
          0.006 * (1 - Math.abs(normal[2])) * compression,
      )
    }

    let idlePulse = 0
    if (!reducedMotion && now - lastInteractionRef.current > 6000) {
      const pulseTime = ((now - lastInteractionRef.current - 6000) / 1000) % 5
      if (pulseTime < 1.4) {
        idlePulse = Math.sin((pulseTime / 1.4) * Math.PI) ** 2 * 0.025
      }
    }

    if (presentationRef.current) {
      const scale = introRef.current.value * (1 + idlePulse)
      presentationRef.current.scale.setScalar(scale)
    }

    const hoverEase = 1 - Math.exp(-delta * 14)
    hoverStrengthRef.current = THREE.MathUtils.lerp(
      hoverStrengthRef.current,
      hoverGoalRef.current,
      hoverEase,
    )
    if (hoverLightRef.current) {
      hoverLightRef.current.position.lerp(hoverTargetRef.current, hoverEase)
      hoverLightRef.current.intensity = 4.2 * hoverStrengthRef.current
    }

    if (state.pointer.x === 0 && state.pointer.y === 0 && hoverGoalRef.current === 0) {
      hoverStrengthRef.current = 0
    }
  })

  return (
    <>
      <group ref={presentationRef} rotation={[-0.055, -0.11, 0]}>
        <group ref={compressionRef}>
          <mesh geometry={innerGeometry} castShadow receiveShadow>
            <meshStandardMaterial
              color="#f2c94c"
              metalness={0}
              roughness={0.7}
            />
          </mesh>
          <mesh
            geometry={shellGeometry}
            castShadow
            receiveShadow
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onPointerOver={() => {
              hoverGoalRef.current = 1
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              hoverGoalRef.current = 0
              document.body.style.cursor = ''
            }}
          >
            <meshPhysicalMaterial
              color="#ffe07a"
              clearcoat={0.7}
              clearcoatRoughness={0.22}
              ior={1.42}
              metalness={0}
              roughness={0.3}
              sheen={0.22}
              sheenColor="#fff4c4"
            />
            <mesh
              position={[0, 0, 0.672]}
              raycast={NO_RAYCAST}
              renderOrder={2}
            >
              <planeGeometry args={[3.72, 1.02]} />
              <meshBasicMaterial
                map={labelTexture}
                transparent
                depthWrite={false}
                alphaTest={0.015}
                opacity={0.92}
                polygonOffset
                polygonOffsetFactor={-8}
                toneMapped={false}
              />
            </mesh>
            {waxBreaks.map((record) => (
              <WaxBreak
                key={record.impact.id}
                crackTexture={crackTexture}
                record={record}
              />
            ))}
          </mesh>
        </group>
      </group>
      <pointLight
        ref={hoverLightRef}
        color="#fff8dc"
        decay={2}
        distance={1.7}
        intensity={0}
      />
    </>
  )
}
