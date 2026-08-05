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

  it('marks a lower-is-better target as successful below its target', () => {
    const html = renderToStaticMarkup(
      createElement(StatCard, {
        label: 'Peak headway',
        value: '22 min',
        target: {
          value: 30,
          current: 22,
          label: 'Target at most 30 min',
          direction: 'lower',
        },
      }),
    )
    expect(html).toContain('On target')
    expect(html).toContain('is-good')
  })
})
