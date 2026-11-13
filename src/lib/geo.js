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

// Kochi bias for search ranking by default (the app's home turf — results
// elsewhere still work, Kochi/Kerala ones just rank first). When the user
// has already allowed location access, the live position replaces this.
const DEFAULT_BIAS = { lat: 9.9312, lon: 76.2673 } // Kochi

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
 * `bias` ({ lat, lon }) ranks nearby results first — Kochi by default, or
 * the user's location when permission was already granted. Results are
 * ordered Kochi/Kerala first, then India, then elsewhere.
 */
export async function searchPlaces(query, { signal, headers, bias } = {}) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const b = bias || DEFAULT_BIAS
  const url =
    `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=5&lang=en` +
    `&lat=${b.lat}&lon=${b.lon}`
  const data = await fetchJson(url, { signal, timeoutMs: 8000, headers })
  const results = (data.features || []).map((f) => {
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
      _state: p.state || '',
      _country: p.country || '',
    }
  }).filter((r) => r.lat != null && r.lon != null)
  // Preference order: Kerala first, then India, then elsewhere. Stable, so
  // Photon's own ranking (proximity to the bias point) holds within a tier.
  const tier = (r) => (r._state === 'Kerala' ? 0 : r._country === 'India' ? 1 : 2)
  return results
    .sort((a, b) => tier(a) - tier(b))
    .map(({ _state, _country, ...rest }) => rest)
}

/**
 * Geolocation permission state without prompting the user:
 * 'granted' | 'prompt' | 'denied' | 'unsupported'. Only when 'granted'
 * may the app read the position silently (no permission popup).
 */
export async function queryGeolocationPermission() {
  try {
    if (!('permissions' in navigator) || !navigator.permissions?.query) return 'unsupported'
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return 'unsupported'
  }
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
