// ---------------------------------------------------------------------------
// Odometer photo OCR — reads the digital odometer display from a photo.
// The old approach ran one Tesseract pass and took the longest digit run
// from the raw text. That fails on dashboard photos: the regex joined the
// speedometer dial numbers across spaces (40, 120, 140, 160 …) into one
// fake 7-digit number, e.g. "4120460", while the real odometer (200000)
// sat in the LCD below. This module fixes that:
//   1. LCD detection — the digital display on most Indian vehicles is a
//      yellow/amber LCD. Yellow pixels are found, their bounding box is
//      the display, and only that tight crop is OCR'd. Dial numbers never
//      enter the result at all.
//   2. Binarize + upscale — inside the LCD crop the digits are dark on
//      bright; an adaptive threshold (from the crop's own histogram) makes
//      them solid black on white, upscaled 3x, digits-only, psm 7/13.
//   3. Fallbacks — if no yellow LCD is found (white/green display, odd
//      framing), full-image passes run on the enhanced image and a centre
//      crop, as before.
//   4. Word-level scoring — each digit group is scored separately (never
//      joined across spaces), using Tesseract's word confidence, position
//      and size. The LCD sits low-centre and is 4–6 digits; dial numbers
//      sit at the rim and are 2–3 digits.
//   5. Plausibility — 7-digit readings and readings below the last logged
//      odometer are flagged, and the top alternatives are returned so the
//      user can pick instead of silently saving a wrong number.
// Pure scoring (scoreCandidates) has no browser dependencies, so it can be
// tested in Node against a real photo.
// ---------------------------------------------------------------------------

/** Load an image from a data URL. Browser only. */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image.'))
    img.src = dataUrl
  })
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** Grayscale + contrast stretch in place. */
function enhance(canvas) {
  const ctx = canvas.getContext('2d')
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    let v = (g - 128) * 1.6 + 128
    v = v < 0 ? 0 : v > 255 ? 255 : v
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/**
 * Find the yellow LCD display in a canvas (base coordinates).
 * Returns { x0, y0, x1, y1 } or null. The display is a solid block of
 * strongly-yellow pixels (high R, high G, low B); the dial face, needle
 * and text do not match the tight thresholds.
 */
function findLcdBox(canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const { data } = ctx.getImageData(0, 0, width, height)
  let x0 = width, y0 = height, x1 = -1, y1 = -1, count = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (r > 180 && g > 140 && b < 110 && r - b > 90 && g - b > 70) {
      const px = (i / 4) % width
      const py = Math.floor(i / 4 / width)
      if (px < x0) x0 = px
      if (px > x1) x1 = px
      if (py < y0) y0 = py
      if (py > y1) y1 = py
      count++
    }
  }
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  // Must be a plausible display: wide-ish rectangle, not a speck, not the
  // whole frame.
  if (count < 200 || w < 25 || h < 10 || w < h * 1.2 || w > width * 0.6) return null
  return { x0, y0, x1, y1 }
}

/**
 * Binarize a region of a canvas: threshold from the region's own luminance
 * histogram (midpoint between the dark-digit cluster and the bright
 * background cluster), then upscale with hard edges.
 * `box` is in source-canvas coords; `margin` pads it; `upscale` scales it.
 * Returns { canvas, originX, originY, upscale } for coordinate mapping.
 */
function binarizeRegion(sourceCanvas, box, margin, upscale) {
  const x0 = Math.max(0, box.x0 - margin)
  const y0 = Math.max(0, box.y0 - margin)
  const x1 = Math.min(sourceCanvas.width - 1, box.x1 + margin)
  const y1 = Math.min(sourceCanvas.height - 1, box.y1 + margin)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const crop = makeCanvas(w, h)
  crop.getContext('2d').drawImage(sourceCanvas, x0, y0, w, h, 0, 0, w, h)
  const ctx = crop.getContext('2d')
  const { data } = ctx.getImageData(0, 0, w, h)
  const lum = []
  for (let i = 0; i < data.length; i += 4) {
    lum.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  }
  lum.sort((a, b) => a - b)
  const p10 = lum[Math.floor(lum.length * 0.1)]
  const p90 = lum[Math.floor(lum.length * 0.9)]
  const threshold = (p10 + p90) / 2
  const out = ctx.createImageData(w, h)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const v = lum[j] < threshold ? 0 : 255
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v
    out.data[i + 3] = 255
  }
  ctx.putImageData(out, 0, 0)
  const big = makeCanvas(w * upscale, h * upscale)
  const bctx = big.getContext('2d')
  bctx.imageSmoothingEnabled = false
  bctx.drawImage(crop, 0, 0, big.width, big.height)
  return { canvas: big, originX: x0, originY: y0, upscale }
}

/** Binarize an LCD crop (thin margin, 3x upscale). */
function binarizeLcd(sourceCanvas, box) {
  return binarizeRegion(sourceCanvas, box, 4, 3)
}

