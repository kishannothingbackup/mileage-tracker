import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { PETRA_LOGO } from './assets/petra-logo.js'

// Favicon: the logo is a data URI (stored as base64 text in the repo), so
// set it at runtime instead of linking a binary image file.
const favicon = document.querySelector("link[rel~='icon']") || document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/jpeg'
favicon.href = PETRA_LOGO
document.head.appendChild(favicon)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
