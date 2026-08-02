export type PageRouteDefinition = Readonly<{
  id: string
  path: `/${string}`
  title: string
}>

export const PAGE_ROUTES = [
  {
    id: 'butter',
    path: '/',
    title: 'Butter squishy',
  },
  {
    id: 'soaps',
    path: '/soaps',
    title: 'Soap squishies',
  },
  {
    id: 'chocolate',
    path: '/chocolate',
    title: 'Chocolate slime',
  },
  {
    id: 'slime',
    path: '/slime',
    title: 'Slime container',
  },
  {
    id: 'clicker',
    path: '/clicker',
    title: 'Thocky clicker',
  },
  {
    id: 'ipod',
    path: '/ipod',
    title: 'Green iPod mini',
  },
] as const satisfies readonly PageRouteDefinition[]

export type PageRoute = (typeof PAGE_ROUTES)[number]
export type PageId = PageRoute['id']

export type PageRouteResolution =
  | Readonly<{
      status: 'matched'
      pathname: string
      route: PageRoute
      fallbackRoute: PageRoute
    }>
  | Readonly<{
      status: 'not-found'
      pathname: string
      route: null
      fallbackRoute: PageRoute
    }>

export type PageNeighbors = Readonly<{
  previous: PageRoute | null
  next: PageRoute | null
}>

export const DEFAULT_PAGE_ROUTE = PAGE_ROUTES[0]

export function normalizePagePathname(pathname: string) {
  const pathOnly = pathname.split(/[?#]/u, 1)[0] ?? ''
  const withLeadingSlash = pathOnly.startsWith('/')
    ? pathOnly
    : `/${pathOnly}`
  const withoutTrailingSlash =
    withLeadingSlash.length > 1
      ? withLeadingSlash.replace(/\/+$/u, '')
      : withLeadingSlash

  return withoutTrailingSlash || '/'
}

export function getPageRouteById(id: PageId) {
  return PAGE_ROUTES.find((route) => route.id === id) ?? null
}

export function getPageRouteByPathname(pathname: string) {
  const normalizedPathname = normalizePagePathname(pathname)
  return (
    PAGE_ROUTES.find((route) => route.path === normalizedPathname) ??
    null
  )
}

export function resolvePageRoute(
  pathname: string,
): PageRouteResolution {
  const normalizedPathname = normalizePagePathname(pathname)
  const route = getPageRouteByPathname(normalizedPathname)

  if (route) {
    return {
      status: 'matched',
      pathname: normalizedPathname,
      route,
      fallbackRoute: DEFAULT_PAGE_ROUTE,
    }
  }

  return {
    status: 'not-found',
    pathname: normalizedPathname,
    route: null,
    fallbackRoute: DEFAULT_PAGE_ROUTE,
  }
}

export function getPageNeighbors(
  page: PageId | PageRoute | null,
): PageNeighbors {
  if (!page) {
    return { previous: null, next: null }
  }

  const pageId = typeof page === 'string' ? page : page.id
  const pageIndex = PAGE_ROUTES.findIndex(
    (route) => route.id === pageId,
  )
  if (pageIndex < 0) {
    return { previous: null, next: null }
  }

  return {
    previous: PAGE_ROUTES[pageIndex - 1] ?? null,
    next: PAGE_ROUTES[pageIndex + 1] ?? null,
  }
}

export function buildPageHref(path: string, search = '') {
  const normalizedSearch =
    search.length === 0 || search.startsWith('?') ? search : `?${search}`
  return `${normalizePagePathname(path)}${normalizedSearch}`
}
