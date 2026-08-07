import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { StatCard } from './StatCard'

describe('StatCard', () => {
  it('gives a clickable metric an intelligible accessible name', () => {
    const html = renderToStaticMarkup(
      createElement(StatCard, {
        label: 'Ridership',
        value: '142,318',
        onClick: vi.fn(),
      }),
    )
    expect(html).toContain('aria-label="Ridership — open breakdown"')
  })

  it('uses the configured exploration label', () => {
    const html = renderToStaticMarkup(
      createElement(StatCard, {
        label: 'Load factor',
        value: '58%',
        drillLabel: 'Route detail',
        onClick: vi.fn(),
      }),
    )
    expect(html).toContain('Route detail')
  })
})
