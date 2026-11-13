import { useState } from 'react'
import { DEFAULT_PRICES, formatINR } from '../data.js'

/**
 * Step 1 — Ernakulam fuel price panel.
 * Prices are bundled (13 Nov 2026) and editable; edits are stored locally.
 */
export default function PricePanel({ prices, onSavePrices }) {
  const [editing, setEditing] = useState(false)
  const [petrol, setPetrol] = useState(String(prices.petrol))
  const [diesel, setDiesel] = useState(String(prices.diesel))

  function openEdit() {
    setPetrol(String(prices.petrol))
    setDiesel(String(prices.diesel))
    setEditing(true)
  }

  function save() {
    const p = parseFloat(petrol)
    const d = parseFloat(diesel)
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(d) || d <= 0) return
    onSavePrices({ ...prices, petrol: p, diesel: d })
    setEditing(false)
  }

  function reset() {
    onSavePrices({ ...DEFAULT_PRICES })
    setEditing(false)
  }

  return (
    <section className="card price-card" aria-label="Fuel prices">
      <div className="step-label">Step 1 · Today&rsquo;s fuel prices</div>

      <div className="lcd-panel">
        <div className="lcd-row">
          <div className="lcd-cell">
            <span className="lcd-label">Petrol</span>
            <span className="lcd-value">{formatINR(prices.petrol)}</span>
            <span className="lcd-unit">per litre</span>
          </div>
          <div className="lcd-divider" aria-hidden="true" />
          <div className="lcd-cell">
            <span className="lcd-label">Diesel</span>
            <span className="lcd-value">{formatINR(prices.diesel)}</span>
            <span className="lcd-unit">per litre</span>
          </div>
        </div>
        <div className="lcd-footer">
          <span>
            {prices.city} · {prices.dateLabel}
          </span>
          <span className="lcd-stale" title="Prices are bundled and editable — update them after your next fill.">
            bundled price
          </span>
        </div>
      </div>

      {editing ? (
        <div className="price-edit">
          <div className="field-row">
            <label className="field">
              Petrol ₹/L
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={petrol}
                onChange={(e) => setPetrol(e.target.value)}
              />
            </label>
            <label className="field">
              Diesel ₹/L
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={diesel}
                onChange={(e) => setDiesel(e.target.value)}
              />
            </label>
          </div>
          <div className="row gap price-actions">
            <button type="button" className="btn btn-primary btn-grow" onClick={save}>
              Save prices
            </button>
            <button type="button" className="btn btn-ghost btn-grow" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={reset}>
            Reset to 13 Nov 2026
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-block" onClick={openEdit}>
          Edit prices
        </button>
      )}

      <p className="fine-print">
        Pump-to-pump petrol prices inside a Kerala city barely differ, so this app
        doesn&rsquo;t compare pumps — the value is the trip cost and your personal mileage.
      </p>
    </section>
  )
}
