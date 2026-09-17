/**
 * A throwaway Supabase stand-in for smoke-testing the app without a real
 * project: it answers the handful of endpoints `@supabase/ssr` calls.
 *
 *   node scripts/mock-supabase.mjs            # listens on 127.0.0.1:54321
 *
 * Then build and start the app against it:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key \
 *   npm run build && npm start
 *   node scripts/smoke.mjs
 *
 * It is NOT a database: every table returns an empty array and there is no
 * session. That is exactly enough to prove the running server boots, the route
 * guard redirects, the health probe works, and the PWA assets are served.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 54321);

const json = (res, status, body, headers = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // No session: an unsigned request gets the same 401 a real project returns.
  if (url.pathname === '/auth/v1/user') {
    return json(res, 401, { code: 401, msg: 'invalid claim: missing sub claim' });
  }
  if (url.pathname.startsWith('/auth/v1/')) {
    return json(res, 400, { code: 400, msg: 'mock: no auth flows implemented' });
  }

  // PostgREST: empty tables, valid shapes.
  if (url.pathname.startsWith('/rest/v1/')) {
    const isWrite = req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE';
    const prefer = String(req.headers.prefer ?? '');
    if (isWrite) {
      res.writeHead(201, {
        'content-type': 'application/json',
        ...(prefer.includes('return=representation') ? {} : { prefer: 'return=minimal' }),
      });
      return res.end(prefer.includes('return=representation') ? '[]' : '');
    }
    return json(res, 200, [], { 'content-range': '0-0/0' });
  }

  if (url.pathname.startsWith('/storage/v1/')) return json(res, 200, []);

  return json(res, 404, { message: `mock: nothing at ${url.pathname}` });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock supabase listening on http://127.0.0.1:${PORT}`);
});
