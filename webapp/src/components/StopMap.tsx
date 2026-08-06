import { useEffect, useRef, useState } from 'react'
import { LngLatBounds, Map, NavigationControl, Popup } from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export type StopMetric = 'boarding' | 'alighting' | 'net' | 'peak_load'

export type StopPoint = {
  stop_abbr: string
  stop_name: string
  boarding: number
  alighting: number
  peak_load: number
  latitude: number
  longitude: number
  route_direction_key?: string
}

export type Polyline = {
  route_direction_key: string
  coords: [number, number][]
}

/**
 * Used when the tile CDN is unreachable, which is common on restricted office
 * networks. Stops, routes and clusters still plot; only the streets are gone.
 */
const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#EFF3F8' } }],
}

/**
 * Raster OpenStreetMap needs no key and no vector-tile endpoint, so it is the
 * default that survives proxies which block the CARTO vector CDN.
 */
const OSM_RASTER: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '\u00A9 OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

const STYLES: Record<string, string | StyleSpecification> = {
  positron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  streets: OSM_RASTER,
  none: OFFLINE_STYLE,
}

export type Basemap = 'positron' | 'dark' | 'streets' | 'none'

const DATA_LAYERS = ['heat', 'unclustered', 'cluster-count', 'clusters', 'route-lines'] as const

function metricValue(s: StopPoint, metric: StopMetric): number {
  if (metric === 'boarding') return s.boarding
  if (metric === 'alighting') return s.alighting
  if (metric === 'peak_load') return s.peak_load
  return s.boarding - s.alighting
}

function circleColor(metric: StopMetric): string | unknown[] {
  if (metric === 'net') {
    return [
      'case',
      ['>', ['get', 'value'], 0], '#1B7A4E',
      ['<', ['get', 'value'], 0], '#DC2626',
      '#D97706',
    ]
  }
  return '#1B7A4E'
}

function toGeo(list: StopPoint[], metric: StopMetric) {
  return {
    type: 'FeatureCollection' as const,
    features: list
      .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((s) => ({
        type: 'Feature' as const,
        properties: {
          stop_abbr: s.stop_abbr,
          stop_name: s.stop_name,
          boarding: s.boarding,
          alighting: s.alighting,
          peak_load: s.peak_load,
          value: Math.abs(metricValue(s, metric)),
          signed: metricValue(s, metric),
          route_direction_key: s.route_direction_key ?? '',
        },
        geometry: { type: 'Point' as const, coordinates: [s.longitude, s.latitude] },
      })),
  }
}

function toLines(lines: Polyline[]) {
  return {
    type: 'FeatureCollection' as const,
    features: lines
      .filter((l) => l.coords.length >= 2)
      .map((l) => ({
        type: 'Feature' as const,
        properties: { route_direction_key: l.route_direction_key },
        geometry: { type: 'LineString' as const, coordinates: l.coords },
      })),
  }
}

function clearDataLayers(map: Map) {
  for (const id of DATA_LAYERS) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource('stops')) map.removeSource('stops')
  if (map.getSource('routes')) map.removeSource('routes')
}