/**
 * Build the OCR variants from a photo data URL. Each variant carries a
 * toBase() that maps its word boxes back to base coordinates (so scoring
 * always works in one coordinate space).
 */
async function buildVariants(photoDataUrl) {
  const img = await loadImage(photoDataUrl)
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height))
  const base = makeCanvas(img.width * scale, img.height * scale)
  base.getContext('2d').drawImage(img, 0, 0, base.width, base.height)

  // Enhanced: 1.5x upscale + grayscale/contrast.
  const enhanced = makeCanvas(base.width * 1.5, base.height * 1.5)
  enhanced.getContext('2d').drawImage(base, 0, 0, enhanced.width, enhanced.height)
  enhance(enhanced)

  // Centre crop of the enhanced image (middle 70% x 70%).
  const cx0 = Math.round(enhanced.width * 0.15)
  const cy0 = Math.round(enhanced.height * 0.15)
  const cw = Math.round(enhanced.width * 0.7)
  const ch = Math.round(enhanced.height * 0.7)
  const centre = makeCanvas(cw, ch)
  centre.getContext('2d').drawImage(enhanced, cx0, cy0, cw, ch, 0, 0, cw, ch)

  // LCD crop: yellow-display detection on the base image, binarized.
  const lcdBox = findLcdBox(base)
  const lcd = lcdBox ? binarizeLcd(base, lcdBox) : null

  // Drum window: on analogue clusters the mechanical odometer sits in a
  // small window at the centre of the dial (above the trip meter). Crop
  // that window, binarize and upscale it — the dial numbers at the rim
  // never enter this pass.
  const drumBox = {
    x0: Math.round(base.width * 0.3),
    y0: Math.round(base.height * 0.32),
    x1: Math.round(base.width * 0.7),
    y1: Math.round(base.height * 0.68),
  }
  const drum = binarizeRegion(base, drumBox, 0, 3)

  const variants = [
    { name: 'enhanced', canvas: enhanced, toBase: (b) => ({ x0: b.x0 / 1.5, y0: b.y0 / 1.5, x1: b.x1 / 1.5, y1: b.y1 / 1.5 }) },
    { name: 'centre', canvas: centre, toBase: (b) => ({ x0: (b.x0 + cx0) / 1.5, y0: (b.y0 + cy0) / 1.5, x1: (b.x1 + cx0) / 1.5, y1: (b.y1 + cy0) / 1.5 }) },
    {
      name: 'drum',
      canvas: drum.canvas,
      toBase: (b) => ({
        x0: b.x0 / drum.upscale + drum.originX, y0: b.y0 / drum.upscale + drum.originY,
        x1: b.x1 / drum.upscale + drum.originX, y1: b.y1 / drum.upscale + drum.originY,
      }),
    },
  ]
  if (lcd) {
    variants.unshift({
      name: 'lcd',
      canvas: lcd.canvas,
      toBase: (b) => ({
        x0: b.x0 / lcd.upscale + lcd.originX, y0: b.y0 / lcd.upscale + lcd.originY,
        x1: b.x1 / lcd.upscale + lcd.originX, y1: b.y1 / lcd.upscale + lcd.originY,
      }),
    })
  }
  return { baseW: base.width, baseH: base.height, variants, lcdFound: Boolean(lcd) }
}

