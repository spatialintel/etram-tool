import type { StopAgg } from './aggregate'
import type { StopSequenceGeoRow } from '../types'

/** MoHUA / CEPT ESCBS city-bus planning floor (Chandigarh), km per bus-day. */
export const MOHUA_VKM_PER_BUS_DAY = 200

export type NetworkPeak = {
  peakLoad: number
  stopAbbr: string
  stopName: string
  routeDirectionKey: string
}

/** Highest onboard peak among aggregated stop rows (max, not a sum). */
export function networkPeakFromStops(stops: StopAgg[]): NetworkPeak | null {
  if (stops.length === 0) return null
  const top = stops.reduce((m, r) => (r.peak_load > m.peak_load ? r : m), stops[0])
  if (!(top.peak_load > 0)) return null
  return {
    peakLoad: top.peak_load,
    stopAbbr: top.stop_abbr,
    stopName: top.stop_name,
    routeDirectionKey: top.route_direction_key,
  }
}

export type ShortTurnHint = {
  routeDirectionKey: string
  mlpStopAbbr: string
  mlpStopName: string
  stopNo: number
  maxStopNo: number
  peakLoad: number
}

/**
 * Flag a line when its max-load stop sits mid-route (about 15–70% along the
 * published sequence, and not the last two stops). That pattern is a short-turn
 * or mid-route crowding signal, not a clock-time schedule check.
 */
export function shortTurnHints(stops: StopAgg[], seq: StopSequenceGeoRow[]): ShortTurnHint[] {
  if (stops.length === 0 || seq.length === 0) return []

  const stopNo = new Map<string, number>()
  const maxNo = new Map<string, number>()
  for (const r of seq) {
    const key = `${r.route_direction_key}|${r.stop_abbr}`
    stopNo.set(key, r.stop_no)
    const prev = maxNo.get(r.route_direction_key) ?? 0
    if (r.stop_no > prev) maxNo.set(r.route_direction_key, r.stop_no)
  }

  const mlp = new Map<string, StopAgg>()
  for (const s of stops) {
    const cur = mlp.get(s.route_direction_key)
    if (!cur || s.peak_load > cur.peak_load) mlp.set(s.route_direction_key, s)
  }

  const out: ShortTurnHint[] = []
  for (const [dir, s] of mlp) {
    if (!(s.peak_load > 0)) continue
    const n = stopNo.get(`${dir}|${s.stop_abbr}`)
    const max = maxNo.get(dir)
    if (n == null || max == null || max < 3) continue
    const frac = n / max
    if (frac <= 0.15 || frac >= 0.7) continue
    if (n >= max - 1) continue
    out.push({
      routeDirectionKey: dir,
      mlpStopAbbr: s.stop_abbr,
      mlpStopName: s.stop_name,
      stopNo: n,
      maxStopNo: max,
      peakLoad: s.peak_load,
    })
  }
  return out.sort((a, b) => b.peakLoad - a.peakLoad)
}
