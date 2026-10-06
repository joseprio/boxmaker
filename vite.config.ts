import { createHash } from 'node:crypto'
import { existsSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
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

/**
 * Writes sw.js, a service worker that precaches every file of the build so the app
 * works offline. It goes in the project root, not dist/: a service worker only
 * controls pages at or below its own folder, and the site's root index.html (which
 * redirects to dist/) must open offline too. Its cache name hashes the file list,
 * so each build that changes an asset installs a fresh cache and drops the old one.
 */
const offlineServiceWorker = (): Plugin => {
  let root = ''
  let outDir = ''
  let publicDir = ''
  let files: string[] = []
  return {
    name: 'offline-service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = resolve(config.root, config.build.outDir)
      publicDir = config.publicDir
    },
    generateBundle(_, bundle) {
      // The page is renamed to index.html after the bundle is written (appPageAsIndex).
      files = ['', 'index.html', ...Object.keys(bundle).filter((f) => !f.endsWith('.html'))]
      if (publicDir && existsSync(publicDir)) files.push(...readdirSync(publicDir))
    },
    closeBundle() {
      const prefix = relative(root, outDir).split(sep).join('/') + '/'
      // The root redirect page and the favicon it links to.
      const rootFiles = ['', 'index.html', 'public/favicon.svg']
      const precache = [...rootFiles, ...files.map((f) => prefix + f)].sort().map((f) => `./${f}`)
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)
      writeFileSync(
        resolve(root, 'sw.js'),
        serviceWorkerSource(`boxmaker-${version}`, precache, `./${prefix}index.html`),
      )
    },
  }
}

const serviceWorkerSource = (cacheName: string, precache: string[], appPage: string) => `// Generated at build time by vite.config.ts.
const CACHE = ${JSON.stringify(cacheName)};
const PRECACHE = ${JSON.stringify(precache)};
const APP_PAGE = ${JSON.stringify(appPage)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  if (request.mode === 'navigate') {
    // Network first for the page, so a new build shows up as soon as it's online.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request, { ignoreSearch: true }).then((cached) => cached || caches.match(APP_PAGE)),
        ),
    );
    return;
  }
  // Hashed assets never change: cache first, keeping anything fetched later too.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), appPageAsIndex(), offlineServiceWorker()],
  base: './',
  build: { rollupOptions: { input: 'app.html' } },
  server: { open: '/app.html' },
  test: { environment: 'node' },
} as ReturnType<typeof defineConfig>)
