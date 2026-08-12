import { describe, expect, it } from 'vitest'
import { nextTabFocusTarget } from './useFocusTrap'

// nextTabFocusTarget only compares references and reads array position — it
// never calls a DOM method on these — so plain tagged objects stand in for
// real elements fine, and this runs under vitest's `environment: 'node'`
// (no `document`) same as every other test in this repo.
function el(name: string) {
  return { name } as unknown as HTMLElement
}

describe('nextTabFocusTarget', () => {
  const first = el('first')
  const middle = el('middle')
  const last = el('last')
  const focusable = [first, middle, last]
  const contains = () => true // active element is inside the panel

  it('wraps Tab from the last element back to the first', () => {
    expect(nextTabFocusTarget(focusable, last, false, contains)).toBe(first)
  })

  it('wraps Shift+Tab from the first element back to the last', () => {
    expect(nextTabFocusTarget(focusable, first, true, contains)).toBe(last)
  })

  it('lets the browser handle Tab when focus is not at an edge', () => {
    expect(nextTabFocusTarget(focusable, middle, false, contains)).toBeNull()
    expect(nextTabFocusTarget(focusable, middle, true, contains)).toBeNull()
  })

  it('snaps focus back into the panel if it somehow escaped', () => {
    const outsideElement = el('outside')
    const outsideContains = () => false
    expect(nextTabFocusTarget(focusable, outsideElement, false, outsideContains)).toBe(first)
    expect(nextTabFocusTarget(focusable, outsideElement, true, outsideContains)).toBe(last)
  })

  it('a single focusable element wraps to itself', () => {
    expect(nextTabFocusTarget([first], first, false, contains)).toBe(first)
    expect(nextTabFocusTarget([first], first, true, contains)).toBe(first)
  })

  it('returns null when there is nothing focusable (caller still traps via preventDefault)', () => {
    expect(nextTabFocusTarget([], null, false, contains)).toBeNull()
  })
})
