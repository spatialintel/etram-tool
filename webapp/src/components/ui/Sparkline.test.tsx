import { describe, expect, it } from 'vitest'
import { Sparkline } from './Sparkline'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

describe('Sparkline', () => {
  it('renders an empty svg for fewer than two points', () => {
    const html = renderToStaticMarkup(createElement(Sparkline, { values: [1] }))
    expect(html).toContain('<svg')
    expect(html).not.toContain('<polyline')
  })

  it('renders a polyline and end marker for a series', () => {
    const html = renderToStaticMarkup(createElement(Sparkline, { values: [1, 3, 2, 5] }))
    expect(html).toContain('<polyline')
    expect(html).toContain('<circle')
    expect(html).toContain('aria-label')
  })
})
