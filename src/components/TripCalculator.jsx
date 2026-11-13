import { useEffect, useRef, useState } from 'react'
import { getRouteDistance, formatINR, uid, VEHICLE_CATALOG } from '../data.js'
import {
  searchPlaces,
  reverseGeocode,
  getRoadDistance,
  haversineKm,
  queryGeolocationPermission,
  getDevicePosition,
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
  onAddVehicle,
  measuredAvg,
}) {
  // Both fields start empty — nothing is searched or shown until the user types.
  const [from, setFrom] = useState({ query: '', place: null })
  const [to, setTo] = useState({ query: '', place: null })
  const [manualKm, setManualKm] = useState('')
  // How mileage is provided: 'mileage' = type it directly (no vehicle
  // needed — the first-open default, so no vehicle is ever preselected),
  // 'vehicle' = pick one of the user's vehicles. Returning users who
  // already picked a vehicle start in vehicle mode.
  const [mode, setMode] = useState(() => (selectedVehicleId ? 'vehicle' : 'mileage'))
  const [directMileage, setDirectMileage] = useState('')
  const [directFuel, setDirectFuel] = useState('petrol')
  // What was picked in vehicle mode: a catalog model (claimed mileage) or
  // one of the user's own vehicles (measured mileage when logged, else its
  // claimed figure). Never a custom vehicle here — that is the Enter
  // mileage mode.
  const [choice, setChoice] = useState(null) // { kind: 'catalog' | 'mine', id } | null
  const [addingVehicle, setAddingVehicle] = useState(false)
  const [newName, setNewName] = useState('')
  const [newFuel, setNewFuel] = useState('petrol')
  const [newClaimed, setNewClaimed] = useState('')
  const [roundTrip, setRoundTrip] = useState(false)
  const [splitCount, setSplitCount] = useState(2) // split the trip cost among friends
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
      const permission = await queryGeolocationPermission()
      if (cancelled || permission !== 'granted') return
      const pos = await getDevicePosition()
      if (!cancelled && pos) setUserLoc(pos)
    }
    initBias()
    return () => {
      cancelled = true
    }
  }, [])

  // No vehicle is ever assumed: in mileage mode there is none, and in
  // vehicle mode there is one only once the user picks a model or one of
  // their own vehicles.
  const catalogVehicle =
    choice?.kind === 'catalog'
      ? VEHICLE_CATALOG.find((v) => v.id === choice.id) || null
      : null
  const vehicle =
    choice?.kind === 'mine'
      ? vehicles.find((v) => v.id === choice.id) || null
      : null

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
  const fuel =
    mode === 'mileage'
      ? directFuel
      : catalogVehicle
        ? catalogVehicle.fuel
        : vehicle
          ? vehicle.fuel
          : 'petrol'
  const fuelPrice = prices[fuel]

  const effectiveMileage =
    mode === 'mileage'
      ? parseFloat(directMileage) || 0
      : catalogVehicle
        ? catalogVehicle.claimed
        : vehicle
          ? measuredAvg || vehicle.claimed
          : 0

  function saveNewVehicle() {
    const c = parseFloat(newClaimed)
    if (!newName.trim() || !Number.isFinite(c) || c <= 0) return
    const added = {
      id: uid(),
      name: newName.trim(),
      type: 'Custom',
      fuel: newFuel,
      claimed: c,
    }
    onAddVehicle(added)
    setChoice({ kind: 'mine', id: added.id })
    setNewName('')
    setNewClaimed('')
    setAddingVehicle(false)
  }

  function swap() {
    setFrom(to)
    setTo(from)
    setResult(null)
  }

  async function useMyLocation() {
    setLocState('locating')
    const pos = await getDevicePosition({ prompt: true })
    if (!pos) {
      // The prompt was denied (or location is unavailable): keep the
      // distinction the UI already shows.
      const perm = await queryGeolocationPermission()
      setLocState(perm === 'denied' ? 'denied' : 'unavailable')
      return
    }
    const { lat, lon } = pos
    let name = null
    try {
      name = await reverseGeocode(lat, lon)
    } catch {
      name = null
    }
    const label = name || 'My location'
    setFrom({ query: label, place: { name: label, detail: '', lat, lon } })
    setUserLoc({ lat, lon })
    setLocState('done')
  }

  function computeResult() {
    if (!distance || distance <= 0) {
      return { error: 'Pick a route first.' }
    }
    if (mode === 'mileage' && (!effectiveMileage || effectiveMileage <= 0)) {
      return { error: 'Enter your mileage (km/L) to calculate.' }
    }
    if (mode === 'vehicle' && !catalogVehicle && !vehicle) {
      return { error: 'Choose a model or one of your vehicles.' }
    }
    if (!effectiveMileage || effectiveMileage <= 0) {
      return { error: 'Pick a mileage to calculate.' }
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
        mode === 'mileage'
          ? 'your mileage'
          : catalogVehicle
            ? 'claimed mileage'
            : measuredAvg
              ? 'your measured mileage'
              : 'claimed mileage',
      fuelPrice,
      fuelLabel: fuel === 'diesel' ? 'Diesel' : 'Petrol',
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
  }, [distance, vehicle, effectiveMileage, roundTrip, fuelPrice, mode, choice, measuredAvg])

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

      <div className="field">
        <span>Vehicle / mileage</span>
        <div className="segmented" role="group" aria-label="How to provide mileage">
          <button
            type="button"
            className={mode === 'mileage' ? 'seg-btn active' : 'seg-btn'}
            onClick={() => setMode('mileage')}
          >
            Enter mileage
          </button>
          <button
            type="button"
            className={mode === 'vehicle' ? 'seg-btn active' : 'seg-btn'}
            onClick={() => setMode('vehicle')}
          >
            Choose vehicle
          </button>
        </div>
      </div>

      {mode === 'mileage' ? (
        <div className="field-row">
          <label className="field">
            Your mileage (km/L)
            <span className="input-suffix">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={directMileage}
                placeholder="e.g. 65"
                onChange={(e) => setDirectMileage(e.target.value)}
              />
              <span>km/L</span>
            </span>
          </label>
          <div className="field">
            <span>Fuel</span>
            <div className="segmented" role="group" aria-label="Fuel">
              <button
                type="button"
                className={directFuel === 'petrol' ? 'seg-btn active' : 'seg-btn'}
                onClick={() => setDirectFuel('petrol')}
              >
                Petrol
              </button>
              <button
                type="button"
                className={directFuel === 'diesel' ? 'seg-btn active' : 'seg-btn'}
                onClick={() => setDirectFuel('diesel')}
              >
                Diesel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <label className="field">
            Model
            <select
              value={choice?.kind === 'catalog' ? choice.id : ''}
              onChange={(e) => setChoice({ kind: 'catalog', id: e.target.value })}
            >
              <option value="" disabled>
                Choose a model…
              </option>
              {VEHICLE_CATALOG.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.claimed} km/L claimed
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span>My vehicles</span>
            {vehicles.length === 0 ? (
              <p className="fine-print">You haven&rsquo;t added a vehicle yet.</p>
            ) : (
              <ul className="vehicle-list">
                {vehicles.map((v) => {
                  const selected = choice?.kind === 'mine' && choice.id === v.id
                  return (
                    <li key={v.id} className={selected ? 'vehicle-row active' : 'vehicle-row'}>
                      <button
                        type="button"
                        className="vehicle-pick"
                        onClick={() => {
                          if (selected) {
                            setChoice(null)
                            onSelectVehicle(null)
                          } else {
                            setChoice({ kind: 'mine', id: v.id })
                            onSelectVehicle(v.id)
                          }
                        }}
                        aria-pressed={selected}
                      >
                        <span className="vehicle-check-box" aria-hidden="true">
                          {selected && '✓'}
                        </span>
                        <span className="vehicle-info">
                          <strong>{v.name}</strong>
                          <span>
                            {v.type} · {v.fuel === 'diesel' ? 'Diesel' : 'Petrol'} ·{' '}
                            {v.claimed} km/L claimed
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {!addingVehicle ? (
              <button
                type="button"
                className="btn btn-ghost btn-block add-vehicle-btn"
                onClick={() => setAddingVehicle(true)}
              >
                + Add my own vehicle
              </button>
            ) : (
              <div className="add-vehicle-inline">
                <label className="field">
                  Vehicle name
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. My Access 125"
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    Fuel
                    <select value={newFuel} onChange={(e) => setNewFuel(e.target.value)}>
                      <option value="petrol">Petrol</option>
                      <option value="diesel">Diesel</option>
                    </select>
                  </label>
                  <label className="field">
                    Claimed km/L
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.1"
                      value={newClaimed}
                      onChange={(e) => setNewClaimed(e.target.value)}
                      placeholder="e.g. 55"
                    />
                  </label>
                </div>
                <div className="row gap">
                  <button type="button" className="btn btn-primary btn-grow" onClick={saveNewVehicle}>
                    Add vehicle
                  </button>
                  <button type="button" className="btn btn-ghost btn-grow" onClick={() => setAddingVehicle(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
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
          <div className="split-row">
            <span className="stat-label">Split among friends</span>
            <span className="split-controls">
              <button
                type="button"
                className="split-btn"
                disabled={splitCount <= 1}
                onClick={() => setSplitCount((c) => Math.max(1, c - 1))}
                aria-label="Fewer people"
              >
                −
              </button>
              <span className="split-count">{splitCount}</span>
              <button
                type="button"
                className="split-btn"
                disabled={splitCount >= 20}
                onClick={() => setSplitCount((c) => Math.min(20, c + 1))}
                aria-label="More people"
              >
                +
              </button>
            </span>
            <strong className="split-per-head">{formatINR(result.cost / splitCount)} each</strong>
          </div>
        </div>
      )}
    </section>
  )
}
