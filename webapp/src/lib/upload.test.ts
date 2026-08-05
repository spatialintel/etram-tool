import { describe, expect, it } from 'vitest'
import { classifyFile, validateExcelFile } from './upload'

describe('validateExcelFile', () => {
  it('accepts non-empty Excel files under the size cap', () => {
    expect(validateExcelFile({ name: 'ETM_Apr.xlsx', size: 1024 })).toBeNull()
    expect(validateExcelFile({ name: 'legacy.XLS', size: 1024 })).toBeNull()
  })

  it('rejects other extensions, empty files, and oversized files', () => {
    expect(validateExcelFile({ name: 'data.csv', size: 1024 })).toContain('only .xlsx or .xls')
    expect(validateExcelFile({ name: 'ETM.xlsx', size: 0 })).toContain('empty')
    expect(validateExcelFile({ name: 'ETM.xlsx', size: 51 * 1024 * 1024 })).toContain('50 MB')
  })
})

describe('classifyFile', () => {
  it('routes files to the ingest slot implied by the name', () => {
    expect(classifyFile('ETM_Bhavnagar_Apr.xlsx')).toBe('etm')
    expect(classifyFile('Supporting_Tables.xlsx')).toBe('supporting')
    expect(classifyFile('StopsSeq_R1.xlsx')).toBe('stops')
    expect(classifyFile('1-2.xlsx')).toBe('stops')
  })

  it('prefers the supporting match over the ETM prefix', () => {
    expect(classifyFile('ETM_Supporting.xlsx')).toBe('supporting')
  })

  it('returns null when the name carries no signal', () => {
    expect(classifyFile('book1.xlsx')).toBeNull()
  })
})
