import { formatINR } from '../data.js'

/**
 * Step 4 (part 1) — measured mileage stats + km/L trend chart.
 * Everything shown here comes from the fill log, never from invented data.
 */
export default function MileageStats({ stats, intervals, claimed }) {
  const values = intervals.map((x) => x.kml)
  const max = values.length ? Math.max(...values) : 0
  const min = values.length ? Math.min(...values) : 0
  const span = max - min || 1
  const W = 320
  const H = 120
  const PAD = 10

  const points = values.map((v, i) => {
    const x = values.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (values.length - 1)
    const y = H - PAD - ((v - min) / span) * (H - PAD * 2)
    return { x, y, v }
  })
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area =
    points.length > 1
      ? `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`
      : ''

  const avgY =
    stats.avgKml !== null
      ? H - PAD - ((stats.avgKml - min) / span) * (H - PAD * 2)
      : null

  const diffPct =
    stats.avgKml !== null && claimed
      ? ((stats.avgKml - claimed) / claimed) * 100
      : null

  return (
    <section className="card" aria-label="Measured mileage">
      <div className="step-label">Step 4 · Your measured mileage</div>

      {stats.intervalCount === 0 ? (
        <div className="empty-state">
          <p>
            <strong>No mileage measured yet.</strong>
          </p>
          <p>
            Log two fills for this vehicle and the app will calculate your real
            km/L here — and start using it for trip costs.
          </p>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Your average</span>
              <strong className="stat-big">
                {stats.avgKml !== null ? stats.avgKml.toFixed(1) : '—'}
                <span className="stat-unit"> km/L</span>
              </strong>
              {diffPct !== null && (
                <span className={diffPct >= 0 ? 'chip-vs good' : 'chip-vs bad'}>
                  {diffPct >= 0 ? '+' : ''}
                  {diffPct.toFixed(0)}% vs claimed {claimed} km/L
                </span>
              )}
            </div>
            <div className="stat-card">
              <span className="stat-label">Last fill</span>
              <strong className="stat-big">
                {stats.lastKml !== null ? stats.lastKml.toFixed(1) : '—'}
                <span className="stat-unit"> km/L</span>
              </strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total spent</span>
              <strong className="stat-big">{formatINR(stats.totalSpent)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Distance logged</span>
              <strong className="stat-big">
                {stats.totalKm.toLocaleString('en-IN')}
                <span className="stat-unit"> km</span>
              </strong>
            </div>
          </div>

          <div className="chart-wrap">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="chart"
              role="img"
              aria-label="Mileage per fill chart"
            >
              <defs>
                <linearGradient id="kmlFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </linearGradient>
              </defs>
              {avgY !== null && (
                <line
                  x1={PAD}
                  x2={W - PAD}
                  y1={avgY}
                  y2={avgY}
                  className="chart-avg"
                  strokeDasharray="4 4"
                />
              )}
              {area && <polygon points={area} fill="url(#kmlFill)" />}
              {points.length > 1 && (
                <polyline points={line} className="chart-line" />
              )}
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4" className="chart-dot">
                  <title>{p.v.toFixed(1)} km/L</title>
                </circle>
              ))}
            </svg>
            <div className="chart-caption">
              <span>km/L per fill</span>
              <span className="chart-legend">- - average {stats.avgKml?.toFixed(1)} km/L</span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
