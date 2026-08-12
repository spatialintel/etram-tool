import { describe, expect, it } from 'vitest'
import { fmtRuleValue } from './OverviewPage'

describe('fmtRuleValue', () => {
  it('formats *_pct and *_coverage ids as a percentage', () => {
    expect(fmtRuleValue('ticket_id_null_pct', 0.1)).toBe('10.0%')
    expect(fmtRuleValue('gender_coverage', 0.3333)).toBe('33.3%')
  })

  it('formats plain counts as integers, not percentages', () => {
    expect(fmtRuleValue('negative_revenue', 3)).toBe('3')
    expect(fmtRuleValue('duplicate_stop_no', 0)).toBe('0')
  })

  it('summarizes list values with a count and a preview', () => {
    expect(fmtRuleValue('ticket_dates_missing_sequence', [])).toBe('0')
    expect(fmtRuleValue('ticket_dates_missing_sequence', ['2026-04-02'])).toBe('1 \u2014 2026-04-02')
    expect(fmtRuleValue('ticket_dates_missing_sequence', ['a', 'b', 'c', 'd'])).toBe('4 \u2014 a, b, c\u2026')
  })

  it('falls back to a dash for null/undefined, and to String() otherwise', () => {
    expect(fmtRuleValue('some_rule', null)).toBe('\u2014')
    expect(fmtRuleValue('some_rule', undefined)).toBe('\u2014')
    expect(fmtRuleValue('some_rule', 'text value')).toBe('text value')
  })
})
