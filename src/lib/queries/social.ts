import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type {
  ExpenseEvent,
  Expense,
  FriendRow,
  GroupBalanceRow,
  GroupExpense,
  GroupMemberRow,
  GroupSummary,
  Notification,
  PendingRequest,
  Person,
  Settlement,
} from '@/lib/types';

const UNKNOWN: Person = { id: 'unknown', full_name: 'Someone', username: 'someone', avatar_url: null };

async function profilesFor(ids: string[]): Promise<Map<string, Person>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from('public_profiles')
    .select('id, full_name, username, avatar_url')
    .in('id', Array.from(new Set(ids)));
  return new Map((data as Person[] | null)?.map((person) => [person.id, person]) ?? []);
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

export async function getFriends(): Promise<FriendRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_friends');
  if (error || !data) return [];
  const rows = data as FriendRow[];
  if (rows.length > 0 && rows[0].nickname === undefined) {
    const { data: nicks } = await supabase.from('friend_nicknames').select('friend_id, nickname');
    if (nicks && nicks.length > 0) {
      const map = new Map(nicks.map((n) => [n.friend_id, n.nickname as string]));
      return rows.map((r) => ({ ...r, nickname: map.get(r.friend_id) ?? null }));
    }
  }
  return rows;
}

export async function getFriendRequests(): Promise<PendingRequest[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Array<{
    id: string;
    requester_id: string;
    addressee_id: string;
    created_at: string;
  }>;
  const people = await profilesFor(rows.map((row) => (row.requester_id === user.id ? row.addressee_id : row.requester_id)));

  return rows.map((row) => {
    const fromMe = row.requester_id === user.id;
    const otherId = fromMe ? row.addressee_id : row.requester_id;
    return {
      friendship_id: row.id,
      person: people.get(otherId) ?? UNKNOWN,
      direction: fromMe ? 'outgoing' : 'incoming',
      created_at: row.created_at,
    };
  });
}

export async function searchPeople(query: string): Promise<Person[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('search_people', { p_query: query, p_limit: 20 });
  return (data ?? []) as Person[];
}

// ---------------------------------------------------------------------------
// 1:1 expenses
// ---------------------------------------------------------------------------

