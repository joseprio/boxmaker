import { existsSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The app's page is app.html (the root index.html only redirects to the
 * published build in dist/), but the build should still be dist/index.html.
 */
const appPageAsIndex = (): Plugin => {
  let outDir = 'dist'
  return {
    name: 'app-page-as-index',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const page = resolve(outDir, 'app.html')
      if (existsSync(page)) renameSync(page, resolve(outDir, 'index.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), appPageAsIndex()],
  base: './',
  build: { rollupOptions: { input: 'app.html' } },
  server: { open: '/app.html' },
  test: { environment: 'node' },
} as ReturnType<typeof defineConfig>)
