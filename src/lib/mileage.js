// ---------------------------------------------------------------------------
// Pure mileage math — no React, no storage, easy to test.
// A "fill" is: { id, vehicleId, date (YYYY-MM-DD), amount (₹),
//                odometer (km), pricePerLitre (₹/L), photo? (data URL) }
// ---------------------------------------------------------------------------

/** Litres bought in one fill: amount ÷ price per litre. */
export function litresForFill(fill) {
  if (!fill || !fill.pricePerLitre || fill.pricePerLitre <= 0) return 0
  return fill.amount / fill.pricePerLitre
}

/** Fills for one vehicle, oldest first (date, then odometer as tiebreak). */
export function fillsForVehicle(allFills, vehicleId) {
  return allFills
    .filter((f) => f.vehicleId === vehicleId)
    .slice()
    .sort((a, b) =>
      a.date === b.date ? a.odometer - b.odometer : a.date < b.date ? -1 : 1,
    )
}

/**
 * Tank-to-tank intervals. For each fill after the first:
 *   km run    = odometer[i] − odometer[i−1]
 *   litres    = amount[i] ÷ pricePerLitre[i]   (the LATER fill's litres)
 *   km/L      = km run ÷ litres
 * Returns [{ fill, prevFill, km, litres, kml }] in chronological order.
 */
export function computeIntervals(allFills, vehicleId) {
  const fills = fillsForVehicle(allFills, vehicleId)
  const out = []
  for (let i = 1; i < fills.length; i++) {
    const fill = fills[i]
    const prev = fills[i - 1]
    const km = fill.odometer - prev.odometer
    const litres = litresForFill(fill)
    if (km > 0 && litres > 0) {
      out.push({ fill, prevFill: prev, km, litres, kml: km / litres })
    }
  }
  return out
}

/** Overall measured average km/L for a vehicle, or null if not enough data. */
export function averageMileage(allFills, vehicleId) {
  const intervals = computeIntervals(allFills, vehicleId)
  const totalKm = intervals.reduce((s, x) => s + x.km, 0)
  const totalLitres = intervals.reduce((s, x) => s + x.litres, 0)
  if (intervals.length === 0 || totalLitres <= 0) return null
  return totalKm / totalLitres
}

/** Summary stats for one vehicle's fill history. */
export function computeStats(allFills, vehicleId) {
  const fills = fillsForVehicle(allFills, vehicleId)
  const intervals = computeIntervals(allFills, vehicleId)
  const totalSpent = fills.reduce((s, f) => s + Number(f.amount || 0), 0)
  const totalKm =
    fills.length >= 2 ? fills[fills.length - 1].odometer - fills[0].odometer : 0
  const avg = averageMileage(allFills, vehicleId)
  const last = intervals.length ? intervals[intervals.length - 1] : null
  return {
    fillCount: fills.length,
    intervalCount: intervals.length,
    totalSpent,
    totalKm,
    avgKml: avg,
    lastKml: last ? last.kml : null,
  }
}

/**
 * Validate a new/edited fill against the vehicle's existing history.
 * Returns an error string, or null when the fill is fine.
 * `ignoreId` is set when editing an existing fill (so it isn't compared
 * against itself).
 */
export function validateFill(candidate, existingFills, ignoreId = null) {
  const others = existingFills.filter(
    (f) => f.vehicleId === candidate.vehicleId && f.id !== ignoreId,
  )

  if (!candidate.date) return 'Pick a date for this fill.'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const fillDate = new Date(`${candidate.date}T00:00:00`)
  if (Number.isNaN(fillDate.getTime())) return 'That date is not valid.'
  if (fillDate > today) return 'Fill date cannot be in the future.'

  if (!candidate.amount || candidate.amount <= 0) return 'Enter an amount above ₹0.'
  if (!candidate.odometer || candidate.odometer <= 0)
    return 'Enter the odometer reading in km.'

  const dup = others.find(
    (f) =>
      f.date === candidate.date &&
      f.odometer === candidate.odometer &&
      Number(f.amount) === Number(candidate.amount),
  )
  if (dup) return 'This fill is already logged — same date, odometer and amount.'

  // Odometer must be monotonic with date: it cannot be at or below the
  // highest reading from any earlier-dated fill, nor at or above the lowest
  // reading from any later-dated fill.
  const before = others.filter((f) => f.date < candidate.date)
  if (before.length) {
    const maxBefore = Math.max(...before.map((f) => f.odometer))
    if (candidate.odometer <= maxBefore)
      return 'Odometer reading is lower than an earlier fill — check the number.'
  }
  const after = others.filter((f) => f.date > candidate.date)
  if (after.length) {
    const minAfter = Math.min(...after.map((f) => f.odometer))
    if (candidate.odometer >= minAfter)
      return 'Odometer reading is higher than a later fill — check the number.'
  }

  return null
}
