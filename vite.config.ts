import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Same headers Caddy sends in production — needed for crossOriginIsolated
// (multithreaded WASM, e.g. onnxruntime in the background remover).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// Mirrors the Caddy handle_path /api/convert/* → Gotenberg proxy so the
// server-assisted DOCX → PDF tool works in dev/preview. Point GOTENBERG_URL
// at a real Gotenberg, or run `npm run gotenberg:mock` (soffice-backed).
const convertProxy = {
  '/api/convert': {
    target: process.env.GOTENBERG_URL ?? 'http://localhost:3100',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/convert/, ''),
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: isolationHeaders, proxy: convertProxy },
  preview: { headers: isolationHeaders, proxy: convertProxy },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
