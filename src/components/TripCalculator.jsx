import { useMemo, useState } from 'react'
import { PLACES, getRouteDistance, formatINR } from '../data.js'

/**
 * Step 2 — trip cost calculator.
 * From/To → road distance (built-in Kochi route matrix, manual fallback) →
 * fuel needed × price = trip cost. Can use the vehicle's claimed mileage,
 * its measured mileage (once logged), or a custom figure.
 */
export default function TripCalculator({
  prices,
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  measuredAvg,
}) {
  const [from, setFrom] = useState('Kalamassery')
  const [to, setTo] = useState('Edappally')
  const [manualKm, setManualKm] = useState('')
  const [mileageMode, setMileageMode] = useState('claimed') // claimed | measured | custom
  const [customMileage, setCustomMileage] = useState('')
  const [roundTrip, setRoundTrip] = useState(false)
  const [result, setResult] = useState(null)

  const vehicle = vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0]
  const knownDistance = useMemo(
    () => (from && to ? getRouteDistance(from, to) : null),
    [from, to],
  )
  const distance =
    knownDistance !== null ? knownDistance : parseFloat(manualKm) || 0
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

  function calculate() {
    if (!vehicle || !distance || distance <= 0 || !effectiveMileage || effectiveMileage <= 0) {
      setResult({ error: 'Pick a route, a vehicle and a mileage to calculate.' })
      return
    }
    const oneWayKm = distance
    const totalKm = roundTrip ? distance * 2 : distance
    const litres = totalKm / effectiveMileage
    const cost = litres * fuelPrice
    setResult({
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
    })
  }

  return (
    <section className="card" aria-label="Trip cost calculator">
      <div className="step-label">Step 2 · What will this trip cost?</div>

      <div className="field-row">
        <label className="field">
          From
          <select value={from} onChange={(e) => { setFrom(e.target.value); setResult(null) }}>
            {PLACES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-icon swap-btn" onClick={swap} aria-label="Swap from and to">
          ⇄
        </button>
        <label className="field">
          To
          <select value={to} onChange={(e) => { setTo(e.target.value); setResult(null) }}>
            {PLACES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="route-hint">
        {knownDistance !== null ? (
          <span>
            Route distance: <strong>{knownDistance} km</strong> by road
          </span>
        ) : from === to ? (
          <span>Pick two different places.</span>
        ) : (
          <label className="field inline-field">
            Distance not in the route list — enter it:
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
              {roundTrip ? 'Round trip' : 'One way'} · {result.totalKm} km
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
