import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeClient, type FakeClient } from './helpers/fake-supabase';
import {
  EXPENSE_CONFIRMED,
  EXPENSE_DISPUTED,
  EXPENSE_PENDING,
  fixtureRpcs,
  fixtureTables,
  ME,
  PRIYA,
  RAHUL,
  SETTLEMENT_CONFIRMED,
  SETTLEMENT_PENDING,
} from './helpers/fixtures';
import { scopedDb } from './helpers/rls-policies';
import { getDashboard } from '@/lib/queries/core';

const state = vi.hoisted(() => ({ client: null as unknown, user: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => state.client,
  createServiceClient: () => null,
  getSessionUser: async () => state.user,
  requireUser: async () => state.user,
}));

let client: FakeClient;
let dbInstance: ReturnType<typeof scopedDb>;

function signInAs(userId: string | null) {
  dbInstance = scopedDb(fixtureTables(), userId ?? ME, fixtureRpcs);
  dbInstance.user = userId ? { id: userId } : null;
  client = createFakeClient(dbInstance);
  state.client = client;
  state.user = userId ? { id: userId, email: 'manesh@example.com' } : null;
  return client;
}

beforeEach(() => {
  signInAs(ME);
});

describe('Dashboard Round 3 — Balances, Subtotals & Needs Response', () => {
  it('Friends and Groups sub-totals sum exactly to main totals', async () => {
    const dashboard = await getDashboard();
    const { totals } = dashboard;

    // Sub-totals must sum exactly to the main totals
    expect(totals.you_are_owed).toBe(
      Math.round((totals.friends_owed + totals.groups_owed) * 100) / 100,
    );
    expect(totals.you_owe).toBe(
      Math.round((totals.friends_owe + totals.groups_owe) * 100) / 100,
    );
    expect(totals.net).toBe(
      Math.round((totals.you_are_owed - totals.you_owe) * 100) / 100,
    );

    // Verify Friends sub-total is computed from 1:1 records (my_totals)
    expect(totals.friends_owed).toBeGreaterThanOrEqual(0);
    expect(totals.friends_owe).toBeGreaterThanOrEqual(0);

    // Verify Groups sub-total is computed from group records (my_group_summaries)
    expect(totals.groups_owed).toBeGreaterThanOrEqual(0);
    expect(totals.groups_owe).toBeGreaterThanOrEqual(0);
  });

  it('Needs your response count ignores normal pending expenses where no payment was marked', async () => {
    // In fixtureTables, ME has EXPENSE_PENDING (Rahul owes ME 120.50, status PENDING).
    // Rahul hasn't marked it paid, so it does NOT require ME's confirmation.
    // ME is payer on SETTLEMENT_PENDING (waiting on Rahul, not ME).
    // ME has 0 incoming friend requests.
    const dashboard = await getDashboard();

    // Old openExpenses would have counted all open expenses (length >= 2).
    expect(dashboard.openExpenses.length).toBeGreaterThan(0);
    // But needsResponseCount must accurately be 0 because nothing is waiting on ME!
    expect(dashboard.needsResponseCount).toBe(0);
    expect(dashboard.waitingOnYou).toHaveLength(0);
  });

  it('Needs your response count accurately increments when an expense payment is marked for user to confirm', async () => {
    // Rahul marks payment on EXPENSE_PENDING
    const target = dbInstance.tables.expenses?.find((e) => e.id === EXPENSE_PENDING);
    if (target) {
      target.status = 'PAYMENT_MARKED';
    }

    const dashboard = await getDashboard();
    expect(dashboard.needsResponseCount).toBe(1);
    expect(dashboard.waitingOnYou).toHaveLength(1);
    expect(dashboard.waitingOnYou[0]).toMatchObject({
      kind: 'expense',
      id: EXPENSE_PENDING,
      status: 'PAYMENT_MARKED',
    });
  });

  it('Needs your response count accurately increments when an unconfirmed settlement claim is sent to user', async () => {
    // Rahul records a settlement paying ME 50.00
    const newSettlementId = '77777777-7777-7777-7777-777777777777';
    dbInstance.tables.settlements?.push({
      id: newSettlementId,
      payer_id: RAHUL,
      receiver_id: ME,
      group_id: null,
      amount: '50.00',
      currency: 'INR',
      status: 'PENDING',
      created_at: new Date().toISOString(),
      confirmed_at: null,
      cleared_expense_ids: [],
    });

    const dashboard = await getDashboard();
    expect(dashboard.needsResponseCount).toBe(1);
    expect(dashboard.waitingOnYou).toHaveLength(1);
    expect(dashboard.waitingOnYou[0]).toMatchObject({
      kind: 'settlement',
      id: newSettlementId,
      status: 'PENDING',
    });
  });

  it('Needs your response count includes incoming friend requests but not outgoing ones', async () => {
    // In fixtures, ME has an outgoing request to Priya.
    // Add an incoming request from Vikram to ME:
    dbInstance.tables.friendships?.push({
      id: '88888888-8888-8888-8888-888888888888',
      requester_id: '44444444-4444-4444-8444-444444444444',
      addressee_id: ME,
      status: 'pending',
      created_at: new Date().toISOString(),
      responded_at: null,
    });

    const dashboard = await getDashboard();
    expect(dashboard.needsResponseCount).toBe(1);
  });

  it('Debtor marking payment paid immediately drops pending friends_owe balance to 0', async () => {
    signInAs(RAHUL);
    const exp = dbInstance.tables.expenses?.find((e) => e.id === EXPENSE_PENDING);
    if (exp) exp.status = 'PAYMENT_MARKED';

    const dashboard = await getDashboard();
    expect(dashboard.totals.friends_owe).toBe(0);
  });

  it('Creditor disputing payment immediately restores debtor pending friends_owe balance', async () => {
    signInAs(RAHUL);
    const exp = dbInstance.tables.expenses?.find((e) => e.id === EXPENSE_PENDING);
    if (exp) exp.status = 'DISPUTED';

    const dashboard = await getDashboard();
    expect(dashboard.totals.friends_owe).toBeGreaterThan(0);
  });

  it('Creditor confirming payment keeps debtor pending friends_owe balance at 0', async () => {
    signInAs(RAHUL);
    const exp = dbInstance.tables.expenses?.find((e) => e.id === EXPENSE_PENDING);
    if (exp) exp.status = 'CONFIRMED';

    const dashboard = await getDashboard();
    expect(dashboard.totals.friends_owe).toBe(0);
  });
});

