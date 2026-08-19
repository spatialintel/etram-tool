/** WGS84 point, or null if it cannot be plotted (clustered MapLibre drops lon outside ±180). */
export function parseLngLat(
  latitude: unknown,
  longitude: unknown,
): { latitude: number; longitude: number } | null {
  const lat = typeof latitude === 'number' ? latitude : Number(latitude)
  const lng = typeof longitude === 'number' ? longitude : Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { latitude: lat, longitude: lng }
}
