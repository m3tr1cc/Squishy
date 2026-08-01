import { describe, expect, it, vi } from 'vitest'
import {
  buildPageHref,
  DEFAULT_PAGE_ROUTE,
  getPageNeighbors,
  getPageRouteById,
  getPageRouteByPathname,
  normalizePagePathname,
  resolvePageRoute,
} from '../src/navigation/pages'
import {
  pushPageRoute,
  shouldHandlePageLinkClick,
} from '../src/navigation/usePageNavigation'

describe('page routes', () => {
  it('normalizes root, missing-leading-slash, and trailing slashes', () => {
    expect(normalizePagePathname('')).toBe('/')
    expect(normalizePagePathname('/')).toBe('/')
    expect(normalizePagePathname('soaps/')).toBe('/soaps')
    expect(normalizePagePathname('/soaps///?preview=1')).toBe('/soaps')
  })

  it('resolves all pages and exposes a first-page unknown fallback', () => {
    expect(getPageRouteByPathname('/')).toMatchObject({ id: 'butter' })
    expect(getPageRouteByPathname('/soaps/')).toMatchObject({
      id: 'soaps',
    })
    expect(getPageRouteByPathname('/chocolate')).toMatchObject({
      id: 'chocolate',
    })
    expect(getPageRouteByPathname('/slime')).toMatchObject({
      id: 'slime',
    })
    expect(getPageRouteByPathname('/clicker/')).toMatchObject({
      id: 'clicker',
    })

    const unknown = resolvePageRoute('/missing')
    expect(unknown).toEqual({
      status: 'not-found',
      pathname: '/missing',
      route: null,
      fallbackRoute: DEFAULT_PAGE_ROUTE,
    })
  })

  it('uses non-wrapping previous and next neighbors', () => {
    expect(getPageNeighbors('butter')).toEqual({
      previous: null,
      next: getPageRouteById('soaps'),
    })
    expect(getPageNeighbors('soaps')).toEqual({
      previous: getPageRouteById('butter'),
      next: getPageRouteById('chocolate'),
    })
    expect(getPageNeighbors('chocolate')).toEqual({
      previous: getPageRouteById('soaps'),
      next: getPageRouteById('slime'),
    })
    expect(getPageNeighbors('slime')).toEqual({
      previous: getPageRouteById('chocolate'),
      next: getPageRouteById('clicker'),
    })
    expect(getPageNeighbors('clicker')).toEqual({
      previous: getPageRouteById('slime'),
      next: null,
    })
    expect(getPageNeighbors(null)).toEqual({
      previous: null,
      next: null,
    })
  })

  it('builds clean links while retaining the current query string', () => {
    expect(buildPageHref('/soaps', '?qaDpr=1.5')).toBe(
      '/soaps?qaDpr=1.5',
    )
    expect(buildPageHref('/soaps/', 'preview=1')).toBe(
      '/soaps?preview=1',
    )
    expect(buildPageHref('/')).toBe('/')
  })
})

describe('history navigation', () => {
  it('pushes a route once and preserves search parameters', () => {
    const pushState = vi.fn()
    const soaps = getPageRouteById('soaps')
    expect(soaps).not.toBeNull()

    const pushed = pushPageRoute(
      {
        history: { pushState },
        location: { pathname: '/', search: '?qaDpr=1.5' },
      },
      soaps!,
    )

    expect(pushed).toBe(true)
    expect(pushState).toHaveBeenCalledWith(
      { squishyPage: 'soaps' },
      '',
      '/soaps?qaDpr=1.5',
    )
  })

  it('does not add duplicate entries for the current route', () => {
    const pushState = vi.fn()
    const soaps = getPageRouteById('soaps')
    expect(soaps).not.toBeNull()

    expect(
      pushPageRoute(
        {
          history: { pushState },
          location: { pathname: '/soaps/', search: '' },
        },
        soaps!,
      ),
    ).toBe(false)
    expect(pushState).not.toHaveBeenCalled()
  })

  it('intercepts only unmodified primary-button link activation', () => {
    const baseEvent = {
      altKey: false,
      button: 0,
      ctrlKey: false,
      defaultPrevented: false,
      metaKey: false,
      shiftKey: false,
    }
    expect(shouldHandlePageLinkClick(baseEvent)).toBe(true)
    expect(
      shouldHandlePageLinkClick({ ...baseEvent, button: 1 }),
    ).toBe(false)
    expect(
      shouldHandlePageLinkClick({ ...baseEvent, ctrlKey: true }),
    ).toBe(false)
    expect(
      shouldHandlePageLinkClick({
        ...baseEvent,
        defaultPrevented: true,
      }),
    ).toBe(false)
  })
})
