import { Canvas } from '@react-three/fiber'
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useCrackAudio } from './audio/useCrackAudio'
import {
  PageNavigation,
  usePageNavigation,
  type PageId,
  type PageRoute,
} from './navigation'
import { createSquishyPointerEvents } from './scene/createSquishyPointerEvents'
import { SquishyScene } from './scene/SquishyScene'
import type { SoapId } from './scene/soaps'

const LazySoapScene = lazy(() =>
  import('./scene/SoapScene').then((module) => ({
    default: module.SoapScene,
  })),
)

const LazyChocolateScene = lazy(() =>
  import('./scene/ChocolateScene').then((module) => ({
    default: module.ChocolateScene,
  })),
)

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

function LoadingState({ pageId }: { pageId: PageId }) {
  const message =
    pageId === 'soaps'
      ? 'Preparing six fresh coatings...'
      : pageId === 'chocolate'
        ? 'Tempering chocolate slime...'
        : 'Warming three fresh coatings...'
  return (
    <div className="status-card" role="status">
      {message}
    </div>
  )
}

type ExperienceSession = {
  pageId: PageId
  seed: number
  resetKey: number
  isComplete: boolean
  completedSoapId: SoapId | null
}

function createExperienceSession(pageId: PageId): ExperienceSession {
  return {
    pageId,
    seed: createCoatingSeed(),
    resetKey: 0,
    isComplete: false,
    completedSoapId: null,
  }
}

export function App() {
  const webGlSupported = useMemo(hasWebGl2Support, [])
  const navigation = usePageNavigation()
  const navigate = navigation.navigate
  const route = navigation.route
  const [session, setSession] = useState<ExperienceSession>(() =>
    createExperienceSession(route?.id ?? 'butter'),
  )
  const headingRef = useRef<HTMLHeadingElement>(null)
  const crackAudio = useCrackAudio(session.seed)
  const isCoarsePointer =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
  const maximumDpr = isCoarsePointer ? 1.25 : 1.5
  const canvasDpr = resolveCanvasDpr(maximumDpr)

  useEffect(() => {
    if (!route) {
      document.title = 'Experience not found · Squishy'
      return
    }

    document.title = `${route.title} · Squishy`
    if (session.pageId !== route.id) {
      setSession(createExperienceSession(route.id))
    }
    headingRef.current?.focus({ preventScroll: true })
  }, [route, session.pageId])

  const handleNavigate = useCallback(
    (nextRoute: PageRoute) => {
      navigate(nextRoute)
      setSession(createExperienceSession(nextRoute.id))
    },
    [navigate],
  )

  const handleButterComplete = useCallback(() => {
    setSession((current) => ({
      ...current,
      isComplete: true,
    }))
  }, [])
  const handleChocolateComplete = handleButterComplete

  const handleSoapComplete = useCallback((soapId: SoapId) => {
    setSession((current) => ({
      ...current,
      isComplete: true,
      completedSoapId: current.completedSoapId ?? soapId,
    }))
  }, [])

  const handleReset = useCallback(() => {
    setSession({
      ...createExperienceSession(session.pageId),
      resetKey: session.resetKey + 1,
    })
  }, [session.pageId, session.resetKey])

  if (!route) {
    return (
      <>
        <PageNavigation currentPageId={null} />
        <main className="app-shell app-shell--fallback">
          <div className="not-found-card" role="alert">
            <h1>That squishy is not here.</h1>
            <p>
              The butter, soap, and chocolate experiences are ready to
              crack.
            </p>
            <a href="/">Return to the butter</a>
          </div>
        </main>
      </>
    )
  }

  if (!webGlSupported) {
    return (
      <>
        <PageNavigation
          currentPageId={route.id}
          onNavigate={handleNavigate}
          search={navigation.search}
        />
        <main className="app-shell app-shell--fallback">
          <div
            className={
              route.id === 'soaps'
                ? 'fallback-soaps'
                : 'fallback-butter'
            }
            aria-hidden="true"
          />
          <div className="status-card" role="alert">
            This squishy needs a browser with WebGL 2 enabled.
          </div>
        </main>
      </>
    )
  }

  if (session.pageId !== route.id) {
    return (
      <>
        <PageNavigation
          currentPageId={route.id}
          onNavigate={handleNavigate}
          search={navigation.search}
        />
        <main className="app-shell" aria-busy="true">
          <LoadingState pageId={route.id} />
        </main>
      </>
    )
  }

  const pageDescription =
    route.id === 'soaps'
      ? 'Tap any of the six soaps to dent and crack its wax coating.'
      : route.id === 'chocolate'
        ? 'Click or tap the chocolate squares to crack the shell and spread the slime filling.'
        : 'Click or tap any of the three butter sticks to press its wax surface.'
  const liveMessage = session.isComplete
    ? route.id === 'soaps'
      ? 'A soap wax layer is fully broken. Re-coat all soaps to play again.'
      : route.id === 'chocolate'
        ? 'The chocolate shell is fully broken. Re-form it to play again.'
        : 'A butter wax layer is fully broken. Re-coat all three to play again.'
    : ''

  return (
    <>
      <PageNavigation
        currentPageId={route.id}
        onNavigate={handleNavigate}
        search={navigation.search}
      />
      <main
        aria-labelledby="experience-heading"
        className={`app-shell app-shell--${route.id}`}
      >
        <h1
          ref={headingRef}
          className="visually-hidden"
          id="experience-heading"
          tabIndex={-1}
        >
          {route.title}
        </h1>
        <p className="visually-hidden">{pageDescription}</p>
        <Suspense fallback={<LoadingState pageId={route.id} />}>
          <Canvas
            key={`${route.id}:${session.seed}:${session.resetKey}`}
            camera={{ fov: 32, near: 0.1, far: 100 }}
            className="squishy-canvas-stage"
            dpr={canvasDpr}
            events={createSquishyPointerEvents}
            gl={{
              alpha: false,
              antialias: true,
              powerPreference: 'high-performance',
            }}
            shadows={route.id === 'butter' ? 'percentage' : false}
          >
            {route.id === 'butter' ? (
              <SquishyScene
                coatingSeed={session.seed}
                onComplete={handleButterComplete}
                playCrackSound={crackAudio.play}
                resetKey={session.resetKey}
                unlockCrackAudio={crackAudio.unlock}
              />
            ) : route.id === 'soaps' ? (
              <Suspense fallback={null}>
                <LazySoapScene
                  coatingSeed={session.seed}
                  onComplete={handleSoapComplete}
                  playCrackSound={crackAudio.play}
                  unlockCrackAudio={crackAudio.unlock}
                />
              </Suspense>
            ) : (
              <Suspense fallback={null}>
                <LazyChocolateScene
                  coatingSeed={session.seed}
                  onComplete={handleChocolateComplete}
                  playCrackSound={crackAudio.play}
                  unlockCrackAudio={crackAudio.unlock}
                />
              </Suspense>
            )}
          </Canvas>
        </Suspense>
        {session.isComplete ? (
          <button
            className="recoat-button"
            onClick={handleReset}
            type="button"
          >
            {route.id === 'soaps'
              ? 'Re-coat soaps'
              : route.id === 'chocolate'
                ? 'Re-form chocolate'
                : 'Re-coat butters'}
          </button>
        ) : null}
        <div className="visually-hidden" aria-live="polite">
          {liveMessage}
        </div>
      </main>
    </>
  )
}
