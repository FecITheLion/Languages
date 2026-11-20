/* Only the public app shell and fingerprinted build assets are stored. */
const base = new URL(self.registration.scope);
const cacheName = `grammar2json-shell-v2:${base.pathname}`;
const shellUrl = new URL('index.html', base).href;

function cacheable(response, type) {
  const policy = response.headers.get('Cache-Control') || '';
  return response.ok && response.type === 'basic' &&
    !/\b(?:private|no-store)\b/i.test(policy) &&
    (!type || (response.headers.get('Content-Type') || '').toLowerCase().includes(type));
}

function buildAsset(url) {
  return url.origin === base.origin && !url.search &&
    url.pathname.startsWith(`${base.pathname}assets/`) &&
    /-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|svg|webp)$/.test(url.pathname);
}

function assetResponse(response) {
  const type = (response.headers.get('Content-Type') || '').toLowerCase();
  return cacheable(response) && type !== '' && !type.includes('text/html');
}

async function updateShell() {
  const response = await fetch(shellUrl, { credentials: 'omit', cache: 'no-cache' });
  if (!cacheable(response, 'text/html')) throw new Error('Public shell unavailable');
  const html = await response.clone().text();
  const urls = new Set();
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const url = new URL(match[1], shellUrl);
    if (buildAsset(url)) urls.add(url.href);
  }
  if (!urls.size) throw new Error('No built assets in shell');
  const cache = await caches.open(cacheName);
  for (const url of urls) {
    if (await cache.match(url)) continue;
    const asset = await fetch(url, { credentials: 'omit' });
    if (!assetResponse(asset)) throw new Error('Build asset unavailable');
    await cache.put(url, asset);
  }
  await cache.put(shellUrl, response);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - 300))) {
    if (key.url !== shellUrl && !urls.has(key.url)) await cache.delete(key);
  }
}

self.addEventListener('install', event => {
  event.waitUntil(updateShell());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== cacheName && /^grammar2json-shell-v\d+:/.test(name) && name.endsWith(`:${base.pathname}`)) {
        await caches.delete(name);
      }
    }
  })());
});

// A new worker waits for existing tabs to close; it never forces a reload.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== base.origin || request.headers.has('Authorization')) return;
  if (url.pathname.includes('%')) return;
  const relative = url.pathname.startsWith(base.pathname) ? url.pathname.slice(base.pathname.length) : '';
  if (/^(?:api|healthz)(?:\/|$)/i.test(relative) || /^\/(?:api|healthz)(?:\/|$)/i.test(url.pathname)) return;
  if (request.mode === 'navigate' && url.pathname.startsWith(base.pathname)) {
    event.waitUntil(updateShell().catch(() => {}));
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return (await (await caches.open(cacheName)).match(shellUrl)) || Response.error();
      }
    })());
  } else if (buildAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request.url, { credentials: 'omit' });
      if (assetResponse(response)) await cache.put(request, response.clone());
      return response;
    })());
  }
});
