import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('labels its section from the visible card title', () => {
    const html = renderToStaticMarkup(
      createElement(Card, { title: 'Revenue by route', children: 'Chart' }),
    )
    const headingId = html.match(/<h2 id="([^"]+)"/)?.[1]
    expect(headingId).toBeTruthy()
    expect(html).toContain(`aria-labelledby="${headingId}"`)
  })

  it('always exposes a keyboard-accessible Explore button for drillable cards', () => {
    const html = renderToStaticMarkup(
      createElement(Card, {
        title: 'Load factor',
        onDrill: vi.fn(),
        children: 'Chart',
      }),
    )
    expect(html).toContain('<button')
    expect(html).toContain('Explore')
  })
})
