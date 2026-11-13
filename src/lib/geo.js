// ---------------------------------------------------------------------------
// Precise places & road distances — free, no-key, client-side services.
//   Search:    Photon (Komoot, OpenStreetMap data) — built for autocomplete.
//   Reverse:   Nominatim (OpenStreetMap) — name for a lat/lon.
//   Routing:   OSRM public demo server — road distance between two points.
// All three are free for light use with fair-use limits; every call is
// debounced/cached here, and the app falls back to the built-in Kochi
// route matrix, then straight-line distance, then manual entry, so it
// keeps working offline or when a service is unreachable.
// ---------------------------------------------------------------------------

const PHOTON_URL = 'https://photon.komoot.io/api/'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

// Kerala bias for search ranking (the app's home turf — results elsewhere
// still work, Kerala ones just rank first).
const BIAS_LAT = 10.85
const BIAS_LON = 76.27

async function fetchJson(url, { signal, timeoutMs = 8000, headers = {} } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: signal || ctrl.signal,
      headers: { Accept: 'application/json', ...headers },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Search places by name. Returns [{ name, detail, lat, lon }], best first.
 * `name` is the place name; `detail` is e.g. "Kochi, Kerala, India".
 */
export async function searchPlaces(query, { signal, headers } = {}) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const url =
    `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=5&lang=en` +
    `&lat=${BIAS_LAT}&lon=${BIAS_LON}`
  const data = await fetchJson(url, { signal, timeoutMs: 8000, headers })
  return (data.features || []).map((f) => {
    const p = f.properties || {}
    const [lon, lat] = f.geometry?.coordinates || [null, null]
    const detail = [p.city || p.county, p.state, p.country]
      .filter(Boolean)
      .join(', ')
    return {
      name: p.name || q,
      detail: detail || p.osm_value || '',
      lat,
      lon,
    }
  }).filter((r) => r.lat != null && r.lon != null)
}

/**
 * Name for a lat/lon (used for the "current location" button).
 * Returns a short name like "Kalamassery, Kerala" or null.
 */
export async function reverseGeocode(lat, lon, { signal, headers } = {}) {
  const url =
    `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lon}` +
    `&zoom=14&addressdetails=1`
  const data = await fetchJson(url, { signal, timeoutMs: 8000, headers })
  const a = data.address || {}
  const place =
    a.village || a.town || a.city || a.municipality || a.suburb ||
    a.neighbourhood || a.road || data.name || null
  if (!place) return null
  const state = a.state ? `, ${a.state}` : ''
  return `${place}${state}`
}

/** Road distance in km between two { lat, lon } points, or null on failure. */
export async function getRoadDistance(a, b, { signal, headers } = {}) {
  const url =
    `${OSRM_URL}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`
  const data = await fetchJson(url, { signal, timeoutMs: 10000, headers })
  const route = data.routes?.[0]
  if (!route || typeof route.distance !== 'number') return null
  return route.distance / 1000
}

/** Straight-line distance in km (fallback when routing is unavailable). */
export function haversineKm(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
