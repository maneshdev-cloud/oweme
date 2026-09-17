import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeClient, type FakeClient } from './helpers/fake-supabase';
import {
  ARCHIVED_MINE,
  ARCHIVED_ORIGINAL_ID,
  EXPENSE_CONFIRMED,
  EXPENSE_DISPUTED,
  EXPENSE_PENDING,
  fixtureRpcs,
  fixtureTables,
  GROUP_CS,
  GROUP_EXPENSE_MINE,
  ME,
  PRIYA,
  RAHUL,
  SETTLEMENT_CONFIRMED,
  SETTLEMENT_PENDING,
} from './helpers/fixtures';
import { scopedDb } from './helpers/rls-policies';
import { getHistory, toCsv } from '@/lib/queries/history';

const state = vi.hoisted(() => ({ client: null as unknown, user: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => state.client,
  createServiceClient: () => null,
  getSessionUser: async () => state.user,
  requireUser: async () => state.user,
}));

let client: FakeClient;

/** Postgres would hand the session exactly this: RLS-filtered rows, nothing else. */
function signInAs(userId: string | null) {
  const db = scopedDb(fixtureTables(), userId ?? ME, fixtureRpcs);
  db.user = userId ? { id: userId } : null;
  client = createFakeClient(db);
  state.client = client;
  state.user = userId ? { id: userId, email: 'manesh@example.com' } : null;
  return client;
}

beforeEach(() => {
  signInAs(ME);
});

describe('history queries', () => {
  it('merges live expenses, settlements, group expenses and archived records', async () => {
    const history = await getHistory();
    expect(history.rows.map((row) => row.kind).sort()).toEqual([
      'archived_expense',
      'expense',
      'expense',
      'expense',
      'group_expense',
      'settlement',
      'settlement',
    ]);
  });

  it('never returns a row the signed-in user is not part of', async () => {
    const history = await getHistory();
    const ids = history.rows.map((row) => row.id);
    expect(ids).not.toContain('eeeeeeee-0000-0000-0000-000000000004'); // someone else's expense
    expect(ids).not.toContain('a0000000-0000-0000-0000-000000000003'); // someone else's settlement
    expect(ids).not.toContain('9f000000-0000-0000-0000-000000000002'); // another group's expense
    expect(ids).not.toContain('ab000000-0000-0000-0000-000000000002'); // another pair's archive
    expect(history.rows.every((row) => row.description !== 'Someone else’s dinner')).toBe(true);
  });

  it('totals what you are owed, what you owe, and what is settled / pending / disputed', async () => {
    const { totals } = await getHistory();
    // owed to you: 120.50 (Rahul owes) + 300.00 (Priya disputed) + 100.00 (settlement claim)
    expect(totals.owedToYou).toBe(52050);
    // you owe: 500.00 to Rahul (already confirmed → counted as settled, not pending)
    expect(totals.youOwe).toBe(50000);
    // settled: 500.00 confirmed expense + 50.00 confirmed settlement + 60.00 archived
    expect(totals.settled).toBe(61000);
    // pending: 120.50 expense + 100.00 settlement + 300.00 group expense
    expect(totals.pending).toBe(52050);
    expect(totals.disputed).toBe(30000);
  });

  it('filters by person without leaking the other side of the ledger', async () => {
    const history = await getHistory({ personId: RAHUL });
    // Both directions of both records, the archive they were part of, and the
    // group expense he holds a share in.
    expect(history.rows.map((row) => row.id).sort()).toEqual(
      [
        EXPENSE_PENDING,
        EXPENSE_CONFIRMED,
        SETTLEMENT_PENDING,
        SETTLEMENT_CONFIRMED,
        ARCHIVED_ORIGINAL_ID,
        GROUP_EXPENSE_MINE,
      ].sort(),
    );
    // …and nothing that only involves Priya.
    expect(history.rows.some((row) => row.id === EXPENSE_DISPUTED)).toBe(false);
  });

  it('narrows a group expense to the person who paid it or holds a share', async () => {
    // Rahul holds a share of the CS Project expense, so he matches it…
    expect((await getHistory({ personId: RAHUL })).rows.some((row) => row.id === GROUP_EXPENSE_MINE)).toBe(true);
    // …Priya does not.
    const priya = await getHistory({ personId: PRIYA });
    expect(priya.rows.map((row) => row.id)).toEqual([EXPENSE_DISPUTED]);
  });

  it('filters by date range inclusively at both ends', async () => {
    const february = await getHistory({ from: '2026-02-01T00:00:00.000Z', to: '2026-02-28' });
    expect(february.rows.map((row) => row.id)).toContain(EXPENSE_PENDING);
    expect(february.rows.map((row) => row.id)).not.toContain(EXPENSE_CONFIRMED); // January
    expect(february.rows.map((row) => row.id)).not.toContain(EXPENSE_DISPUTED); // March
  });

  it('filters by status, including archived rows', async () => {
    const settled = await getHistory({ status: 'settled' });
    expect(settled.rows.map((row) => row.id).sort()).toEqual(
      [EXPENSE_CONFIRMED, 'a0000000-0000-0000-0000-000000000002', ARCHIVED_ORIGINAL_ID].sort(),
    );

    const disputed = await getHistory({ status: 'disputed' });
    expect(disputed.rows.map((row) => row.id)).toEqual([EXPENSE_DISPUTED]);

    const pending = await getHistory({ status: 'pending' });
    expect(pending.rows.map((row) => row.id)).toContain(GROUP_EXPENSE_MINE);
    expect(pending.rows.map((row) => row.id)).not.toContain(EXPENSE_CONFIRMED);
  });

  it('searches descriptions case-insensitively, live and archived', async () => {
    const history = await getHistory({ query: 'printout' });
    expect(history.rows.map((row) => row.id).sort()).toEqual([EXPENSE_PENDING, GROUP_EXPENSE_MINE].sort());

    const archived = await getHistory({ query: 'chai' });
    expect(archived.rows.map((row) => row.id)).toEqual([ARCHIVED_ORIGINAL_ID]);

    // Settlements only match a search that is actually about settling up.
    expect((await getHistory({ query: 'settle' })).rows.every((row) => row.kind === 'settlement')).toBe(true);
    expect((await getHistory({ query: 'printout' })).rows.some((row) => row.kind === 'settlement')).toBe(false);
  });

  it('filters by group', async () => {
    const history = await getHistory({ groupId: GROUP_CS });
    expect(history.rows.map((row) => row.id)).toEqual([GROUP_EXPENSE_MINE]);
  });

  it('returns an empty, well-formed export when nobody is signed in', async () => {
    signInAs(null);
    const history = await getHistory();
    expect(history.rows).toEqual([]);
    expect(history.totals).toEqual({ owedToYou: 0, youOwe: 0, settled: 0, pending: 0, disputed: 0 });
  });
});

