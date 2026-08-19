import { describe, expect, it } from 'vitest'
import { parseLngLat } from './geo'

describe('parseLngLat', () => {
  it('keeps numeric WGS84 points', () => {
    expect(parseLngLat(21.76, 72.15)).toEqual({ latitude: 21.76, longitude: 72.15 })
  })

  it('coerces numeric strings from JSON', () => {
    expect(parseLngLat('21.76', '72.15')).toEqual({ latitude: 21.76, longitude: 72.15 })
  })

  it('drops projected or swapped-out-of-range coordinates that clustering would hide', () => {
    expect(parseLngLat(21.76, 721500)).toBeNull()
    expect(parseLngLat(null, 72.15)).toBeNull()
    expect(parseLngLat(Number.NaN, 72.15)).toBeNull()
  })
})
