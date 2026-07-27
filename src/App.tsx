import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { useCrackAudio } from './audio/useCrackAudio'
import { createSquishyPointerEvents } from './scene/createSquishyPointerEvents'
import { SquishyScene } from './scene/SquishyScene'

function createCoatingSeed() {
  const seed = new Uint32Array(1)
  crypto.getRandomValues(seed)
  return seed[0]
}

function resolveCanvasDpr(maximumDpr: number) {
  if (import.meta.env.DEV) {
    const requestedDpr = Number(
      new URLSearchParams(window.location.search).get('qaDpr'),
    )
    if (Number.isFinite(requestedDpr) && requestedDpr > 0) {
      return Math.min(maximumDpr, Math.max(1, requestedDpr))
    }
  }
  return [1, maximumDpr] as [number, number]
}

function hasWebGl2Support() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2'))
  } catch {
    return false
  }
}

function LoadingState() {
  return (
    <div className="status-card" role="status">
      Warming the wax...
    </div>
  )
}

export function App() {
  const webGlSupported = useMemo(hasWebGl2Support, [])
  const [resetKey, setResetKey] = useState(0)
  const [coatingSeed, setCoatingSeed] = useState(createCoatingSeed)
  const [isComplete, setIsComplete] = useState(false)
  const crackAudio = useCrackAudio(coatingSeed)
  const maximumDpr =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
      ? 1.5
      : 1.75
  const canvasDpr = resolveCanvasDpr(maximumDpr)
  const handleComplete = useCallback(() => {
    setIsComplete(true)
  }, [])
  const handleReset = useCallback(() => {
    setIsComplete(false)
    setCoatingSeed(createCoatingSeed())
    setResetKey((current) => current + 1)
  }, [])

  if (!webGlSupported) {
    return (
      <main className="app-shell app-shell--fallback">
        <div className="fallback-butter" aria-hidden="true" />
        <div className="status-card" role="alert">
          This squishy needs a browser with WebGL 2 enabled.
        </div>
      </main>
    )
  }

  return (
    <main
      aria-label="Interactive wax-covered butter squishy"
      className="app-shell"
    >
      <h1 className="visually-hidden">Interactive wax-covered butter squishy</h1>
      <p className="visually-hidden">
        Click or tap the butter stick to press its wax surface.
      </p>
      <Suspense fallback={<LoadingState />}>
        <Canvas
          camera={{ fov: 32, near: 0.1, far: 80 }}
          className="squishy-canvas-stage"
          dpr={canvasDpr}
          events={createSquishyPointerEvents}
          gl={{
            alpha: false,
            antialias: true,
            powerPreference: 'high-performance',
          }}
          shadows="percentage"
        >
          <SquishyScene
            coatingSeed={coatingSeed}
            onComplete={handleComplete}
            playCrackSound={crackAudio.play}
            resetKey={resetKey}
            unlockCrackAudio={crackAudio.unlock}
          />
        </Canvas>
      </Suspense>
      {isComplete ? (
        <button
          className="recoat-button"
          onClick={handleReset}
          type="button"
        >
          Re-coat wax
        </button>
      ) : null}
      <div className="visually-hidden" aria-live="polite">
        {isComplete
          ? 'The wax layer is fully broken. Re-coat the butter to play again.'
          : ''}
      </div>
    </main>
  )
}
