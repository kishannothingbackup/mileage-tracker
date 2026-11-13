# Fuel Cost & Mileage Tracker

A mobile-first web app that answers two questions before you ride or drive:

1. **What will this trip cost?** — pick From / To and your vehicle, and it shows the
   fuel cost from the live (editable) Ernakulam petrol/diesel price and the vehicle's
   mileage.
2. **What mileage does my vehicle actually give?** — log the odometer reading at each
   fill (e.g. every ₹100 fill), optionally by photographing the odometer, and the app
   learns your vehicle's real mileage and shows how it changes as the vehicle ages.

## Run it

```bash
npm install
npm run dev        # development server, hot reload
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

Requires Node 18+. No backend, no API keys, no account. All data (vehicles, fills,
prices) is stored in the browser's `localStorage` on the device.

## How the mileage math works

For each fill we store the date, the amount paid (₹), the odometer reading (km) and
the fuel price per litre at that moment.

- **Litres in a fill** = amount ÷ price per litre.
  Example: ₹100 ÷ ₹113.53/L = 0.88 L.
- **Interval mileage** (tank-to-tank): between two consecutive fills for the same
  vehicle, km run = odometer₂ − odometer₁, and km/L = km run ÷ litres in the
  **later** fill. The first fill for a vehicle has no interval yet — mileage appears
  after the second fill.
- **Average mileage** = total km across all intervals ÷ total litres across those
  intervals.
- Once a vehicle has a measured average, the trip calculator can use **your measured
  mileage instead of the company's claimed figure** — that's the personalised part.

Validation rules: future dates are rejected, an odometer reading lower than the
previous fill is rejected, and an identical re-submission (same vehicle, date,
odometer and amount) is treated as a duplicate, not a new fill.

## Fuel prices

Prices are bundled from **13 Nov 2026, Ernakulam**: petrol **₹113.53/L**,
diesel **₹102.45/L**. They are editable in the app (Step 1 → Edit prices) — update
them whenever you fill up, or reset them to the bundled values.

Note: pump-to-pump petrol prices inside a Kerala city barely differ, so the app
does not compare pumps — the real value is the trip cost and your personal mileage.

## Odometer photo (OCR)

The fill form can read the odometer number from a photo using tesseract.js, loaded
lazily only when you tap "Read from photo". It needs network access the first time
(to fetch the OCR engine assets). If OCR fails or is unavailable, the form falls
back to manual entry — OCR never blocks logging a fill.

## Android app (APK)

The same code is wrapped with [Capacitor](https://capacitorjs.com/) (`com.kishan.mileagetracker`)
so it installs as a real Android app — home-screen icon, camera built in, and it
opens with no connection (the web assets are bundled in the APK; place search and
road distances still need internet, like the web version).

- Build it locally: `npm run build && npx cap sync android`, then open `android/`
  in Android Studio or run `./gradlew assembleDebug` (needs JDK 21 + Android SDK 36).
  The native `android/` directory is not committed — run `npx cap add android`
  once to recreate it (then `python3 scripts/make-icon.py` +
  `npx @capacitor/assets generate --android` for the icon and splash).
- Every push to `main` also builds it free on GitHub Actions
  (`.github/workflows/android.yml`) and publishes the APK to the rolling
  [`apk-latest`](https://github.com/kishannothingbackup/mileage-tracker/releases/tag/apk-latest)
  release, so it can be downloaded without logging in to GitHub. The APK is
  debug-signed — sideload it by allowing installs from unknown sources.

## Tech

Vite + React 18 (plain JavaScript, JSX), no TypeScript. Styling is hand-written CSS
(Manrope body + Chakra Petch display numerals via Google Fonts, with system-font
fallback). Routing/distances use a small built-in Kochi route matrix; unknown
place pairs fall back to a manual distance field.
