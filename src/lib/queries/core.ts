import 'server-only';

import { cache } from 'react';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import type { AppSettings, DashboardData, DashboardWaitingItem, Expense, Person, Profile } from '@/lib/types';

/**
 * Read helpers used by Server Components.
 *
 * Everything here runs through the caller's session, so RLS decides what comes
 * back. If a query is missing a row the user should not be able to see, the
 * screen shows an empty state rather than an error — the important part is that
 * the row never leaves the database.
 */

export const DEFAULT_SETTINGS: AppSettings = {
  maintenance_mode: false,
  registrations_enabled: true,
  expense_creation_enabled: true,
  read_only_mode: false,
  announcement_banner: null,
  feature_flags: { push_notifications: true, history_export: true, groups: true },
  retention_days: 365,
  archive_purge_days: 90,
  archive_notice_days: 30,
};

export const getAppSettings = cache(async function getAppSettings(): Promise<AppSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from('app_settings').select('key, value');
  if (!data) return DEFAULT_SETTINGS;

  const settings = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const row of data as Array<{ key: string; value: unknown }>) {
    if (row.value !== null && row.value !== undefined && row.key in settings) {
      settings[row.key] = row.value;
    }
    if (row.key === 'announcement_banner') {
      settings.announcement_banner = row.value ?? null;
    }
  }
  return settings as unknown as AppSettings;
});

export const getMyProfile = cache(async function getMyProfile(): Promise<Profile | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  return (data as Profile | null) ?? null;
});

export const isAdmin = cache(async function isAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;

  const email = user.email?.toLowerCase();
  if (email === 'maneshjadhavofficial@gmail.com') {
    return true;
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc('is_admin');
  if (data) return true;

  // Also verify against admin_authorized_emails table using service client
  const { createServiceClient } = await import('@/lib/supabase/server');
  const service = createServiceClient();
  if (service && email) {
    const { data: authRow } = await service
      .from('admin_authorized_emails')
      .select('email')
      .eq('email', email)
      .maybeSingle();
    if (authRow) {
      await service
        .from('admin_users')
        .upsert({ user_id: user.id, note: 'authorized admin' }, { onConflict: 'user_id' });
      return true;
    }
  }

  return false;
});

export const getUnreadNotificationCount = cache(async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('unread_notification_count');
  return (data as number | null) ?? 0;
});

type ExpenseRow = Expense & { payer_id: string; debtor_id: string };

/**
 * The Home screen in one round of queries: totals, per-person balances, the
 * things waiting on *you*, and recent activity.
 */
