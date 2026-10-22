// The production build replaces the token, so every changed app gets a fresh cache.
const BASE = new URL(self.registration.scope).pathname;
const ASSETS = `${BASE}assets/`;
// Each project on username.github.io has a separate worker/cache namespace.
const CACHE_PREFIX = `crux-shell-${encodeURIComponent(BASE)}-`;
const VERSION = "__CRUX_BUILD__";
const CACHE = `${CACHE_PREFIX}${VERSION}`;
self.addEventListener("message", (event) => {
  if (event.data?.type === "CRUX_GET_VERSION") {
    event.source?.postMessage({ type: "CRUX_VERSION", version: VERSION });
  }
});
const APP_FILES = [
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "manifest.webmanifest",
].map((file) => BASE + file);
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(BASE, { cache: "reload" });
      const html = await response.clone().text();
      const assets = [...html.matchAll(/(?:src|href)="([^\"]+)"/g)]
        .map((m) => new URL(m[1], self.registration.scope))
        .filter(
          (url) =>
            url.origin === self.location.origin &&
            url.pathname.startsWith(ASSETS),
        )
        .map((url) => url.pathname + url.search);
      // Never replace the offline app with a hosting sign-in/error page.
      if (
        !response.ok ||
        response.redirected ||
        !assets.length ||
        !html.includes('id="root"') ||
        !html.includes(`name="crux-build" content="${VERSION}"`)
      ) {
        throw new Error(
          "The app shell is unavailable; retain the previous offline version.",
        );
      }
      const cache = await caches.open(CACHE);
      try {
        await cache.addAll([...new Set([...assets, ...APP_FILES])]);
        await cache.put(BASE, response);
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (!url.pathname.startsWith(BASE)) return;
  // Leave hosting authentication routes to the platform.
  if (
    event.request.mode === "navigate" &&
    url.pathname !== BASE &&
    url.pathname !== `${BASE}index.html`
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Module requests can send Origin while precache requests do not. Hashed
      // static files are identical even when the host sends Vary: Origin.
      const cached = await cache.match(
        event.request.mode === "navigate" ? BASE : event.request,
        {
          ignoreVary:
            event.request.mode === "navigate" ||
            url.pathname.startsWith(ASSETS) ||
            APP_FILES.includes(url.pathname),
        },
      );
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok && url.pathname.startsWith(ASSETS)) {
        await cache.put(event.request, response.clone());
      }
      return response;
    })(),
  );
});
