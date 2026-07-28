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
    expect(markup).toContain('Page 1 of 2')
  })

  it('renders a labelled root link and a disabled next end', () => {
    const markup = renderToStaticMarkup(
      createElement(PageNavigation, {
        currentPageId: 'soaps',
      }),
    )

    expect(markup).toContain('aria-label="Previous: Butter squishy"')
    expect(markup).toContain('href="/"')
    expect(markup).toContain('aria-label="No next experience"')
    expect(markup).toContain('Page 2 of 2')
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
