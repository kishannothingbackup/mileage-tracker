import { formatINR } from '../data.js'
import { litresForFill } from '../lib/mileage.js'

/**
 * The fill log: newest first. Each fill shows its interval mileage once a
 * later fill exists; the first fill has no interval yet. Edit opens the fill
 * form in edit mode; delete asks for confirmation.
 */
export default function FillLog({ fills, intervals, hasVehicle, onEdit, onDelete }) {
  const intervalByFillId = new Map(intervals.map((x) => [x.fill.id, x]))

  if (!hasVehicle) {
    return (
      <section className="card" aria-label="Fill log">
        <div className="step-label">Fill log</div>
        <div className="empty-state">
          <p>No vehicle yet.</p>
          <p>Add one in Your vehicles below to start logging fills.</p>
        </div>
      </section>
    )
  }

  if (fills.length === 0) {
    return (
      <section className="card" aria-label="Fill log">
        <div className="step-label">Fill log</div>
        <div className="empty-state">
          <p>No fills logged yet for this vehicle.</p>
          <p>Your first fill sets the odometer baseline — mileage appears after the second.</p>
        </div>
      </section>
    )
  }

  const sorted = fills.slice().sort((a, b) =>
    a.date === b.date ? b.odometer - a.odometer : a.date < b.date ? 1 : -1,
  )

  return (
    <section className="card" aria-label="Fill log">
      <div className="step-label">Fill log · {fills.length} fill{fills.length === 1 ? '' : 's'}</div>
      <ul className="fill-list">
        {sorted.map((fill) => {
          const interval = intervalByFillId.get(fill.id)
          const litres = litresForFill(fill)
          return (
            <li key={fill.id} className="fill-row">
              {fill.photo && (
                <img src={fill.photo} alt="Odometer at fill" className="fill-thumb" />
              )}
              <div className="fill-main">
                <div className="fill-top">
                  <strong>{new Date(`${fill.date}T00:00:00`).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}</strong>
                  <span className="fill-amount">{formatINR(fill.amount)}</span>
                </div>
                <div className="fill-sub">
                  {fill.odometer.toLocaleString('en-IN')} km · {litres.toFixed(2)} L
                  {interval
                    ? ` · ${interval.km.toLocaleString('en-IN')} km since last fill`
                    : ' · first fill'}
                </div>
                <div className="fill-kml">
                  {interval ? (
                    <span className="kml-badge">{interval.kml.toFixed(1)} km/L</span>
                  ) : (
                    <span className="kml-none">no interval yet</span>
                  )}
                </div>
              </div>
              <div className="fill-actions">
                <button type="button" className="btn btn-mini" onClick={() => onEdit(fill)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-mini btn-danger"
                  onClick={() => {
                    if (window.confirm(`Delete the ${formatINR(fill.amount)} fill on ${fill.date}?`)) {
                      onDelete(fill.id)
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
