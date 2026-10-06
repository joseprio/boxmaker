/**
 * Registers the build's service worker so the app works offline. It lives in the site
 * root, one folder above the published build in dist/ (see vite.config.ts), so it also
 * covers the root page that redirects here.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('../sw.js').catch((err) => {
      console.warn('Service worker registration failed', err)
    })
  })
}
