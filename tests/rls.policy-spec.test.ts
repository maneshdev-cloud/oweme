import { describe, expect, it, vi } from 'vitest';
import { createFakeClient } from './helpers/fake-supabase';
import {
  EXPENSE_NOT_MINE,
  EXPENSE_PENDING,
  GROUP_EXPENSE_NOT_MINE,
  ME,
  NOTIFICATION_NOT_MINE,
  PRIYA,
  fixtureRpcs,
  fixtureTables,
  RAHUL,
  VIKRAM,
} from './helpers/fixtures';
import { policies, scopedTables } from './helpers/rls-policies';
import { getExpenseDetail, getGroupDetail, getNotifications } from '@/lib/queries/social';
import { getHistory } from '@/lib/queries/history';

const state = vi.hoisted(() => ({ client: null as unknown, user: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => state.client,
  createServiceClient: () => null,
  getSessionUser: async () => state.user,
  requireUser: async () => state.user,
}));

function signInAs(userId: string) {
  const db = scopedTables(fixtureTables(), userId);
  state.client = createFakeClient({ tables: db, user: { id: userId }, rpcs: fixtureRpcs, writes: [], failNext: null });
  state.user = { id: userId, email: 'person@example.com' };
}

const tables = fixtureTables();

/**
 * Two layers, on purpose:
 *
 *  1. `02_rls_test.sql` proves Postgres itself refuses cross-user access — that
 *     is the real defence, and it runs against a real schema.
 *  2. This file checks the *app* never assumes more than that: given exactly the
 *     rows a session could read, the query helpers must not widen the set, and
 *     public data must stay public-data-shaped (no emails, no balances).
 */
describe('row-level security: what each person can see', () => {
  it('gives a stranger nothing that is not theirs', () => {
    const visible = scopedTables(tables, VIKRAM);
    expect(visible.expenses.map((row) => row.id)).toEqual([EXPENSE_NOT_MINE]);
    expect(visible.settlements).toHaveLength(1);
    expect(visible.notifications.map((row) => row.id)).toEqual([NOTIFICATION_NOT_MINE]);
    expect(visible.group_expenses.map((row) => row.id)).toEqual([GROUP_EXPENSE_NOT_MINE]);
    expect(visible.archived_records).toHaveLength(1);
  });

  it('keeps both sides of a 1:1 record visible and nobody else', () => {
    const asPayer = scopedTables(tables, ME).expenses.map((row) => row.id);
    const asDebtor = scopedTables(tables, RAHUL).expenses.map((row) => row.id);
    const asThirdParty = scopedTables(tables, PRIYA).expenses.map((row) => row.id);

    expect(asPayer).toContain(EXPENSE_PENDING);
    expect(asDebtor).toContain(EXPENSE_PENDING);
    expect(asThirdParty).not.toContain(EXPENSE_PENDING);
  });

  it('exposes other people’s public fields but never their email', () => {
    const visible = scopedTables(tables, ME);
    expect(visible.profiles.map((row) => row.id)).toEqual([ME]);
    expect(visible.public_profiles).toHaveLength(4);
    expect(visible.public_profiles.every((row) => row.email === undefined)).toBe(true);
  });

  it('lets a user write only their own profile row and read only their own exports', () => {
    expect(policies.profiles({ id: ME }, ME, { tables })).toBe(true);
    expect(policies.profiles({ id: RAHUL }, ME, { tables })).toBe(false);
    expect(policies.user_exports({ user_id: ME }, ME, { tables })).toBe(true);
    expect(policies.user_exports({ user_id: VIKRAM }, ME, { tables })).toBe(false);
  });

  it('treats notifications as private: no forging, no reading someone else’s', () => {
    expect(policies.notifications({ user_id: ME }, ME, { tables })).toBe(true);
    expect(policies.notifications({ user_id: ME }, VIKRAM, { tables })).toBe(false);
  });
});

describe('query helpers inside a scoped session', () => {
  it('never returns another person’s expense detail', async () => {
    signInAs(VIKRAM);
    expect(await getExpenseDetail(EXPENSE_PENDING)).toBeNull();
    expect((await getExpenseDetail(EXPENSE_NOT_MINE))?.expense.id).toBe(EXPENSE_NOT_MINE);
  });

  it('never returns a group the viewer is not a member of', async () => {
    signInAs(ME);
    expect(await getGroupDetail('cccccccc-cccc-cccc-cccc-cccccccc0002')).toBeNull();
  });

  it('returns only the viewer’s notifications even if the table is asked for everything', async () => {
    signInAs(PRIYA);
    expect(await getNotifications()).toEqual([]);
  });

  it('keeps an export to the viewer’s own records', async () => {
    signInAs(RAHUL);
    const history = await getHistory();
    expect(history.rows.every((row) => row.description !== 'Not my business')).toBe(true);
  });
});
