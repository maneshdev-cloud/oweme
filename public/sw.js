/* OweMe service worker — an offline-friendly shell, nothing clever.
 *
 * What it deliberately does NOT do:
 *   • it never queues a financial write. Creating an expense, marking a payment
 *     or recording a settlement requires a live connection, because V1 has no
 *     conflict resolution and a "saved" that never reached the server would be
 *     a lie. The app says "You're offline" instead.
 *   • it never caches API responses or anything under /api — balances must
 *     never be served stale.
 *   • it never caches a page that required an authenticated render, so one
 *     person's screen cannot be replayed to another on a shared device.
 *
 * Strategy summary:
 *   static assets  → cache-first, revalidated in the background
 *   navigations    → network-first, falling back to the cached shell, then to
 *                    /offline.html, then to a plain "you're offline" response
 *   everything else→ straight to the network
 */

const VERSION = 'oweme-v1';
const STATIC_CACHE = `${VERSION}-static`;
const SHELL_CACHE = `${VERSION}-shell`;

const PRECACHE = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

const OFFLINE_HTML = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><title>You're offline · OweMe</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100svh; display:grid; place-items:center; padding:24px;
         font:16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
         background:#faf9f7; color:#14121c; text-align:center; }
  h1 { font-size:1.35rem; margin:0 0 6px; }
  p { margin:0; color:#5b5768; max-width:32ch; }
  .dot { width:44px; height:44px; border-radius:14px; background:#7c3aed; margin:0 auto 16px; }
  @media (prefers-color-scheme: dark) { body { background:#14121c; color:#f6f5f9; } p { color:#a7a3b3; } }
</style></head>
<body><div><div class="dot"></div>
<h1>You're offline</h1>
<p>Your balances are safe on the server. Adding an expense needs a connection — reopen OweMe when you're back.</p>
</div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Individual failures must not abort the install.
      await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|png|jpg|jpeg|svg|webp|woff2?|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch the API: a stale balance is worse than no balance.
  if (url.pathname.startsWith('/api/')) return;

  // Never cache authenticated HTML responses — see the header comment.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cached = await caches.match(request, { ignoreSearch: true });
          if (cached) return cached;
          const offline = await caches.match('/offline.html');
          if (offline) return offline;
          return new Response(OFFLINE_HTML, {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
          });
        }
      })(),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) {
          // Refresh quietly for next time; the cached copy answers now.
          event.waitUntil(
            fetch(request)
              .then((response) => (response.ok ? caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone())) : undefined))
              .catch(() => undefined),
          );
          return cached;
        }
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          const offline = await caches.match('/offline.html');
          if (offline) return offline;
          throw error;
        }
      })(),
    );
  }
});

/* -----------------------------------------------------------------------------
 * Web Push & System Notification Handlers
 * -----------------------------------------------------------------------------
 */
self.addEventListener('push', (event) => {
  let payload = {
    title: 'OWEME',
    body: 'You have a new update in OWEME.',
    url: '/notifications',
    tag: 'oweme-alert',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed,
        url: parsed.url || (parsed.settlement_id ? `/expenses/${parsed.settlement_id}` : '/notifications'),
      };
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    (async () => {
      // Point 7: Foreground notification deduplication.
      // If user is actively focused on an open OWEME window, suppress duplicate system alerts
      // (Supabase Realtime already handles in-app chimes, toasts, and UI revalidation).
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const isFocused = allClients.some((client) => client.focused);

      if (isFocused) {
        // App is open and in foreground right now; let in-app Realtime handle the notification.
        return;
      }

      const options = {
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: {
          url: payload.url,
          type: payload.type,
          tag: payload.tag,
        },
        tag: payload.tag || 'oweme',
        renotify: true,
        vibrate: [100, 50, 100],
      };

      return self.registration.showNotification(payload.title, options);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/notifications';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const origin = self.location.origin;

      // Focus an existing window if one is open
      for (const client of clients) {
        if (client.url.startsWith(origin) && 'focus' in client) {
          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }
          return client.focus();
        }
      }

      // No open window found: open a fresh window directly to target URL
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title || 'OweMe', {
        icon: '/icons/icon-192.png',
        badge: '/icons/favicon-32.png',
        ...options,
      }),
    );
  }
});
