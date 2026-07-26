import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { SquishyScene } from './scene/SquishyScene'

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
  const [isComplete, setIsComplete] = useState(false)
  const maximumDpr =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
      ? 1.5
      : 1.75
  const handleComplete = useCallback(() => {
    setIsComplete(true)
  }, [])
  const handleReset = useCallback(() => {
    setIsComplete(false)
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
    <main className="app-shell">
      <h1 className="visually-hidden">Interactive wax-covered butter squishy</h1>
      <p className="visually-hidden">
        Click or tap the butter stick to press its wax surface.
      </p>
      <Suspense fallback={<LoadingState />}>
        <Canvas
          aria-label="Interactive wax-covered butter squishy"
          camera={{ fov: 32, near: 0.1, far: 80 }}
          dpr={[1, maximumDpr]}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance',
          }}
          shadows="percentage"
        >
          <SquishyScene
            onComplete={handleComplete}
            resetKey={resetKey}
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
