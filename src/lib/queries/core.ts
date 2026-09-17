import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { AppSettings, DashboardData, Expense, Person, Profile, SearchResult } from '@/lib/types';

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

export async function getAppSettings(): Promise<AppSettings> {
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
}

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  return (data as Profile | null) ?? null;
}

export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('is_admin');
  return Boolean(data);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('unread_notification_count');
  return (data as number | null) ?? 0;
}

type ExpenseRow = Expense & { payer_id: string; debtor_id: string };

/**
 * The Home screen in one round of queries: totals, per-person balances, the
 * things waiting on *you*, and recent activity.
 */
export async function getDashboard(): Promise<DashboardData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const empty: DashboardData = {
    totals: { currency: 'INR', you_are_owed: 0, you_owe: 0, net: 0 },
    balances: [],
    openExpenses: [],
    waitingOnYou: [],
    recentActivity: [],
    suggestions: [],
    unreadNotifications: 0,
  };
  if (!user) return empty;

  const [totalsResult, balancesResult, expensesResult, suggestionsResult, unreadResult, friendshipsResult] = await Promise.all([
    supabase.rpc('my_totals'),
    supabase.rpc('my_balances'),
    supabase
      .from('expenses')
      .select(
        'id, payer_id, debtor_id, amount, currency, description, category, status, created_by, created_at, updated_at, settled_at',
      )
      .order('created_at', { ascending: false })
      .limit(40),
    supabase.rpc('search_people', { p_query: '', p_limit: 3 }),
    supabase.rpc('unread_notification_count'),
    supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
  ]);

  const totalsRow = (totalsResult.data as Array<{ currency: string; you_are_owed: number; you_owe: number; net: number }> | null)?.[0];
  const balances = (balancesResult.data ?? []) as Array<{ counterparty_id: string; currency: string; balance: number }>;
  const expenses = (expensesResult.data ?? []) as ExpenseRow[];
  const acceptedFriendIds = new Set(
    ((friendshipsResult.data ?? []) as Array<{ requester_id: string; addressee_id: string }>).map((friendship) =>
      friendship.requester_id === user.id ? friendship.addressee_id : friendship.requester_id,
    ),
  );

  // Collect every person we need to render, then fetch their public fields once.
  const ids = new Set<string>();
  balances.forEach((row) => ids.add(row.counterparty_id));
  expenses.forEach((row) => {
    ids.add(row.payer_id);
    ids.add(row.debtor_id);
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
    return {
      ...expense,
      counterparty: people.get(counterpartyId) ?? fallback,
      youArePayer: expense.payer_id === user.id,
    };
  });

  const openExpenses = withCounterparty.filter((expense) =>
    ['PENDING', 'PAYMENT_MARKED', 'DISPUTED'].includes(expense.status),
  );

  // "Waiting on you": you are the creditor and they say they have paid.
  const waitingOnYou = withCounterparty.filter(
    (expense) => expense.youArePayer && expense.status === 'PAYMENT_MARKED',
  );

  return {
    totals: totalsRow
      ? {
          currency: totalsRow.currency,
          you_are_owed: totalsRow.you_are_owed,
          you_owe: totalsRow.you_owe,
          net: totalsRow.net,
        }
      : empty.totals,
    balances: balances
      .map((row) => ({ counterparty: people.get(row.counterparty_id) ?? fallback, currency: row.currency, balance: row.balance }))
      .filter((row) => row.counterparty.id !== 'unknown'),
    openExpenses,
    waitingOnYou,
    recentActivity: withCounterparty.slice(0, 12),
    suggestions: ((suggestionsResult.data ?? []) as SearchResult[]).filter(
      (person) => person.friendship_status !== 'accepted' && !acceptedFriendIds.has(person.id),
    ),
    // Awaiting the rpc builder resolves to the whole response, so read `.data`.
    unreadNotifications: Number((unreadResult as { data?: number | null }).data ?? 0) || 0,
  };
}
