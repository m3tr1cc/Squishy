import type { MouseEvent } from 'react'
import {
  buildPageHref,
  getPageNeighbors,
  PAGE_ROUTES,
  type PageId,
  type PageRoute,
} from './pages'
import { shouldHandlePageLinkClick } from './usePageNavigation'
import './PageNavigation.css'

type PageNavigationProps = Readonly<{
  currentPageId: PageId | null
  onNavigate?: (route: PageRoute) => void
  search?: string
}>

type Direction = 'previous' | 'next'

function ArrowIcon({ direction }: { direction: Direction }) {
  const path =
    direction === 'previous' ? 'm15 18-6-6 6-6' : 'm9 6 6 6-6 6'

  return (
    <svg
      aria-hidden="true"
      className="page-navigation__icon"
      viewBox="0 0 24 24"
    >
      <path d={path} />
    </svg>
  )
}

function PageArrow({
  direction,
  onNavigate,
  route,
  search,
}: Readonly<{
  direction: Direction
  onNavigate?: (route: PageRoute) => void
  route: PageRoute | null
  search: string
}>) {
  const directionLabel =
    direction === 'previous' ? 'Previous' : 'Next'

  if (!route) {
    return (
      <span
        aria-disabled="true"
        aria-label={`No ${direction} experience`}
        className="page-navigation__control page-navigation__control--disabled"
        role="link"
      >
        <ArrowIcon direction={direction} />
      </span>
    )
  }

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate || !shouldHandlePageLinkClick(event)) {
      return
    }

    event.preventDefault()
    onNavigate(route)
  }

  return (
    <a
      aria-label={`${directionLabel}: ${route.title}`}
      className="page-navigation__control"
      draggable={false}
      href={buildPageHref(route.path, search)}
      onClick={onNavigate ? handleClick : undefined}
    >
      <ArrowIcon direction={direction} />
    </a>
  )
}

export function PageNavigation({
  currentPageId,
  onNavigate,
  search = '',
}: PageNavigationProps) {
  const neighbors = getPageNeighbors(currentPageId)
  const pageIndex = PAGE_ROUTES.findIndex(
    (route) => route.id === currentPageId,
  )

  return (
    <nav
      aria-label="Squishy experiences"
      className="page-navigation"
    >
      <span className="page-navigation__status">
        {pageIndex >= 0
          ? `Page ${pageIndex + 1} of ${PAGE_ROUTES.length}`
          : 'Unknown page'}
      </span>
      <PageArrow
        direction="previous"
        onNavigate={onNavigate}
        route={neighbors.previous}
        search={search}
      />
      <PageArrow
        direction="next"
        onNavigate={onNavigate}
        route={neighbors.next}
        search={search}
      />
    </nav>
  )
}
