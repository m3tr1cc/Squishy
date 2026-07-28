import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  buildPageHref,
  getPageNeighbors,
  getPageRouteById,
  resolvePageRoute,
  type PageId,
  type PageRoute,
} from './pages'

const PAGE_NAVIGATION_EVENT = 'squishy:page-navigation'

type BrowserLocationSnapshot = Readonly<{
  pathname: string
  search: string
}>

export type PageNavigationEnvironment = Readonly<{
  history: Pick<History, 'pushState'>
  location: Pick<Location, 'pathname' | 'search'>
}>

export type PageLinkClick = Readonly<{
  altKey: boolean
  button: number
  ctrlKey: boolean
  defaultPrevented: boolean
  metaKey: boolean
  shiftKey: boolean
}>

function readBrowserLocation(): BrowserLocationSnapshot {
  if (typeof window === 'undefined') {
    return { pathname: '/', search: '' }
  }

  return {
    pathname: window.location.pathname,
    search: window.location.search,
  }
}

export function shouldHandlePageLinkClick(event: PageLinkClick) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  )
}

export function pushPageRoute(
  environment: PageNavigationEnvironment,
  route: PageRoute,
) {
  const currentRoute = resolvePageRoute(environment.location.pathname)
  if (
    currentRoute.status === 'matched' &&
    currentRoute.route.id === route.id
  ) {
    return false
  }

  environment.history.pushState(
    { squishyPage: route.id },
    '',
    buildPageHref(route.path, environment.location.search),
  )
  return true
}

export function usePageNavigation() {
  const [browserLocation, setBrowserLocation] =
    useState<BrowserLocationSnapshot>(readBrowserLocation)

  useEffect(() => {
    const updateLocation = () => {
      setBrowserLocation(readBrowserLocation())
    }

    window.addEventListener('popstate', updateLocation)
    window.addEventListener(PAGE_NAVIGATION_EVENT, updateLocation)
    return () => {
      window.removeEventListener('popstate', updateLocation)
      window.removeEventListener(PAGE_NAVIGATION_EVENT, updateLocation)
    }
  }, [])

  const resolution = useMemo(
    () => resolvePageRoute(browserLocation.pathname),
    [browserLocation.pathname],
  )
  const neighbors = useMemo(
    () => getPageNeighbors(resolution.route),
    [resolution.route],
  )

  const navigate = useCallback((route: PageRoute) => {
    if (
      pushPageRoute(
        { history: window.history, location: window.location },
        route,
      )
    ) {
      window.dispatchEvent(new Event(PAGE_NAVIGATION_EVENT))
    }
  }, [])

  const navigateById = useCallback(
    (pageId: PageId) => {
      const route = getPageRouteById(pageId)
      if (route) {
        navigate(route)
      }
    },
    [navigate],
  )

  const hrefFor = useCallback(
    (route: PageRoute) =>
      buildPageHref(route.path, browserLocation.search),
    [browserLocation.search],
  )

  return {
    fallbackRoute: resolution.fallbackRoute,
    hrefFor,
    isNotFound: resolution.status === 'not-found',
    navigate,
    navigateById,
    nextRoute: neighbors.next,
    pathname: resolution.pathname,
    previousRoute: neighbors.previous,
    route: resolution.route,
    search: browserLocation.search,
  } as const
}
