import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type UsageDataPoint = {
  label: string; // e.g. "3w ago", "2w ago", "1w ago", "This week"
  signups: number;
  expenses: number;
};

export type AdoptionSignals = {
  groups: {
    total: number;
    withThreePlusMembers: number;
    withOneOrTwoMembers: number;
    empty: number;
  };
  settlements: {
    total: number;
    confirmed: number;
    disputed: number;
    pendingOrUnconfirmed: number;
  };
  usersUsedSettleUp: number;
  activeUsers7d: number;
  totalUsers: number;
};

export type AdminUpgradeData = {
  usageOverTime: UsageDataPoint[];
  adoption: AdoptionSignals;
};

export async function getAdminUpgradeData(): Promise<AdminUpgradeData> {
  const { createServiceClient } = await import('@/lib/supabase/server');
  const service = createServiceClient();
  const supabase = service ?? (await createClient());

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    profilesResult,
    expensesResult,
    groupsResult,
    groupMembersResult,
    settlementsResult,
    eventsResult,
  ] = await Promise.all([
    supabase.from('profiles').select('id, created_at'),
    supabase.from('expenses').select('id, status, created_at, payer_id, debtor_id'),
    supabase.from('groups').select('id, created_at'),
    supabase.from('group_members').select('group_id, user_id'),
    supabase.from('settlements').select('id, status, payer_id, receiver_id, created_at'),
    supabase
      .from('expense_events')
      .select('actor_id, created_at')
      .gte('created_at', sevenDaysAgo.toISOString()),
  ]);

  const profiles = profilesResult.data ?? [];
  const expenses = (expensesResult.data ?? []) as Array<{
    id: string;
    status: string;
    created_at: string;
    payer_id?: string;
    debtor_id?: string;
  }>;
  const groups = groupsResult.data ?? [];
  const members = groupMembersResult.data ?? [];
  const settlements = settlementsResult.data ?? [];
  const events = eventsResult.data ?? [];

  // 1. Active Users (last 7 days): users who triggered an event or transacted in last 7 days
  const activeUserIds = new Set<string>();
  for (const e of events) {
    if (e.actor_id) activeUserIds.add(e.actor_id);
  }
  for (const exp of expenses) {
    if (new Date(exp.created_at) >= sevenDaysAgo) {
      if (exp.payer_id) activeUserIds.add(exp.payer_id);
      if (exp.debtor_id) activeUserIds.add(exp.debtor_id);
    }
  }
  const activeUsers7d = activeUserIds.size;
  const totalUsers = profiles.length;

  // 2. Feature Adoption: Groups
  const memberCountByGroup = new Map<string, number>();
  for (const g of groups) {
    memberCountByGroup.set(g.id, 0);
  }
  for (const m of members) {
    const current = memberCountByGroup.get(m.group_id) ?? 0;
    memberCountByGroup.set(m.group_id, current + 1);
  }

  let withThreePlusMembers = 0;
  let withOneOrTwoMembers = 0;
  let empty = 0;
  for (const count of memberCountByGroup.values()) {
    if (count >= 3) withThreePlusMembers++;
    else if (count >= 1) withOneOrTwoMembers++;
    else empty++;
  }

  // 3. Feature Adoption: Settlements
  let confirmed = 0;
  let disputed = 0;
  let pendingOrUnconfirmed = 0;
  const settleUpUsers = new Set<string>();

  for (const s of settlements) {
    if (s.status === 'CONFIRMED') confirmed++;
    else if (s.status === 'DISPUTED') disputed++;
    else pendingOrUnconfirmed++;

    if (s.payer_id) settleUpUsers.add(s.payer_id);
    if (s.receiver_id) settleUpUsers.add(s.receiver_id);
  }

  // 4. Usage Over Time (last 4 weeks)
  const usageBuckets: Array<{ label: string; start: number; end: number; signups: number; expenses: number }> = [];
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  for (let i = 3; i >= 0; i--) {
    const start = now.getTime() - (i + 1) * oneWeekMs;
    const end = now.getTime() - i * oneWeekMs;
    const label = i === 0 ? 'This week' : `${i}w ago`;
    usageBuckets.push({ label, start, end, signups: 0, expenses: 0 });
  }

  for (const p of profiles) {
    const t = new Date(p.created_at).getTime();
    for (const b of usageBuckets) {
      if (t >= b.start && t < b.end) {
        b.signups++;
        break;
      }
    }
  }

  for (const exp of expenses) {
    const t = new Date(exp.created_at).getTime();
    for (const b of usageBuckets) {
      if (t >= b.start && t < b.end) {
        b.expenses++;
        break;
      }
    }
  }

  const usageOverTime: UsageDataPoint[] = usageBuckets.map((b) => ({
    label: b.label,
    signups: b.signups,
    expenses: b.expenses,
  }));

  return {
    usageOverTime,
    adoption: {
      groups: {
        total: groups.length,
        withThreePlusMembers,
        withOneOrTwoMembers,
        empty,
      },
      settlements: {
        total: settlements.length,
        confirmed,
        disputed,
        pendingOrUnconfirmed,
      },
      usersUsedSettleUp: settleUpUsers.size,
      activeUsers7d,
      totalUsers,
    },
  };
}
