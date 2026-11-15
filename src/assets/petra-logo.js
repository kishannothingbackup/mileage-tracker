// Petra logo as a data URI.
//
// The logo is stored as base64 text (petra-logo.b64) instead of a binary
// image file, because the GitHub snapshot-push procedure rejects non-UTF-8
// files. The same .b64 file is the source for the Android launcher icon —
// see scripts/make-icon.py.
import b64 from './petra-logo.b64?raw'

export const PETRA_LOGO = 'data:image/jpeg;base64,' + b64