export async function getExpenseDetail(expenseId: string): Promise<{
  expense: Expense;
  payer: Person;
  debtor: Person;
  events: Array<ExpenseEvent & { actor: Person | null }>;
  settlement: Settlement | null;
} | null> {
  const supabase = await createClient();

  const { data: expense } = await supabase.from('expenses').select('*').eq('id', expenseId).maybeSingle();
  if (!expense) return null;

  const typed = expense as Expense;
  const [people, eventsResult, settlementResult] = await Promise.all([
    profilesFor([typed.payer_id, typed.debtor_id]),
    supabase
      .from('expense_events')
      .select('id, expense_id, actor_id, event_type, from_status, to_status, metadata, created_at')
      .eq('expense_id', expenseId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    supabase
      .from('settlements')
      .select('*')
      .is('group_id', null)
      .eq('status', 'CONFIRMED')
      .or(
        `and(payer_id.eq.${typed.debtor_id},receiver_id.eq.${typed.payer_id}),and(payer_id.eq.${typed.payer_id},receiver_id.eq.${typed.debtor_id})`,
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const events = ((eventsResult.data ?? []) as ExpenseEvent[]).map((event) => ({
    ...event,
    actor: event.actor_id ? people.get(event.actor_id) ?? null : null,
  }));

  return {
    expense: typed,
    payer: people.get(typed.payer_id) ?? UNKNOWN,
    debtor: people.get(typed.debtor_id) ?? UNKNOWN,
    events,
    settlement: (settlementResult.data as Settlement | null) ?? null,
  };
}

export async function getSettlementDetail(settlementId: string): Promise<{
  settlement: Settlement;
  payer: Person;
  receiver: Person;
  groupName: string | null;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('settlements').select('*').eq('id', settlementId).maybeSingle();
  if (!data) return null;

  const settlement = data as Settlement;
  const people = await profilesFor([settlement.payer_id, settlement.receiver_id]);

  let groupName: string | null = null;
  if (settlement.group_id) {
    const { data: group } = await supabase.from('groups').select('name').eq('id', settlement.group_id).maybeSingle();
    groupName = (group as { name: string } | null)?.name ?? null;
  }

  return {
    settlement,
    payer: people.get(settlement.payer_id) ?? UNKNOWN,
    receiver: people.get(settlement.receiver_id) ?? UNKNOWN,
    groupName,
  };
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function getGroups(): Promise<GroupSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_group_summaries');
  return (data ?? []) as GroupSummary[];
}

export async function getGroupDetail(groupId: string): Promise<{
  group: { id: string; name: string; description: string | null; currency: string; created_by: string };
  members: GroupMemberRow[];
  expenses: GroupExpense[];
  settlements: Settlement[];
  balances: GroupBalanceRow[];
} | null> {
  const supabase = await createClient();

  const { data: group } = await supabase
    .from('groups')
    .select('id, name, description, currency, created_by')
    .eq('id', groupId)
    .maybeSingle();
  if (!group) return null;

  const [membersResult, balancesResult, expensesResult, settlementsResult] = await Promise.all([
    supabase.from('group_members').select('user_id, role').eq('group_id', groupId),
    supabase.rpc('group_balances_for', { p_group: groupId }),
    supabase
      .from('group_expenses')
      .select('*, group_expense_shares(user_id, share_amount), group_expense_payers(user_id, paid_amount)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),
    supabase.from('settlements').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
  ]);

  const memberRows = (membersResult.data ?? []) as Array<{ user_id: string; role: 'owner' | 'member' }>;
  const balances = (balancesResult.data ?? []) as GroupBalanceRow[];
  const people = await profilesFor(memberRows.map((row) => row.user_id));
  const balanceByUser = new Map(balances.map((row) => [row.user_id, row]));

  const expenses = (
    (expensesResult.data ?? []) as Array<
      GroupExpense & {
        group_expense_shares?: GroupExpense['shares'];
        group_expense_payers?: Array<{ user_id: string; paid_amount: number }>;
      }
    >
  ).map((row) => ({
    ...row,
    shares: row.group_expense_shares ?? [],
    payers:
      row.group_expense_payers && row.group_expense_payers.length > 0
        ? row.group_expense_payers
        : [{ user_id: row.paid_by, paid_amount: row.amount }],
  }));

  return {
    group: group as { id: string; name: string; description: string | null; currency: string; created_by: string },
    members: memberRows.map((row) => {
      const balance = balanceByUser.get(row.user_id);
      return {
        user_id: row.user_id,
        role: row.role,
        profile: people.get(row.user_id) ?? UNKNOWN,
        paid: balance?.paid ?? 0,
        share: balance?.share ?? 0,
        settled_out: balance?.settled_out ?? 0,
        settled_in: balance?.settled_in ?? 0,
        net: balance?.net ?? 0,
      };
    }),
    expenses,
    settlements: (settlementsResult.data ?? []) as Settlement[],
    balances,
  };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function getNotifications(limit = 50): Promise<Notification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('notifications')
    .select(
      'id, type, title, body, deep_link, related_expense_id, related_group_id, related_user_id, related_settlement_id, is_read, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as Notification[];
}

/**
 * A stale deep link (the expense was archived, or belongs to a group you left)
 * must not dead-end the user, so the notification screen checks the link still
 * resolves before rendering it as tappable.
 */
export async function filterResolvableNotifications(notifications: Notification[]): Promise<
  Array<Notification & { resolvable: boolean }>
> {
  const supabase = await createClient();
  if (notifications.length === 0) return [];

  const expenseIds = notifications.map((n) => n.related_expense_id).filter((id): id is string => Boolean(id));
  const groupIds = notifications.map((n) => n.related_group_id).filter((id): id is string => Boolean(id));
  const settlementIds = notifications.map((n) => n.related_settlement_id).filter((id): id is string => Boolean(id));

  const [expenses, groups, settlements] = await Promise.all([
    expenseIds.length
      ? supabase.from('expenses').select('id').in('id', expenseIds)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
    groupIds.length
      ? supabase.from('groups').select('id').in('id', groupIds)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
    settlementIds.length
      ? supabase.from('settlements').select('id').in('id', settlementIds)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
  ]);

  const liveExpenses = new Set((expenses.data ?? []).map((row) => row.id));
  const liveGroups = new Set((groups.data ?? []).map((row) => row.id));
  const liveSettlements = new Set((settlements.data ?? []).map((row) => row.id));

  return notifications.map((notification) => {
    let resolvable = true;
    if (notification.related_expense_id) resolvable = liveExpenses.has(notification.related_expense_id);
    else if (notification.related_settlement_id) resolvable = liveSettlements.has(notification.related_settlement_id);
    else if (notification.related_group_id) resolvable = liveGroups.has(notification.related_group_id);
    return { ...notification, resolvable };
  });
}
