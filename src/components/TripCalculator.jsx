import { useEffect, useRef, useState } from 'react'
import { getRouteDistance, formatINR } from '../data.js'
import {
  searchPlaces,
  reverseGeocode,
  getRoadDistance,
  haversineKm,
  queryGeolocationPermission,
} from '../lib/geo.js'

/**
 * Step 2 — trip cost calculator.
 * From/To are now real places, not a fixed list: type to search (Photon /
 * OpenStreetMap, Kerala-biased), pick a suggestion, and the road distance
 * comes from OSRM. Fallbacks, in order: built-in Kochi route matrix (when
 * both names match it), straight-line distance, manual entry — so the
 * calculator keeps working offline or when a service is unreachable.
 * A "use my location" button fills From from the device GPS (reverse
 * geocoded to a place name). Can use the vehicle's claimed mileage, its
 * measured mileage (once logged), or a custom figure.
 */

const roadCache = new Map() // "lat,lon|lat,lon" -> km

/** One endpoint: { query (typed text), place ({ name, detail, lat, lon } | null) } */
function PlaceInput({ label, endpoint, onEndpointChange, onFocus, bias }) {
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [searchError, setSearchError] = useState('')
  const abortRef = useRef(null)
  const blurTimer = useRef(null)
  // Search only after the user has typed in this field — never on load.
  const touchedRef = useRef(false)

  const query = endpoint.query
  const pickedName = endpoint.place?.name || ''

  // Debounced search while the user types (not when a suggestion was picked).
  useEffect(() => {
    if (!touchedRef.current) return
    if (query.trim().length < 2 || query === pickedName) {
      setSuggestions([])
      setSearching(false)
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const results = await searchPlaces(query, { signal: ctrl.signal, bias })
        if (ctrl.signal.aborted) return
        setSuggestions(results)
        setSearchError('')
        setOpen(results.length > 0)
        setActive(-1)
      } catch (e) {
        if (e?.name !== 'AbortError') {
          setSuggestions([])
          setSearchError('Place search needs internet.')
        }
      } finally {
        if (!ctrl.signal.aborted) setSearching(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [query, pickedName, bias])

  function pick(s) {
    onEndpointChange({ query: s.name, place: s })
    setSuggestions([])
    setOpen(false)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && open && suggestions.length) {
      e.preventDefault()
      pick(suggestions[Math.max(active, 0)])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <label className="field place-field">
      {label}
      <div className="place-wrap">
        <input
          type="text"
          value={query}
          autoComplete="off"
          placeholder="Type a place…"
          onChange={(e) => {
            touchedRef.current = true
            onEndpointChange({ query: e.target.value, place: null })
            setOpen(true)
          }}
          onFocus={() => {
            if (onFocus) onFocus()
            if (suggestions.length) setOpen(true)
          }}
          onBlur={() => {
            // Let a suggestion tap land before closing.
            blurTimer.current = setTimeout(() => setOpen(false), 150)
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${label}-suggestions`}
        />
        {open && suggestions.length > 0 && (
          <div
            className="suggestions"
            id={`${label}-suggestions`}
            role="listbox"
          >
            {suggestions.map((s, i) => (
              <button
                key={`${s.name}-${s.lat}-${s.lon}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className={i === active ? 'suggestion active' : 'suggestion'}
                onMouseDown={(e) => {
                  e.preventDefault()
                  clearTimeout(blurTimer.current)
                  pick(s)
                }}
              >
                <span>{s.name}</span>
                {s.detail && <small>{s.detail}</small>}
              </button>
            ))}
          </div>
        )}
      </div>
      {searching && <span className="chip-note">Searching…</span>}
      {searchError && !searching && (
        <span className="chip-note">{searchError}</span>
      )}
    </label>
  )
}

