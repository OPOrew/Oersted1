/* Classic 737 Line Lab - service worker
 * Keeps app files, sounds and images on the device so the trainer opens fast and keeps working with a weak or no connection.
 *
 *  /assets/*          hashed build files      -> cache first (they never change under the same name)
 *  /sounds, images    public files            -> stale-while-revalidate (instant from cache, refreshed in the background)
 *  page navigations   HTML                    -> network first (always the newest deploy), cached copy when offline / slow
 *  Google Fonts       css + font files        -> stale-while-revalidate
 * Everything else (map tiles, POST, Range requests, other origins) goes straight to the network.
 * Bump CACHE_VERSION to throw all cached files away on the next visit.
 */
const CACHE_VERSION = "v1";
const PAGES = "oersted-pages-" + CACHE_VERSION;
const STATIC = "oersted-static-" + CACHE_VERSION;
const FONTS = "oersted-fonts-" + CACHE_VERSION;
const KEEP = [PAGES, STATIC, FONTS];
const MAX_STATIC_ENTRIES = 160;
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("oersted-") && !KEEP.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]); // oldest first
}

// waitUntil() throws once the event is no longer active (late background writes); those writes are best effort.
function keepAlive(event, promise) {
  try {
    event.waitUntil(promise);
  } catch {
    promise.catch(() => {});
  }
}

// allowOpaque: Google Fonts stylesheets are requested without CORS, so their responses are "opaque" but still safe to cache.
const okToStore = (res, allowOpaque) => res && ((res.status === 200 && (res.type === "basic" || res.type === "cors")) || (allowOpaque === true && res.type === "opaque"));

async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (okToStore(res)) {
    keepAlive(event, cache.put(event.request, res.clone()).then(() => trim(cacheName, MAX_STATIC_ENTRIES)));
  }
  return res;
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request);
  const refresh = fetch(event.request)
    .then((res) => {
      if (okToStore(res, cacheName === FONTS)) return cache.put(event.request, res.clone()).then(() => res);
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    keepAlive(event, refresh);
    return hit;
  }
  const res = await refresh;
  return res || new Response("", { status: 504, statusText: "Offline" });
}

async function networkFirstPage(event) {
  const cache = await caches.open(PAGES);
  const network = fetch(event.request).then((res) => {
    if (okToStore(res)) keepAlive(event, cache.put(event.request, res.clone()));
    return res;
  });
  try {
    // Wait for the network, but not forever: after NAV_TIMEOUT_MS fall back to the last good copy if there is one.
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    const hit = await cache.match(event.request);
    return hit || (await network);
  } catch {
    const hit = (await cache.match(event.request)) || (await cache.match("/"));
    return hit || new Response("Offline - open the app once with a connection to make it available offline.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return; // let the browser handle it
  const url = new URL(req.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(event, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return; // map tiles, APIs, ...

  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(event));
    return;
  }
  const p = url.pathname;
  if (p.startsWith("/assets/")) {
    event.respondWith(cacheFirst(event, STATIC));
    return;
  }
  if (p.startsWith("/sounds/") || p.startsWith("/lights/") || p.startsWith("/trainers/") || /\.(?:png|jpe?g|webp|svg|ico|mp3|wav|woff2?)$/i.test(p)) {
    event.respondWith(staleWhileRevalidate(event, STATIC));
  }
});
