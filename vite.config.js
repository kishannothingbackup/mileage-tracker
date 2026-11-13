import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the built app also works when opened from a static file host
// or a plain folder, not only from the dev server.
export default defineConfig({
  plugins: [react()],
  base: './',
})
