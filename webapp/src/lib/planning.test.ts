import { describe, expect, it } from 'vitest'
import type { StopAgg } from './aggregate'
import { networkPeakFromStops, shortTurnHints } from './planning'
import type { StopSequenceGeoRow } from '../types'

const stop = (patch: Partial<StopAgg> & { stop_abbr: string; route_direction_key: string }): StopAgg => ({
  stop_name: patch.stop_name ?? patch.stop_abbr,
  boarding: 0,
  alighting: 0,
  peak_load: 0,
  latitude: 0,
  longitude: 0,
  days: 1,
  ...patch,
})

describe('networkPeakFromStops', () => {
  it('returns the stop with the highest peak load', () => {
    const out = networkPeakFromStops([
      stop({ stop_abbr: 'A', route_direction_key: 'R1-up', peak_load: 20 }),
      stop({ stop_abbr: 'B', route_direction_key: 'R1-up', peak_load: 45, stop_name: 'Market' }),
    ])
    expect(out).toEqual({
      peakLoad: 45,
      stopAbbr: 'B',
      stopName: 'Market',
      routeDirectionKey: 'R1-up',
    })
  })

  it('returns null when every peak is zero', () => {
    expect(networkPeakFromStops([stop({ stop_abbr: 'A', route_direction_key: 'R1-up' })])).toBeNull()
  })
})

describe('shortTurnHints', () => {
  const seq = (dir: string, abbr: string, stop_no: number): StopSequenceGeoRow => ({
    route_direction_key: dir,
    stop_abbr: abbr,
    stop_no,
    latitude: 0,
    longitude: 0,
  })

  it('flags a max-load stop in the middle of the sequence', () => {
    const stops = [
      stop({ stop_abbr: 'A', route_direction_key: 'R1-up', peak_load: 5 }),
      stop({ stop_abbr: 'C', route_direction_key: 'R1-up', peak_load: 40, stop_name: 'Junction' }),
      stop({ stop_abbr: 'E', route_direction_key: 'R1-up', peak_load: 8 }),
    ]
    const sequence = [seq('R1-up', 'A', 1), seq('R1-up', 'B', 2), seq('R1-up', 'C', 3), seq('R1-up', 'D', 4), seq('R1-up', 'E', 8)]
    const out = shortTurnHints(stops, sequence)
    expect(out).toHaveLength(1)
    expect(out[0].mlpStopAbbr).toBe('C')
    expect(out[0].stopNo).toBe(3)
    expect(out[0].maxStopNo).toBe(8)
  })

  it('ignores a max-load stop at the terminal', () => {
    const stops = [stop({ stop_abbr: 'E', route_direction_key: 'R1-up', peak_load: 50 })]
    const sequence = [seq('R1-up', 'A', 1), seq('R1-up', 'C', 4), seq('R1-up', 'E', 8)]
    expect(shortTurnHints(stops, sequence)).toEqual([])
  })
})