export const getDashboard = cache(async (): Promise<DashboardData> => {
  const supabase = await createClient();
  const user = await getSessionUser();

  const empty: DashboardData = {
    totals: {
      currency: 'INR',
      you_are_owed: 0,
      you_owe: 0,
      net: 0,
      friends_owed: 0,
      friends_owe: 0,
      groups_owed: 0,
      groups_owe: 0,
    },
    balances: [],
    openExpenses: [],
    waitingOnYou: [],
    needsResponseCount: 0,
    recentActivity: [],
    suggestions: [],
    unreadNotifications: 0,
  };
  if (!user) return empty;

  const [
    totalsResult,
    balancesResult,
    expensesResult,
    unreadCount,
    groupsResult,
    pendingSettlementsResult,
    incomingRequestsResult,
    paymentMarkedExpensesResult,
    myPaidMarkedResult,
  ] = await Promise.all([
    supabase.rpc('my_totals'),
    supabase.rpc('my_balances'),
    supabase
      .from('expenses')
      .select(
        'id, payer_id, debtor_id, amount, currency, description, category, status, created_by, created_at, updated_at, settled_at',
      )
      .or(`payer_id.eq.${user.id},debtor_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(40),
    getUnreadNotificationCount(),
    supabase.rpc('my_group_summaries'),

    supabase
      .from('settlements')
      .select('id, group_id, payer_id, receiver_id, amount, currency, status, created_at')
      .is('group_id', null)
      .or(`payer_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('friendships')
      .select('id, requester_id, addressee_id')
      .eq('addressee_id', user.id)
      .eq('status', 'pending'),
    supabase
      .from('expenses')
      .select(
        'id, payer_id, debtor_id, amount, currency, description, category, status, created_by, created_at, updated_at, settled_at',
      )
      .eq('payer_id', user.id)
      .eq('status', 'PAYMENT_MARKED'),
    supabase
      .from('expenses')
      .select('id, payer_id, debtor_id, amount, currency, status')
      .eq('debtor_id', user.id)
      .eq('status', 'PAYMENT_MARKED'),
  ]);

  const totalsRow = (totalsResult.data as Array<{ currency: string; you_are_owed: number; you_owe: number; net: number }> | null)?.[0];
  const balances = (balancesResult.data ?? []) as Array<{ counterparty_id: string; currency: string; balance: number }>;
  const expenses = (expensesResult.data ?? []) as ExpenseRow[];
  const groupRows = (groupsResult.data ?? []) as Array<{ my_net: number }>;
  const allUserSettlements = (pendingSettlementsResult.data ?? []) as Array<{
    id: string;
    group_id: string | null;
    payer_id: string;
    receiver_id: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
  }>;
  const pendingSettlements = allUserSettlements.filter(
    (s) => s.receiver_id === user.id && s.status === 'PENDING',
  );
  const incomingFriendRequests = (incomingRequestsResult.data ?? []) as Array<{ id: string; requester_id: string }>;
  const paymentMarkedExpenses = (paymentMarkedExpensesResult.data ?? []) as ExpenseRow[];
  const myPaidMarkedExpenses = (myPaidMarkedResult?.data ?? []) as Array<{ id: string; payer_id: string; amount: number }>;
  const myPendingDirectSettlements = allUserSettlements.filter(
    (s) => s.payer_id === user.id && s.status === 'PENDING',
  );

  // Compute Friends subtotals
  const rawFriendsOwed = totalsRow ? Math.round(Number(totalsRow.you_are_owed) * 100) / 100 : 0;
  const rawFriendsOwe = totalsRow ? Math.round(Number(totalsRow.you_owe) * 100) / 100 : 0;

  // When debtor marks payment ("I've Paid"), deduct that amount from debtor's pending "money to give"
  let markedPaidDeduction = 0;
  for (const exp of myPaidMarkedExpenses) {
    markedPaidDeduction += Number(exp.amount);
  }
  for (const set of myPendingDirectSettlements) {
    markedPaidDeduction += Number(set.amount);
  }

  const friends_owed = rawFriendsOwed;
  const friends_owe = Math.max(0, Math.round((rawFriendsOwe - markedPaidDeduction) * 100) / 100);

  // Compute Groups subtotals from group summaries
  let rawGroupsOwed = 0;
  let rawGroupsOwe = 0;
  for (const g of groupRows) {
    const net = Number(g.my_net);
    if (net > 0) rawGroupsOwed += net;
    else if (net < 0) rawGroupsOwe += Math.abs(net);
  }
  const groups_owed = Math.round(rawGroupsOwed * 100) / 100;
  const groups_owe = Math.round(rawGroupsOwe * 100) / 100;

  // Exact sums
  const you_are_owed = Math.round((friends_owed + groups_owed) * 100) / 100;
  const you_owe = Math.round((friends_owe + groups_owe) * 100) / 100;
  const net = Math.round((you_are_owed - you_owe) * 100) / 100;

  // Adjust per-person balances if debtor marked payment towards them
  const adjustedBalancesMap = new Map<string, number>();
  for (const b of balances) {
    adjustedBalancesMap.set(b.counterparty_id, Number(b.balance));
  }
  for (const exp of myPaidMarkedExpenses) {
    const curr = adjustedBalancesMap.get(exp.payer_id) ?? 0;
    if (curr < 0) {
      adjustedBalancesMap.set(exp.payer_id, Math.min(0, curr + Number(exp.amount)));
    }
  }
  for (const set of myPendingDirectSettlements) {
    const curr = adjustedBalancesMap.get(set.receiver_id) ?? 0;
    if (curr < 0) {
      adjustedBalancesMap.set(set.receiver_id, Math.min(0, curr + Number(set.amount)));
    }
  }

  const adjustedBalances = Array.from(adjustedBalancesMap.entries())
    .map(([cpId, balance]) => ({
      counterparty_id: cpId,
      currency: 'INR',
      balance: Math.round(balance * 100) / 100,
    }))
    .filter((b) => b.balance !== 0);

  // Collect every person we need to render, then fetch their public fields once.
  const ids = new Set<string>();
  balances.forEach((row) => ids.add(row.counterparty_id));
  myPaidMarkedExpenses.forEach((row) => ids.add(row.payer_id));
  expenses.forEach((row) => {
    ids.add(row.payer_id);
    ids.add(row.debtor_id);
  });
  paymentMarkedExpenses.forEach((row) => {
    ids.add(row.debtor_id);
  });
  allUserSettlements.forEach((row) => {
    ids.add(row.payer_id);
    ids.add(row.receiver_id);
  });

  let people = new Map<string, Person>();
  if (ids.size > 0) {
    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, full_name, username, avatar_url')
      .in('id', Array.from(ids));
    people = new Map((profiles as Person[] | null)?.map((person) => [person.id, person]) ?? []);
  }

  const fallback: Person = { id: 'unknown', full_name: 'Someone', username: 'someone', avatar_url: null };
  const withCounterparty = expenses.map((expense) => {
    const counterpartyId = expense.payer_id === user.id ? expense.debtor_id : expense.payer_id;

    // Single unified status matching getExpenseDetail
    let unifiedStatus = expense.status;
    if (expense.status === 'CANCELLED') {
      unifiedStatus = 'CANCELLED';
    } else {
      const match = allUserSettlements.find(
        (s) =>
          !s.group_id &&
          s.status !== 'CANCELLED' &&
          ((s.payer_id === expense.payer_id && s.receiver_id === expense.debtor_id) ||
            (s.payer_id === expense.debtor_id && s.receiver_id === expense.payer_id)),
      );
      if (match) {
        if (match.status === 'CONFIRMED' || expense.status === 'CONFIRMED') {
          unifiedStatus = 'CONFIRMED';
        } else if (match.status === 'PENDING' || expense.status === 'PAYMENT_MARKED') {
          unifiedStatus = 'PAYMENT_MARKED';
        } else if (match.status === 'DISPUTED' || expense.status === 'DISPUTED') {
          unifiedStatus = 'DISPUTED';
        }
      }
    }

    return {
      ...expense,
      status: unifiedStatus,
      counterparty: people.get(counterpartyId) ?? fallback,
      youArePayer: expense.payer_id === user.id,
    };
  });

  const openExpenses = withCounterparty.filter((expense) =>
    ['PENDING', 'PAYMENT_MARKED', 'DISPUTED'].includes(expense.status),
  );

  // Items waiting for confirmation: payment-marked 1:1 expenses + pending settlements
  const waitingExpenses: DashboardWaitingItem[] = paymentMarkedExpenses.map((expense) => ({
    kind: 'expense',
    id: expense.id,
    amount: Number(expense.amount),
    currency: expense.currency,
    description: expense.description,
    status: expense.status,
    counterparty: people.get(expense.debtor_id) ?? fallback,
    created_at: expense.created_at,
  }));

  const waitingSettlements: DashboardWaitingItem[] = pendingSettlements.map((settlement) => ({
    kind: 'settlement',
    id: settlement.id,
    amount: Number(settlement.amount),
    currency: settlement.currency,
    description: 'Settlement payment',
    status: (settlement.status as unknown) as DashboardWaitingItem['status'],
    counterparty: people.get(settlement.payer_id) ?? fallback,
    created_at: settlement.created_at,
  }));

  const waitingOnYou: DashboardWaitingItem[] = [...waitingExpenses, ...waitingSettlements].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // Total count of items that genuinely need the user's response:
  // - payment-marked expenses where user is creditor
  // - pending settlements where user is receiver
  // - pending incoming friend requests
  const needsResponseCount = waitingExpenses.length + waitingSettlements.length + incomingFriendRequests.length;

  return {
    totals: {
      currency: totalsRow?.currency ?? 'INR',
      you_are_owed,
      you_owe,
      net,
      friends_owed,
      friends_owe,
      groups_owed,
      groups_owe,
    },
    balances: adjustedBalances
      .map((row) => ({ counterparty: people.get(row.counterparty_id) ?? fallback, currency: row.currency, balance: row.balance }))
      .filter((row) => row.counterparty.id !== 'unknown'),
    openExpenses,
    waitingOnYou,
    needsResponseCount,
    recentActivity: withCounterparty.slice(0, 12),
    suggestions: [],
    unreadNotifications: unreadCount,
  };
});
