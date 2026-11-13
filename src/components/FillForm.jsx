import { useEffect, useRef, useState } from 'react'
import { QUICK_AMOUNTS, todayISO, uid } from '../data.js'

/**
 * Step 3 — log a fuel fill.
 * Amount (₹100/₹200/₹500 quick chips), odometer reading, optional photo.
 * OCR reads the odometer from a photo via tesseract.js, loaded lazily with a
 * dynamic import — if it fails or is unavailable the form simply falls back
 * to manual entry and never blocks saving.
 */
export default function FillForm({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  prices,
  fills,
  editingFill = null,
  onSave,
  onCancel,
  validate,
}) {
  const [date, setDate] = useState(editingFill?.date || todayISO())
  const [amount, setAmount] = useState(
    editingFill ? String(editingFill.amount) : '100',
  )
  const [odometer, setOdometer] = useState(
    editingFill ? String(editingFill.odometer) : '',
  )
  const [photo, setPhoto] = useState(editingFill?.photo || null)
  const [ocrStatus, setOcrStatus] = useState('') // '', 'reading', 'done', 'failed'
  const [ocrNote, setOcrNote] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const vehicle =
    vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0]

  // When editing, keep the form on the fill's own vehicle.
  useEffect(() => {
    if (editingFill) onSelectVehicle(editingFill.vehicleId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFill?.id])

  function downscaleToDataUrl(file, maxDim = 900) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Could not read that image file.'))
      }
      img.src = url
    })
  }

  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await downscaleToDataUrl(file)
      setPhoto(dataUrl)
      setOcrNote('')
      setOcrStatus('')
    } catch {
      setOcrNote('Could not read that photo — you can still type the reading.')
      setOcrStatus('failed')
    }
  }

  async function scanPhoto() {
    if (!photo) return
    setOcrStatus('reading')
    setOcrNote('Reading the odometer photo…')
    try {
      // Lazy: tesseract.js is fetched only when the user asks for a scan.
      const { default: Tesseract } = await import('tesseract.js')
      const { data } = await Tesseract.recognize(photo, 'eng', {
        logger: () => {},
      })
      const runs = (data.text.match(/\d[\d ,]*/g) || [])
        .map((s) => s.replace(/[^0-9]/g, ''))
        .filter((s) => s.length >= 2)
        .sort((a, b) => b.length - a.length)
      if (runs.length) {
        setOdometer(runs[0])
        setOcrStatus('done')
        setOcrNote(`Read ${runs[0]} km from the photo — check it before saving.`)
      } else {
        setOcrStatus('failed')
        setOcrNote('No number found in the photo — type the reading manually.')
      }
    } catch {
      setOcrStatus('failed')
      setOcrNote(
        'OCR is unavailable right now (it needs network the first time). Type the reading manually.',
      )
    }
  }

  function submit(e) {
    e.preventDefault()
    if (!vehicle) {
      setError('Add a vehicle first.')
      return
    }
    const candidate = {
      id: editingFill?.id || uid(),
      vehicleId: vehicle.id,
      date,
      amount: parseFloat(amount),
      odometer: parseFloat(odometer),
      pricePerLitre: prices[vehicle.fuel],
      photo: photo || null,
    }
    const problem = validate(candidate, fills, editingFill?.id)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    onSave(candidate, Boolean(editingFill))
  }

  return (
    <form className="card" onSubmit={submit} aria-label="Log a fuel fill">
      <div className="step-label">Step 3 · Log a fill</div>

      <label className="field">
        Vehicle
        <select
          value={vehicle ? vehicle.id : ''}
          onChange={(e) => onSelectVehicle(e.target.value)}
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>

      <div className="field-row">
        <label className="field">
          Date
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field">
          Amount (₹)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
          />
        </label>
      </div>

      <div className="chip-row" aria-label="Quick amounts">
        {QUICK_AMOUNTS.map((q) => (
          <button
            key={q}
            type="button"
            className={Number(amount) === q ? 'chip active' : 'chip'}
            onClick={() => setAmount(String(q))}
          >
            ₹{q}
          </button>
        ))}
        <span className="chip-note">
          {vehicle
            ? `≈ ${(Number(amount) / prices[vehicle.fuel] || 0).toFixed(2)} L at ${prices[vehicle.fuel]}/L`
            : ''}
        </span>
      </div>

      <label className="field">
        Odometer reading (km)
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.1"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          placeholder="e.g. 12130"
        />
      </label>

      <div className="photo-block">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhoto}
          className="photo-input"
          aria-label="Odometer photo"
        />
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => fileRef.current?.click()}
        >
          {photo ? 'Change odometer photo' : 'Add odometer photo (optional)'}
        </button>
        {photo && (
          <div className="photo-preview">
            <img src={photo} alt="Odometer" />
            <button
              type="button"
              className="btn btn-primary"
              onClick={scanPhoto}
              disabled={ocrStatus === 'reading'}
            >
              {ocrStatus === 'reading' ? 'Reading…' : 'Read from photo'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setPhoto(null); setOcrNote(''); setOcrStatus('') }}
            >
              Remove
            </button>
          </div>
        )}
        {ocrNote && (
          <p className={ocrStatus === 'failed' ? 'error-text' : 'ok-text'}>{ocrNote}</p>
        )}
        <p className="fine-print">
          Photo OCR is best-effort — if it misreads, just type the number. The
          photo is stored on your device only.
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="row gap">
        <button type="submit" className="btn btn-primary btn-grow">
          {editingFill ? 'Save changes' : 'Log this fill'}
        </button>
        {editingFill && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
