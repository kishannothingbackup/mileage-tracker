import { useEffect, useMemo, useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import PricePanel from './components/PricePanel.jsx'
import TripCalculator from './components/TripCalculator.jsx'
import FillForm from './components/FillForm.jsx'
import MileageStats from './components/MileageStats.jsx'
import FillLog from './components/FillLog.jsx'
import VehicleManager from './components/VehicleManager.jsx'
import { DEFAULT_PRICES } from './data.js'
import {
  averageMileage,
  computeIntervals,
  computeStats,
  fillsForVehicle,
  validateFill,
} from './lib/mileage.js'
import { loadJSON, saveJSON } from './lib/storage.js'

const LS = {
  prices: 'fcm.prices.v1',
  vehicles: 'fcm.vehicles.v1',
  selected: 'fcm.selectedVehicle.v1',
  fills: 'fcm.fills.v1',
  theme: 'fcm.theme.v1',
}

function initialTheme() {
  const saved = loadJSON(LS.theme, null)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export default function App() {
  const [page, setPage] = useState('trip') // 'trip' | 'mileage'
  const [theme, setTheme] = useState(initialTheme)
  const [prices, setPrices] = useState(() => loadJSON(LS.prices, DEFAULT_PRICES))
  // No vehicle is preseeded — a first-time visitor starts with an empty
  // list and adds their own (from the catalog or custom).
  const [vehicles, setVehicles] = useState(() => loadJSON(LS.vehicles, []))
  const [selectedVehicleId, setSelectedVehicleId] = useState(() =>
    loadJSON(LS.selected, null),
  )
  const [fills, setFills] = useState(() => loadJSON(LS.fills, []))
  const [editingFill, setEditingFill] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    saveJSON(LS.theme, theme)
  }, [theme])

  useEffect(() => saveJSON(LS.prices, prices), [prices])
  useEffect(() => saveJSON(LS.vehicles, vehicles), [vehicles])
  useEffect(() => saveJSON(LS.fills, fills), [fills])
  useEffect(() => {
    if (selectedVehicleId) saveJSON(LS.selected, selectedVehicleId)
  }, [selectedVehicleId])

  const selectedVehicle =
    vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0] || null
  const activeVehicleId = selectedVehicle?.id || null

  const vehicleFills = useMemo(
    () => (activeVehicleId ? fillsForVehicle(fills, activeVehicleId) : []),
    [fills, activeVehicleId],
  )
  const intervals = useMemo(
    () => (activeVehicleId ? computeIntervals(fills, activeVehicleId) : []),
    [fills, activeVehicleId],
  )
  const stats = useMemo(
    () => (activeVehicleId ? computeStats(fills, activeVehicleId) : null),
    [fills, activeVehicleId],
  )
  const measuredAvg = useMemo(
    () => (activeVehicleId ? averageMileage(fills, activeVehicleId) : null),
    [fills, activeVehicleId],
  )

  function flash(msg) {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 3500)
  }

  function handleSaveFill(candidate, isEdit) {
    if (isEdit) {
      setFills((prev) => prev.map((f) => (f.id === candidate.id ? candidate : f)))
      setEditingFill(null)
      flash('Fill updated.')
    } else {
      setFills((prev) => [...prev, candidate])
      flash('Fill logged — mileage updates after your next fill.')
    }
  }

  function handleDeleteFill(id) {
    setFills((prev) => prev.filter((f) => f.id !== id))
    flash('Fill deleted.')
  }

  function handleAddVehicle(vehicle) {
    setVehicles((prev) => [...prev, vehicle])
    setSelectedVehicleId(vehicle.id)
    flash(`${vehicle.name} added.`)
  }

  function handleDeleteVehicle(id) {
    setVehicles((prev) => prev.filter((v) => v.id !== id))
    setFills((prev) => prev.filter((f) => f.vehicleId !== id))
    if (selectedVehicleId === id) {
      const remaining = vehicles.filter((v) => v.id !== id)
      setSelectedVehicleId(remaining[0]?.id || null)
    }
    flash('Vehicle deleted.')
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Fuel Cost &amp; Mileage</h1>
          <p className="app-subtitle">Ernakulam · trip costs &amp; real mileage</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost theme-toggle"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
      </header>

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      <main className="page">
        {page === 'trip' ? (
          <>
            <PricePanel prices={prices} onSavePrices={setPrices} />
            <TripCalculator
              prices={prices}
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={setSelectedVehicleId}
              onAddVehicle={handleAddVehicle}
              measuredAvg={measuredAvg}
            />
          </>
        ) : (
          <>
            <FillForm
              vehicles={vehicles}
              selectedVehicleId={activeVehicleId}
              onSelectVehicle={setSelectedVehicleId}
              prices={prices}
              fills={fills}
              editingFill={editingFill}
              onSave={handleSaveFill}
              onCancel={() => setEditingFill(null)}
              validate={validateFill}
            />
            {selectedVehicle && stats && (
              <MileageStats
                stats={stats}
                intervals={intervals}
                claimed={selectedVehicle.claimed}
              />
            )}
            <FillLog
              fills={vehicleFills}
              intervals={intervals}
              hasVehicle={Boolean(selectedVehicle)}
              onEdit={(fill) => {
                setEditingFill(fill)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              onDelete={handleDeleteFill}
            />
            <VehicleManager
              vehicles={vehicles}
              selectedVehicleId={activeVehicleId}
              onSelect={setSelectedVehicleId}
              onAdd={handleAddVehicle}
              onDelete={handleDeleteVehicle}
            />
          </>
        )}
      </main>

      <footer className="app-footer">
        Prices bundled 13 Nov 2026, Ernakulam — editable in Step 1. All data stays
        on this device.
      </footer>

      <BottomNav page={page} onNavigate={setPage} />
    </div>
  )
}