export function StopMap({
  stops,
  height = 480,
  metric = 'peak_load',
  cluster = false,
  heat = false,
  basemap = 'streets',
  polylines = [],
  fitToken = 0,
  onStopClick,
}: {
  stops: StopPoint[]
  height?: number
  metric?: StopMetric
  cluster?: boolean
  heat?: boolean
  basemap?: Basemap
  polylines?: Polyline[]
  /** Increment to re-fit bounds. */
  fitToken?: number
  onStopClick?: (stop: StopPoint) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const stopsRef = useRef(stops)
  const metricRef = useRef(metric)
  const heatRef = useRef(heat)
  const clusterRef = useRef(cluster)
  const polylinesRef = useRef(polylines)
  const onStopClickRef = useRef(onStopClick)
  stopsRef.current = stops
  metricRef.current = metric
  heatRef.current = heat
  clusterRef.current = cluster
  polylinesRef.current = polylines
  onStopClickRef.current = onStopClick

  const offlineRef = useRef(false)
  const [offline, setOffline] = useState(false)
  const [ready, setReady] = useState(false)

  // Create / recreate map when basemap or clustering mode changes.
  useEffect(() => {
    offlineRef.current = false
    setOffline(false)
    setReady(false)
    if (!ref.current) return

    const map = new Map({
      container: ref.current,
      style: STYLES[basemap],
      center: [72.15, 21.76],
      zoom: 11,
      attributionControl: {},
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    let handlersBound = false
    const bindHandlers = () => {
      if (handlersBound) return
      handlersBound = true
      map.on('click', 'unclustered', (e: MapLayerMouseEvent) => {
        const f = e.features?.[0]
        if (!f || f.geometry.type !== 'Point') return
        const abbr = String(f.properties?.stop_abbr ?? '')
        const stop = stopsRef.current.find((s) => s.stop_abbr === abbr)
        if (stop && onStopClickRef.current) onStopClickRef.current(stop)
        else {
          new Popup({ offset: 12, closeButton: false })
            .setLngLat(f.geometry.coordinates as [number, number])
            .setHTML(`<strong>${f.properties?.stop_name ?? ''}</strong>`)
            .addTo(map)
        }
      })
      map.on('click', 'clusters', (e: MapLayerMouseEvent) => {
        const f = e.features?.[0]
        if (!f || f.geometry.type !== 'Point') return
        const source = map.getSource('stops') as GeoJSONSource
        const clusterId = f.properties?.cluster_id as number
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          if (zoom == null) return
          map.easeTo({ center: f.geometry.coordinates as [number, number], zoom })
        })
      })
      map.on('mouseenter', 'unclustered', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'unclustered', () => { map.getCanvas().style.cursor = '' })
    }

    /**
     * Always rebuild data layers on style.load. setStyle() drops sources, and an
     * early-return left the OSM fallback with streets but no stop circles.
     */
    const addLayers = () => {
      clearDataLayers(map)

      const useCluster = clusterRef.current
      map.addSource('stops', {
        type: 'geojson',
        data: toGeo(stopsRef.current, metricRef.current),
        cluster: useCluster,
        clusterMaxZoom: 14,
        clusterRadius: 42,
      })
      map.addSource('routes', { type: 'geojson', data: toLines(polylinesRef.current) })

      map.addLayer({
        id: 'route-lines',
        type: 'line',
        source: 'routes',
        paint: { 'line-color': '#2F9E6A', 'line-width': 3, 'line-opacity': 0.55 },
      })

      if (useCluster) {
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'stops',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#1B7A4E',
            'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
            'circle-opacity': 0.85,
          },
        })
        // Symbol layers need glyphs from the active style. After a failover to
        // OSM raster, glyphs are absent even if the original basemap was vector.
        if (map.getStyle()?.glyphs) {
          map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'stops',
            filter: ['has', 'point_count'],
            layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 11 },
            paint: { 'text-color': '#ffffff' },
          })
        }
      }

      map.addLayer({
        id: 'unclustered',
        type: 'circle',
        source: 'stops',
        filter: useCluster ? ['!', ['has', 'point_count']] : ['all'],
        paint: {
          'circle-color': circleColor(metricRef.current) as never,
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'value'],
            0, 7,
            50, 11,
            200, 18,
            500, 26,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.92,
        },
      })

      map.addLayer({
        id: 'heat',
        type: 'heatmap',
        source: 'stops',
        maxzoom: 15,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'value'], 0, 0, 200, 1],
          'heatmap-intensity': 1.1,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(232,247,239,0)',
            0.4, 'rgba(168,230,197,0.6)',
            1, 'rgba(27,122,78,0.9)',
          ],
          'heatmap-radius': 24,
          'heatmap-opacity': heatRef.current ? 0.75 : 0,
        },
      })

      bindHandlers()
      setReady(true)

      if (stopsRef.current.length > 0) {
        const bounds = new LngLatBounds()
        for (const s of stopsRef.current) bounds.extend([s.longitude, s.latitude])
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 })
        }
      }
    }

    // Only a style that never arrives triggers the fallback. Wiring this to the
    // generic 'error' event meant one failed tile blanked an otherwise fine map.
    const remote = typeof STYLES[basemap] === 'string'
    const failover = () => {
      if (offlineRef.current || map.isStyleLoaded()) return
      offlineRef.current = true
      setOffline(true)
      map.setStyle(OSM_RASTER)
    }

    const timer = remote ? window.setTimeout(failover, 8000) : 0
    const onError = (e: { error?: { message?: string } }) => {
      if (import.meta.env.DEV) console.warn('[StopMap]', e?.error?.message ?? e)
    }
    map.on('error', onError)
    map.on('style.load', addLayers)

    return () => {
      if (timer) window.clearTimeout(timer)
      setReady(false)
      map.remove()
      mapRef.current = null
    }
  }, [basemap, cluster])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.isStyleLoaded()) return
    const src = map.getSource('stops') as GeoJSONSource | undefined
    if (!src) return
    src.setData(toGeo(stops, metric))
    if (map.getLayer('unclustered')) {
      map.setPaintProperty('unclustered', 'circle-color', circleColor(metric) as never)
    }
    if (map.getLayer('heat')) {
      map.setPaintProperty('heat', 'heatmap-opacity', heat ? 0.75 : 0)
    }
  }, [stops, metric, heat, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.isStyleLoaded()) return
    const src = map.getSource('routes') as GeoJSONSource | undefined
    src?.setData(toLines(polylines))
  }, [polylines, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || stops.length === 0) return
    const bounds = new LngLatBounds()
    for (const s of stops) bounds.extend([s.longitude, s.latitude])
    if (bounds.isEmpty()) return
    map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 500 })
  }, [fitToken, stops, ready])

  return (
    <div className="stop-map-wrap">
      {offline && (
        <p className="stop-map-notice">
          The vector basemap did not respond, so the map fell back to OpenStreetMap tiles.
          No API key is involved: both sources are open and keyless. Stop positions, clusters
          and route lines are drawn from the dashboard data, not from the basemap host.
        </p>
      )}
      {ready && stops.length === 0 && (
        <p className="stop-map-notice">No stop coordinates in the current filter selection.</p>
      )}
      <div
        ref={ref}
        className="stop-map"
        style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden' }}
      />
    </div>
  )
}
