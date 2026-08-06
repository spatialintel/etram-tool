import { describe, expect, it } from 'vitest'
import { classifyFile, validateUploadFile } from './upload'

describe('validateUploadFile', () => {
  it('accepts Excel and CSV under the size cap', () => {
    expect(validateUploadFile({ name: 'ETM_Apr.xlsx', size: 1024 })).toBeNull()
    expect(validateUploadFile({ name: 'Conductor_Report.csv', size: 1024 })).toBeNull()
  })

  it('rejects other extensions, empty files, and oversized files', () => {
    expect(validateUploadFile({ name: 'data.txt', size: 1024 })).toContain('only .xlsx')
    expect(validateUploadFile({ name: 'ETM.xlsx', size: 0 })).toContain('empty')
    expect(validateUploadFile({ name: 'ETM.xlsx', size: 51 * 1024 * 1024 })).toContain('50 MB')
  })
})

describe('classifyFile', () => {
  it('routes files to the ingest slot implied by the name', () => {
    expect(classifyFile('ETM_Bhavnagar_Apr.xlsx')).toBe('etm')
    expect(classifyFile('Conductor_Report_2026-05-01_to_2026-05-07.csv')).toBe('etm')
    expect(classifyFile('Supporting_Tables.xlsx')).toBe('supporting')
    expect(classifyFile('Supporting data by HOD.xlsx')).toBe('supporting')
    expect(classifyFile('100 FLEET(STOP TO STOP DISTANCE)_29.07.2026.xlsx')).toBe('distance')
    expect(classifyFile('StopsSeq_R1.xlsx')).toBe('stops')
    expect(classifyFile('1-2.xlsx')).toBe('stops')
    expect(classifyFile('01-05-2026.xlsx')).toBe('stops')
  })

  it('prefers the supporting match over the ETM prefix', () => {
    expect(classifyFile('ETM_Supporting.xlsx')).toBe('supporting')
  })

  it('returns null when the name carries no signal', () => {
    expect(classifyFile('book1.xlsx')).toBeNull()
  })
})