export default function TripCalculator({
  prices,
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  measuredAvg,
}) {
  // Both fields start empty — nothing is searched or shown until the user types.
  const [from, setFrom] = useState({ query: '', place: null })
  const [to, setTo] = useState({ query: '', place: null })
  const [manualKm, setManualKm] = useState('')
  const [mileageMode, setMileageMode] = useState('claimed') // claimed | measured | custom
  const [customMileage, setCustomMileage] = useState('')
  const [roundTrip, setRoundTrip] = useState(false)
  const [result, setResult] = useState(null)
  const [distanceInfo, setDistanceInfo] = useState({
    km: null,
    source: null,
    loading: false,
  })
  const [locState, setLocState] = useState('') // '', 'locating', 'done', 'denied', 'unavailable'
  // Search bias: the user's location when permission was already granted,
  // otherwise Kochi (the default in geo.js). Checked once on load — this
  // never triggers a permission popup; it only reads the position when
  // permission is already 'granted'.
  const [userLoc, setUserLoc] = useState(null)
  useEffect(() => {
    let cancelled = false
    async function initBias() {
      if (!('geolocation' in navigator)) return
      const permission = await queryGeolocationPermission()
      if (cancelled || permission !== 'granted') return
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!cancelled) setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        },
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
      )
    }
    initBias()
    return () => {
      cancelled = true
    }
  }, [])

  const vehicle = vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0]

  const samePlace =
    from.query.trim() !== '' &&
    from.query.trim().toLowerCase() === to.query.trim().toLowerCase()

  // Resolve the distance whenever the endpoints change.
  useEffect(() => {
    let cancelled = false
    async function resolve() {
      if (samePlace) {
        setDistanceInfo({ km: null, source: null, loading: false })
        return
      }
      const a = from.place
      const b = to.place
      if (a && b) {
        const key = `${a.lat},${a.lon}|${b.lat},${b.lon}`
        if (roadCache.has(key)) {
          setDistanceInfo({ km: roadCache.get(key), source: 'osrm', loading: false })
          return
        }
        setDistanceInfo({ km: null, source: null, loading: true })
        try {
          const km = await getRoadDistance(a, b)
          if (cancelled) return
          if (km != null) {
            roadCache.set(key, km)
            setDistanceInfo({ km, source: 'osrm', loading: false })
            return
          }
        } catch {
          // Fall through to straight-line distance.
        }
        if (cancelled) return
        setDistanceInfo({ km: haversineKm(a, b), source: 'straight', loading: false })
        return
      }
      // No coordinates: fall back to the built-in Kochi route matrix.
      const known = getRouteDistance(from.query, to.query)
      if (known != null) {
        setDistanceInfo({ km: known, source: 'known', loading: false })
        return
      }
      setDistanceInfo({ km: null, source: null, loading: false })
    }
    resolve()
    return () => {
      cancelled = true
    }
  }, [from, to, samePlace])

  const distance =
    distanceInfo.km !== null ? distanceInfo.km : parseFloat(manualKm) || 0
  const fuelPrice = vehicle ? prices[vehicle.fuel] : prices.petrol

  const effectiveMileage =
    mileageMode === 'measured' && measuredAvg
      ? measuredAvg
      : mileageMode === 'custom'
        ? parseFloat(customMileage) || 0
        : vehicle
          ? vehicle.claimed
          : 0

  function swap() {
    setFrom(to)
    setTo(from)
    setResult(null)
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setLocState('unavailable')
      return
    }
    setLocState('locating')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        let name = null
        try {
          name = await reverseGeocode(latitude, longitude)
        } catch {
          name = null
        }
        const label = name || 'My location'
        setFrom({ query: label, place: { name: label, detail: '', lat: latitude, lon: longitude } })
        setUserLoc({ lat: latitude, lon: longitude })
        setLocState('done')
      },
      (err) => {
        setLocState(err.code === 1 ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  function computeResult() {
    if (!vehicle || !distance || distance <= 0 || !effectiveMileage || effectiveMileage <= 0) {
      return { error: 'Pick a route, a vehicle and a mileage to calculate.' }
    }
    const oneWayKm = distance
    const totalKm = roundTrip ? distance * 2 : distance
    const litres = totalKm / effectiveMileage
    const cost = litres * fuelPrice
    return {
      oneWayKm,
      totalKm,
      litres,
      cost,
      perKm: cost / totalKm,
      mileageUsed: effectiveMileage,
      mileageSource:
        mileageMode === 'measured'
          ? 'your measured mileage'
          : mileageMode === 'custom'
            ? 'custom mileage'
            : 'claimed mileage',
      fuelPrice,
      fuelLabel: vehicle.fuel === 'diesel' ? 'Diesel' : 'Petrol',
    }
  }

  function calculate() {
    setResult(computeResult())
  }

  // Once a result exists, keep it live: toggling round trip, swapping
  // places, or changing vehicle/mileage updates the numbers immediately
  // instead of leaving a stale result under a new label.
  useEffect(() => {
    if (result !== null) setResult(computeResult())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distance, vehicle, effectiveMileage, mileageMode, roundTrip, fuelPrice])

  return (
    <section className="card" aria-label="Trip cost calculator">
      <div className="step-label">Step 2 · What will this trip cost?</div>

      <div className="field-row">
        <PlaceInput label="From" endpoint={from} onEndpointChange={(e) => { setFrom(e); setResult(null) }} bias={userLoc} />
        <button type="button" className="btn btn-icon swap-btn" onClick={swap} aria-label="Swap from and to">
          ⇄
        </button>
        <PlaceInput label="To" endpoint={to} onEndpointChange={(e) => { setTo(e); setResult(null) }} bias={userLoc} />
      </div>

      <div className="loc-row">
        <button
          type="button"
          className="btn btn-mini"
          onClick={useMyLocation}
          disabled={locState === 'locating'}
        >
          {locState === 'locating' ? 'Locating…' : '📍 Use my current location as From'}
        </button>
      </div>
      {locState === 'denied' && (
        <p className="error-text">Location access was denied — type the place instead.</p>
      )}
      {locState === 'unavailable' && (
        <p className="error-text">Couldn’t get your location on this device — type the place instead.</p>
      )}

      <div className="route-hint">
        {samePlace ? (
          <span>Pick two different places.</span>
        ) : distanceInfo.loading ? (
          <span>Finding the road distance…</span>
        ) : distanceInfo.km !== null ? (
          <span>
            Route distance: <strong>{distanceInfo.km.toFixed(1)} km</strong>{' '}
            {distanceInfo.source === 'osrm' && 'by road (live route)'}
            {distanceInfo.source === 'known' && 'by road (known route)'}
            {distanceInfo.source === 'straight' && 'as the crow flies (approx — road distance may differ)'}
          </span>
        ) : from.query && to.query ? (
          <label className="field inline-field">
            Distance not known — enter it:
            <span className="input-suffix">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={manualKm}
                placeholder="e.g. 25"
                onChange={(e) => { setManualKm(e.target.value); setResult(null) }}
              />
              <span>km</span>
            </span>
          </label>
        ) : (
          <span>Type a From and a To place above.</span>
        )}
      </div>

      <label className="field">
        Vehicle
        <select
          value={vehicle ? vehicle.id : ''}
          onChange={(e) => { onSelectVehicle(e.target.value); setResult(null) }}
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.claimed} km/L claimed
            </option>
          ))}
        </select>
      </label>

      <div className="segmented" role="group" aria-label="Mileage to use">
        <button
          type="button"
          className={mileageMode === 'claimed' ? 'seg-btn active' : 'seg-btn'}
          onClick={() => setMileageMode('claimed')}
        >
          Claimed
        </button>
        <button
          type="button"
          className={mileageMode === 'measured' ? 'seg-btn active' : 'seg-btn'}
          disabled={!measuredAvg}
          title={measuredAvg ? 'Use your logged, measured mileage' : 'Log two fills to unlock measured mileage'}
          onClick={() => setMileageMode('measured')}
        >
          My measured{measuredAvg ? ` (${measuredAvg.toFixed(1)})` : ''}
        </button>
        <button
          type="button"
          className={mileageMode === 'custom' ? 'seg-btn active' : 'seg-btn'}
          onClick={() => setMileageMode('custom')}
        >
          Custom
        </button>
      </div>

      {mileageMode === 'custom' && (
        <label className="field">
          Your mileage (km/L)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={customMileage}
            placeholder="e.g. 48"
            onChange={(e) => setCustomMileage(e.target.value)}
          />
        </label>
      )}

      <button
        type="button"
        className={roundTrip ? 'toggle-pill on' : 'toggle-pill'}
        aria-pressed={roundTrip}
        onClick={() => setRoundTrip((v) => !v)}
      >
        <span className="toggle-knob" aria-hidden="true" />
        Round trip
      </button>

      <button type="button" className="btn btn-primary btn-block btn-calculate" onClick={calculate}>
        Calculate trip cost
      </button>

      {result && result.error && <p className="error-text">{result.error}</p>}

      {result && !result.error && (
        <div className="lcd-panel result-panel" aria-live="polite">
          <div className="result-cost">
            <span className="lcd-label">
              {roundTrip ? 'Round trip' : 'One way'} · {result.totalKm.toFixed(1)} km
            </span>
            <span className="result-value">{formatINR(result.cost)}</span>
            <span className="lcd-unit">
              {result.fuelLabel} @ {formatINR(result.fuelPrice)}/L · {result.mileageUsed.toFixed(1)} km/L ({result.mileageSource})
            </span>
          </div>
          <div className="result-stats">
            <div>
              <span className="stat-label">Fuel needed</span>
              <strong>{result.litres.toFixed(2)} L</strong>
            </div>
            <div>
              <span className="stat-label">Cost / km</span>
              <strong>{formatINR(result.perKm)}</strong>
            </div>
            <div>
              <span className="stat-label">{roundTrip ? 'One way' : 'Round trip'}</span>
              <strong>{formatINR(roundTrip ? result.cost / 2 : result.cost * 2)}</strong>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
