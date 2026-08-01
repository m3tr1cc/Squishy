import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PageNavigation } from '../src/navigation/PageNavigation'

describe('page navigation controls', () => {
  it('renders a disabled previous end and a labelled soaps link', () => {
    const markup = renderToStaticMarkup(
      createElement(PageNavigation, {
        currentPageId: 'butter',
        search: '?preview=1',
      }),
    )

    expect(markup).toContain('aria-label="Squishy experiences"')
    expect(markup).toContain('aria-label="No previous experience"')
    expect(markup).toContain('aria-disabled="true"')
    expect(markup).toContain('aria-label="Next: Soap squishies"')
    expect(markup).toContain('href="/soaps?preview=1"')
    expect(markup).toContain('Page 1 of 5')
  })

  it('renders labelled links on the middle page', () => {
    const markup = renderToStaticMarkup(
      createElement(PageNavigation, {
        currentPageId: 'soaps',
      }),
    )

    expect(markup).toContain('aria-label="Previous: Butter squishy"')
    expect(markup).toContain('href="/"')
    expect(markup).toContain('aria-label="Next: Chocolate slime"')
    expect(markup).toContain('href="/chocolate"')
    expect(markup).toContain('Page 2 of 5')
  })

  it('renders slime as the next experience after chocolate', () => {
    const markup = renderToStaticMarkup(
      createElement(PageNavigation, {
        currentPageId: 'chocolate',
      }),
    )

    expect(markup).toContain('aria-label="Previous: Soap squishies"')
    expect(markup).toContain('href="/soaps"')
    expect(markup).toContain('aria-label="Next: Slime container"')
    expect(markup).toContain('href="/slime"')
    expect(markup).toContain('Page 3 of 5')
  })

  it('renders slime between chocolate and clicker', () => {
    const markup = renderToStaticMarkup(
      createElement(PageNavigation, {
        currentPageId: 'slime',
      }),
    )

    expect(markup).toContain('aria-label="Previous: Chocolate slime"')
    expect(markup).toContain('href="/chocolate"')
    expect(markup).toContain('aria-label="Next: Thocky clicker"')
    expect(markup).toContain('href="/clicker"')
    expect(markup).toContain('Page 4 of 5')
  })

  it('renders slime as previous and disables next on clicker', () => {
    const markup = renderToStaticMarkup(
      createElement(PageNavigation, {
        currentPageId: 'clicker',
      }),
    )

    expect(markup).toContain('aria-label="Previous: Slime container"')
    expect(markup).toContain('href="/slime"')
    expect(markup).toContain('aria-label="No next experience"')
    expect(markup).toContain('Page 5 of 5')
  })

  it('disables both directions for an unresolved page', () => {
    const markup = renderToStaticMarkup(
      createElement(PageNavigation, {
        currentPageId: null,
      }),
    )

    expect(markup).toContain('aria-label="No previous experience"')
    expect(markup).toContain('aria-label="No next experience"')
    expect(markup).toContain('Unknown page')
  })
})
