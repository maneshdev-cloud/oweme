import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeClient, type FakeClient } from './helpers/fake-supabase';
import { fixtureRpcs, fixtureTables, GROUP_CS, ME, RAHUL } from './helpers/fixtures';
import { scopedDb } from './helpers/rls-policies';
import { GET as exportHistory } from '@/app/api/history/export/route';
import { GET as health } from '@/app/api/health/route';

const state = vi.hoisted(() => ({ client: null as unknown, user: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => state.client,
  createServiceClient: () => null,
  getSessionUser: async () => state.user,
  requireUser: async () => state.user,
}));

let client: FakeClient;

function signInAs(userId: string | null) {
  const db = scopedDb(fixtureTables(), userId ?? ME, fixtureRpcs);
  db.user = userId ? { id: userId } : null;
  client = createFakeClient(db);
  state.client = client;
  state.user = userId ? { id: userId, email: 'manesh@example.com' } : null;
  return db;
}

beforeEach(() => {
  signInAs(ME);
});

describe('GET /api/history/export', () => {
  it('refuses to export anything without a session', async () => {
    signInAs(null);
    const response = await exportHistory(new Request('http://localhost/api/history/export?format=csv'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Sign in first.' });
  });

  it('records the export before handing the file over, so a purge can never race it', async () => {
    const db = signInAs(ME);
    const response = await exportHistory(new Request('http://localhost/api/history/export?format=csv'));
    expect(response.status).toBe(200);

    const write = db.writes.find((entry) => entry.table === 'user_exports');
    expect(write?.payload).toMatchObject({ user_id: ME, format: 'csv', row_count: 7 });
  });

  it('returns a downloadable CSV with the user’s own rows and a totals footer', async () => {
    const response = await exportHistory(new Request('http://localhost/api/history/export?format=csv'));
    const body = await response.text();

    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toMatch(/attachment; filename="oweme-history-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(body).toContain('"Printout bundle"');
    expect(body).toContain('"Owed to you (INR)",520.50');
    expect(body).not.toContain('Someone else’s dinner');
  });

  it('returns JSON with the same totals when asked', async () => {
    const response = await exportHistory(new Request('http://localhost/api/history/export?format=json'));
    const payload = await response.json();

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(payload.rows).toHaveLength(7);
    expect(payload.totals).toMatchObject({ owedToYou: 52050, youOwe: 50000, disputed: 30000 });
  });

  it('applies the filters from the query string', async () => {
    const db = signInAs(ME);
    const url = `http://localhost/api/history/export?format=json&person=${RAHUL}&status=pending&q=printout`;
    const payload = await (await exportHistory(new Request(url))).json();

    // Rahul's share of the pending group expense matches too — search is
    // description-based, which is exactly what a student expects.
    expect(payload.rows.map((row: { id: string }) => row.id).sort()).toEqual(
      ['eeeeeeee-0000-0000-0000-000000000001', '9f000000-0000-0000-0000-000000000001'].sort(),
    );
    expect(db.writes.find((entry) => entry.table === 'user_exports')?.payload.filters).toMatchObject({
      personId: RAHUL,
      status: 'pending',
      query: 'printout',
    });
  });

  it('honours a group filter', async () => {
    const payload = await (
      await exportHistory(new Request(`http://localhost/api/history/export?format=json&group=${GROUP_CS}`))
    ).json();
    expect(payload.rows.map((row: { kind: string }) => row.kind)).toEqual(['group_expense']);
  });
});

describe('GET /api/health', () => {
  it('reports ok with a latency when the database answers', async () => {
    const response = await health();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.database).toBe('reachable');
    expect(typeof payload.latencyMs).toBe('number');
  });

  it('reports degraded with a 503 when the database answers with an error', async () => {
    client.__db.failNext = { table: 'healthcheck', message: 'project paused' };
    const response = await health();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'degraded', database: 'error' });
  });
});
