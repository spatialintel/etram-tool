const EXCEL_RE = /\.(xlsx|xls)$/i
const MAX_FILE = 50 * 1024 * 1024

export function validateExcelFile(file: { name: string; size: number }): string | null {
  if (!EXCEL_RE.test(file.name)) return `${file.name}: only .xlsx or .xls files are allowed`
  if (file.size === 0) return `${file.name}: file is empty (0 bytes)`
  if (file.size > MAX_FILE) return `${file.name}: exceeds 50 MB limit`
  return null
}

/** Maps an uploaded filename to an ingest slot; null means the user must place it manually. */
export function classifyFile(name: string): 'etm' | 'supporting' | 'stops' | null {
  const l = name.toLowerCase()
  if (/supporting/.test(l)) return 'supporting'
  if (/^etm/.test(l) || /\betm[_\s-]/i.test(name)) return 'etm'
  if (/stops?\s*seq|stopsseq|stop\s*sequence/i.test(l)) return 'stops'
  if (/^\d+\s*-\s*\d+/.test(name)) return 'stops'
  return null
}