describe('CSV export', () => {
  function csvRows(csv: string) {
    return csv.split('\n');
  }

  it('quotes every cell, uses ISO dates and converts paise back to rupees', async () => {
    const history = await getHistory();
    const csv = toCsv(history);
    const lines = csvRows(csv);

    expect(lines[0]).toBe('"Date","Type","Description","Group","People","Amount (INR)","Direction","Status","Source"');

    const printout = lines.find((line) => line.includes('Printout bundle') && line.includes('"120.50"'));
    expect(printout).toBeDefined();
    expect(printout).toContain('"2026-02-10"');
    expect(printout).toContain('"you paid"');
    expect(printout).toContain('"Rahul Sharma"');

    const archived = lines.find((line) => line.includes('Old chai run'));
    expect(archived).toContain('"60.00"');
    expect(archived).toContain('"archived"');
  });

  it('ends with the totals footer a student can eyeball against the app', async () => {
    const csv = toCsv(await getHistory());
    expect(csv).toContain('"Owed to you (INR)",520.50');
    expect(csv).toContain('"You owe (INR)",500.00');
    expect(csv).toContain('"Settled (INR)",610.00');
    expect(csv).toContain('"Pending (INR)",520.50');
    expect(csv).toContain('"Disputed (INR)",300.00');
    expect(csv).toContain('"Range from","the beginning"');
  });

  it('escapes embedded quotes and commas rather than breaking the file', () => {
    const csv = toCsv({
      generatedAt: '2026-05-01T00:00:00.000Z',
      range: { from: null, to: null },
      filters: {},
      totals: { owedToYou: 0, youOwe: 0, settled: 0, pending: 0, disputed: 0 },
      rows: [
        {
          kind: 'expense',
          id: 'x',
          date: '2026-04-01T00:00:00.000Z',
          description: 'Chai, samosa "extra"',
          amount: 4550,
          currency: 'INR',
          status: 'PENDING',
          direction: 'you_paid',
          counterpartyNames: ['Priya Nair'],
          groupName: null,
          source: 'live',
        },
      ],
    });

    expect(csv).toContain('"Chai, samosa ""extra"""');
    expect(csv).toContain('"45.50"');
  });
});