// ---------------------------------------------------------------------------
// Pure scoring — no browser APIs, testable in Node.
// words: [{ text, confidence, bbox: { x0, y0, x1, y1 } }] in base coords.
// imgW/imgH: base image size. lastOdometer: highest logged reading (or null).
// Returns up to 3 candidates: [{ value, score, confidence, suspicious }]
// ---------------------------------------------------------------------------
export function scoreCandidates(words, imgW, imgH, lastOdometer = null) {
  // 1. Normalise: digits only, keep plausible odometer lengths.
  const digitWords = []
  for (const w of words || []) {
    const digits = String(w.text || '').replace(/[^0-9]/g, '')
    if (digits.length < 3 || digits.length > 7) continue
    const b = w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 }
    digitWords.push({
      digits,
      confidence: Number(w.confidence) || 0,
      x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1,
    })
  }
  if (!digitWords.length) return []

  // 2. Merge same-line neighbours with a tiny gap — Tesseract sometimes
  //    splits one LCD number ("20000" + "0"). Only merge when the gap is
  //    smaller than 0.6x a character width, so dial numbers (far apart)
  //    are never joined.
  digitWords.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  const merged = []
  for (const w of digitWords) {
    const prev = merged[merged.length - 1]
    const sameLine =
      prev &&
      Math.abs((w.y0 + w.y1) / 2 - (prev.y0 + prev.y1) / 2) <
        Math.max(w.y1 - w.y0, prev.y1 - prev.y0) * 0.6
    if (sameLine) {
      const charW = (prev.x1 - prev.x0) / prev.digits.length
      const gap = w.x0 - prev.x1
      if (gap >= 0 && gap < charW * 0.6 && prev.digits.length + w.digits.length <= 7) {
        prev.digits += w.digits
        prev.confidence = Math.min(prev.confidence, w.confidence)
        prev.x1 = w.x1
        prev.y1 = Math.max(prev.y1, w.y1)
        continue
      }
    }
    merged.push({ ...w })
  }

  // 3. Score each candidate.
  const scored = merged.map((c) => {
    const len = c.digits.length
    const num = parseInt(c.digits, 10)
    let score = c.confidence
    if (len >= 4 && len <= 6) score += 25
    else if (len === 3) score += 10
    else if (len >= 7) score -= 50
    // Position: the reading sits either in a digital display (low-centre)
    // or in a mechanical drum window (centre of the dial); dial numbers
    // rim the edge. Score by the nearer of the two sweet spots.
    const cx = (c.x0 + c.x1) / 2 / imgW
    const cy = (c.y0 + c.y1) / 2 / imgH
    const distLcd = Math.hypot((cx - 0.5) * 1.2, cy - 0.68)
    const distDrum = Math.hypot((cx - 0.5) * 1.2, cy - 0.5)
    const dist = Math.min(distLcd, distDrum)
    score += 25 * Math.max(0, 1 - dist / 0.6)
    // Size: LCD digits are large relative to the frame.
    score += 10 * Math.min(1, (c.y1 - c.y0) / imgH / 0.05)
    // Plausibility.
    if (num > 999999) score -= 50
    if (lastOdometer != null && num < lastOdometer) score -= 30
    const suspicious =
      len >= 7 || num > 999999 || num <= 0 ||
      (lastOdometer != null && num < lastOdometer) ||
      c.confidence < 50
    return { value: c.digits, score: Math.round(score), confidence: Math.round(c.confidence), suspicious }
  })

  // 4. Dedupe by value (keep best score), sort, top 3.
  const byValue = new Map()
  for (const s of scored) {
    const prev = byValue.get(s.value)
    if (!prev || s.score > prev.score) byValue.set(s.value, s)
  }
  return [...byValue.values()].sort((a, b) => b.score - a.score).slice(0, 3)
}

/**
 * Read the odometer from a photo data URL.
 * Returns { best, candidates, lcdFound } — best is the top candidate or null.
 * onProgress(pass, total) is called before each OCR pass.
 */
export async function readOdometer(photoDataUrl, { lastOdometer = null, onProgress = () => {} } = {}) {
  const { default: Tesseract } = await import('tesseract.js')
  const { baseW, baseH, variants, lcdFound } = await buildVariants(photoDataUrl)
  const worker = await Tesseract.createWorker('eng')
  const allWords = []
  const passes = []
  const lcdVariant = variants.find((v) => v.name === 'lcd')
  if (lcdVariant) {
    // The LCD crop contains only the display: single line, digits only.
    passes.push({ variant: lcdVariant, psm: '7', whitelist: '0123456789' })
    passes.push({ variant: lcdVariant, psm: '13', whitelist: '0123456789' })
  }
  const drumVariant = variants.find((v) => v.name === 'drum')
  if (drumVariant) {
    // The drum window contains the odometer drums (and the trip meter
    // below them): single line first, then block mode.
    passes.push({ variant: drumVariant, psm: '7', whitelist: '0123456789' })
    passes.push({ variant: drumVariant, psm: '6', whitelist: '0123456789' })
  }
  const enhanced = variants.find((v) => v.name === 'enhanced')
  const centre = variants.find((v) => v.name === 'centre')
  // Digits-only everywhere: we only care about digit words, and it stops
  // Tesseract wasting effort on "MPH" / "km/h" lettering. The whitelist is
  // set on every pass because setParameters keeps earlier values.
  passes.push({ variant: enhanced, psm: '11', whitelist: '0123456789' })
  passes.push({ variant: enhanced, psm: '6', whitelist: '0123456789' })
  passes.push({ variant: centre, psm: '11', whitelist: '0123456789' })
  try {
    for (let i = 0; i < passes.length; i++) {
      onProgress(i + 1, passes.length)
      const params = { tessedit_pageseg_mode: passes[i].psm }
      if (passes[i].whitelist) params.tessedit_char_whitelist = passes[i].whitelist
      await worker.setParameters(params)
      const { data } = await worker.recognize(passes[i].variant.canvas)
      for (const w of data.words || []) {
        allWords.push({
          text: w.text,
          confidence: w.confidence,
          bbox: passes[i].variant.toBase(w.bbox),
        })
      }
    }
  } finally {
    await worker.terminate()
  }
  const candidates = scoreCandidates(allWords, baseW, baseH, lastOdometer)
  return { best: candidates[0] || null, candidates, lcdFound }
}
