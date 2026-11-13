import { useState } from 'react'
import { VEHICLE_CATALOG, uid } from '../data.js'

/**
 * Manage the user's vehicles: pick the active one, add a custom vehicle,
 * or add one from the catalog. Deleting a vehicle also removes its fills.
 */
export default function VehicleManager({
  vehicles,
  selectedVehicleId,
  onSelect,
  onAdd,
  onDelete,
}) {
  const [name, setName] = useState('')
  const [fuel, setFuel] = useState('petrol')
  const [claimed, setClaimed] = useState('')
  const [catalogId, setCatalogId] = useState(VEHICLE_CATALOG[0].id)

  function addCustom(e) {
    e.preventDefault()
    const c = parseFloat(claimed)
    if (!name.trim() || !Number.isFinite(c) || c <= 0) return
    onAdd({
      id: uid(),
      name: name.trim(),
      type: 'Custom',
      fuel,
      claimed: c,
    })
    setName('')
    setClaimed('')
  }

  function addFromCatalog() {
    const preset = VEHICLE_CATALOG.find((v) => v.id === catalogId)
    if (!preset) return
    if (vehicles.some((v) => v.name === preset.name)) return
    onAdd({ ...preset, id: uid() })
  }

  return (
    <section className="card" aria-label="Your vehicles">
      <div className="step-label">Your vehicles</div>
      <ul className="vehicle-list">
        {vehicles.map((v) => (
          <li key={v.id} className={v.id === selectedVehicleId ? 'vehicle-row active' : 'vehicle-row'}>
            <button
              type="button"
              className="vehicle-pick"
              onClick={() => onSelect(v.id)}
              aria-pressed={v.id === selectedVehicleId}
            >
              <span className="vehicle-medallion" aria-hidden="true">
                {v.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="vehicle-info">
                <strong>{v.name}</strong>
                <span>
                  {v.type} · {v.fuel === 'diesel' ? 'Diesel' : 'Petrol'} ·{' '}
                  {v.claimed} km/L claimed
                </span>
              </span>
              {v.id === selectedVehicleId && <span className="vehicle-check">✓</span>}
            </button>
            {vehicles.length > 1 && (
              <button
                type="button"
                className="btn btn-mini btn-danger"
                onClick={() => {
                  if (window.confirm(`Delete ${v.name} and all its fills?`)) onDelete(v.id)
                }}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="add-vehicle">
        <label className="field">
          Add from catalog
          <span className="input-row">
            <select value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
              {VEHICLE_CATALOG.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.claimed} km/L
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost" onClick={addFromCatalog}>
              Add
            </button>
          </span>
        </label>

        <form onSubmit={addCustom} className="custom-vehicle">
          <label className="field">
            Or add your own vehicle
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Access 125"
            />
          </label>
          <div className="field-row">
            <label className="field">
              Fuel
              <select value={fuel} onChange={(e) => setFuel(e.target.value)}>
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
                value={claimed}
                onChange={(e) => setClaimed(e.target.value)}
                placeholder="e.g. 55"
              />
            </label>
          </div>
          <button type="submit" className="btn btn-ghost btn-block">
            Add vehicle
          </button>
        </form>
      </div>
    </section>
  )
}
