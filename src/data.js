// ---------------------------------------------------------------------------
// Static data bundled with the app.
// Fuel prices are from 13 Nov 2026, Ernakulam — editable in the app.
// ---------------------------------------------------------------------------

export const DEFAULT_PRICES = {
  city: 'Ernakulam',
  dateLabel: '13 Nov 2026',
  petrol: 113.53,
  diesel: 102.45,
}

export const PLACES = [
  'Kalamassery',
  'Edappally',
  'CUSAT',
  'Aluva',
  'Ernakulam',
  'Kakkanad',
  'Vyttila',
  'Palarivattom',
  'Fort Kochi',
  'Tripunithura',
  'Kuttippuram',
  'Thrissur',
]

// Road distances (km) between Kochi-area places. Pairs not listed here fall
// back to a manual distance field in the trip calculator.
const ROUTE_PAIRS = [
  ['Kalamassery', 'Edappally', 6],
  ['Kalamassery', 'CUSAT', 2],
  ['Kalamassery', 'Aluva', 8],
  ['Kalamassery', 'Ernakulam', 10],
  ['Kalamassery', 'Kakkanad', 9],
  ['Kalamassery', 'Vyttila', 12],
  ['Edappally', 'Palarivattom', 4],
  ['Edappally', 'Ernakulam', 7],
  ['Edappally', 'Vyttila', 8],
  ['Ernakulam', 'Vyttila', 6],
  ['Ernakulam', 'Fort Kochi', 12],
  ['Ernakulam', 'Tripunithura', 10],
]

const routeMap = new Map()
for (const [a, b, km] of ROUTE_PAIRS) {
  routeMap.set(`${a}|${b}`, km)
  routeMap.set(`${b}|${a}`, km)
}

/** Road distance in km between two places, or null when the pair is unknown. */
export function getRouteDistance(from, to) {
  if (!from || !to || from === to) return from === to ? 0 : null
  return routeMap.get(`${from}|${to}`) ?? null
}

// ---------------------------------------------------------------------------
// Vehicle catalog — claimed (company/ARAI) mileage figures.
// ---------------------------------------------------------------------------

export const VEHICLE_CATALOG = [
  { id: 'splendor', name: 'Hero Splendor Plus', type: 'Bike', fuel: 'petrol', claimed: 68 },
  { id: 'activa', name: 'Honda Activa 6G', type: 'Scooter', fuel: 'petrol', claimed: 60 },
  { id: 'raider', name: 'TVS Raider 125', type: 'Bike', fuel: 'petrol', claimed: 65 },
  { id: 'fzs', name: 'Yamaha FZ-S', type: 'Bike', fuel: 'petrol', claimed: 45 },
  { id: 'classic350', name: 'Royal Enfield Classic 350', type: 'Bike', fuel: 'petrol', claimed: 35 },
  { id: 'swift', name: 'Maruti Swift (Petrol)', type: 'Car', fuel: 'petrol', claimed: 25.75 },
  { id: 'alto', name: 'Maruti Alto K10', type: 'Car', fuel: 'petrol', claimed: 24 },
  { id: 'i20', name: 'Hyundai i20 (Petrol)', type: 'Car', fuel: 'petrol', claimed: 20 },
  { id: 'creta', name: 'Hyundai Creta (Diesel)', type: 'Car', fuel: 'diesel', claimed: 19 },
  { id: 'innova', name: 'Toyota Innova Crysta (Diesel)', type: 'Car', fuel: 'diesel', claimed: 15 },
]

export const QUICK_AMOUNTS = [100, 200, 500]

// ---------------------------------------------------------------------------
// Local places — real places the online providers miss, searched first.
// RJ Dreams Hostel is Kishan's hostel; it is on Google Maps but NOT in
// OpenStreetMap (checked Photon + Nominatim, 13 Nov 2026), so no OSM-based
// provider can find it. Coordinates from its public listing
// (10.050232, 76.331754, Kalamassery). Add more here the same way.
// ---------------------------------------------------------------------------

export const LOCAL_PLACES = [
  {
    name: 'RJ Dreams Hostel',
    detail: 'Kalamassery, Kerala, India',
    lat: 10.050232,
    lon: 76.331754,
  },
]

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatINR(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '₹0'
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: v % 1 === 0 ? 0 : 2 })
}
