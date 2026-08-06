const DATA_EXTS = /\.(xlsx|xls|csv)$/i
const MAX_FILE = 50 * 1024 * 1024

export function validateUploadFile(file: { name: string; size: number }): string | null {
  if (!DATA_EXTS.test(file.name)) return `${file.name}: only .xlsx, .xls, or .csv files are allowed`
  if (file.size === 0) return `${file.name}: file is empty (0 bytes)`
  if (file.size > MAX_FILE) return `${file.name}: exceeds 50 MB limit`
  return null
}

/** @deprecated use validateUploadFile */
export function validateExcelFile(file: { name: string; size: number }): string | null {
  return validateUploadFile(file)
}

export type UploadSlot = 'etm' | 'supporting' | 'stops' | 'distance'

/** Maps an uploaded filename to an ingest slot; null means the user must place it manually. */
export function classifyFile(name: string): UploadSlot | null {
  const l = name.toLowerCase()
  if (/supporting|stops\s*list|hod/.test(l) && !/stop\s*seq|conductor|ticket/.test(l)) {
    if (/supporting|hod/.test(l)) return 'supporting'
  }
  if (/supporting/.test(l)) return 'supporting'
  if (/fleet|stop\s*to\s*stop|distance|od\s*matrix/.test(l)) return 'distance'
  if (/conductor[_\s-]?report|tickets?_|\btickets\b|online_ticket|^etm/.test(l) || /\betm[_\s-]/i.test(name)) {
    return 'etm'
  }
  if (/stops?\s*seq|stopsseq|stop\s*sequence/i.test(l)) return 'stops'
  if (/^\d+\s*-\s*\d+/.test(name)) return 'stops'
  if (/\.csv$/i.test(name) && /report|ticket|etm/i.test(l)) return 'etm'
  return null
}
