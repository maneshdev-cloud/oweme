/**
 * End-to-end smoke test against a *running* OweMe server.
 *
 *   node scripts/mock-supabase.mjs &        # or point at a real project
 *   npm run build && npm start &
 *   BASE_URL=http://127.0.0.1:3001 node scripts/smoke.mjs
 *
 * Checks the things that must hold before anyone signs in: the guard redirects
 * strangers, the login screen renders, the health probe reports honestly, the
 * export refuses anonymous callers, and the PWA assets are served with the
 * right headers. Exits non-zero on the first failure.
 */
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3001';

let failures = 0;

function check(name, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`${status}  ${name}${detail && !condition ? ` — ${detail}` : ''}`);
}

async function get(path, init) {
  const response = await fetch(`${BASE}${path}`, { redirect: 'manual', ...init });
  const text = await response.text();
  return { response, text };
}

// --- the app is up ---------------------------------------------------------
{
  const { response, text } = await get('/login');
  check('GET /login → 200', response.status === 200, `got ${response.status}`);
  check('login screen renders copy', text.includes('OweMe remembers who owes whom.'));
  check('login screen offers Google sign-in', /Google/i.test(text));
}

// --- fonts are self-hosted: no third-party fetch at build OR at runtime ----
{
  const { text } = await get('/login');
  check('the page asks no third party for fonts', !/fonts\.(googleapis|gstatic)\.com/.test(text), 'Google Fonts reference found in the HTML');

  const fontUrl = text.match(/\/_next\/static\/media\/[^"']+\.woff2/)?.[0];
  check('it preloads a self-hosted .woff2', Boolean(fontUrl), 'no woff2 in the served HTML');

  if (fontUrl) {
    const response = await fetch(`${BASE}${fontUrl}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    check('that font is served and really is woff2', response.status === 200 && bytes.subarray(0, 4).toString('latin1') === 'wOF2', `status ${response.status}`);
    check('the font file is not vanishingly small', bytes.length > 20_000, `${bytes.length} bytes`);
  }
}

// --- strangers are kept out of every protected route ----------------------
for (const path of ['/home', '/friends', '/groups', '/notifications', '/history', '/profile', '/admin', '/expenses/abc', '/settlements/abc']) {
  const { response } = await get(path);
  const location = response.headers.get('location') ?? '';
  check(
    `GET ${path} → redirects to /login with a reason`,
    (response.status === 307 || response.status === 302 || response.status === 303) &&
      location.includes('/login') &&
      location.includes('reason=session-expired'),
    `${response.status} ${location}`,
  );
}

// --- root decides where you belong -----------------------------------------
{
  const { response } = await get('/');
  check('GET / → redirects', [302, 303, 307, 308].includes(response.status), `got ${response.status}`);
}

// --- health probe ---------------------------------------------------------
{
  const { response, text } = await get('/api/health');
  const payload = JSON.parse(text);
  check('/api/health answers', [200, 503].includes(response.status), `got ${response.status}`);
  check('health payload is structured', typeof payload.status === 'string' && typeof payload.database === 'string', text);
  console.log(`      health: ${payload.status} / ${payload.database}${payload.latencyMs ? ` (${payload.latencyMs}ms)` : ''}`);
}

// --- export refuses anonymous callers -------------------------------------
{
  const { response } = await get('/api/history/export?format=csv');
  check('/api/history/export → 401 without a session', response.status === 401, `got ${response.status}`);
}

// --- PWA surface ----------------------------------------------------------
{
  const { response, text } = await get('/manifest.webmanifest');
  const manifest = JSON.parse(text);
  check('manifest is valid JSON', typeof manifest.name === 'string');
  check('manifest declares standalone display', manifest.display === 'standalone');
  check('manifest lists 192 + 512 icons', manifest.icons?.some((icon) => icon.sizes === '192x192') && manifest.icons?.some((icon) => icon.sizes === '512x512'));
  check('manifest starts at /home', manifest.start_url === '/home');
}

for (const asset of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', '/offline.html']) {
  const { response } = await get(asset);
  check(`GET ${asset} → 200`, response.status === 200, `got ${response.status}`);
}

{
  const { response, text } = await get('/sw.js');
  check('GET /sw.js → 200', response.status === 200, `got ${response.status}`);
  check('service worker is never cached by the browser', /no-store|must-revalidate/.test(response.headers.get('cache-control') ?? ''), response.headers.get('cache-control') ?? '');
  check('service worker allows root scope', response.headers.has('service-worker-allowed'), 'missing Service-Worker-Allowed');
  check('service worker refuses to queue writes offline', text.includes("request.method !== 'GET'") && /offline/i.test(text));
}

{
  const { response } = await get('/offline.html');
  check('offline page is served with html', (response.headers.get('content-type') ?? '').includes('text/html'));
}

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All smoke checks passed.');
