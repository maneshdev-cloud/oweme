import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { toMinor } from '@/lib/money';

export type MonthlyTrendPoint = {
  month: string; // e.g. "Apr", "May"
  spentMinor: number;
};

export type PersonalAnalyticsData = {
  spentThisMonthMinor: number;
  spentAllTimeMinor: number;
  receivedThisMonthMinor: number;
  receivedAllTimeMinor: number;
  highestExpense: {
    description: string;
    amountMinor: number;
    category: string;
    date: string;
  } | null;
  topCategory: {
    category: string;
    amountMinor: number;
  } | null;
  monthlyTrend: MonthlyTrendPoint[];
  mostActiveFriend: {
    name: string;
    expenseCount: number;
  } | null; // COUNT ONLY, NEVER LIVE OR HISTORICAL BALANCE
  mostActiveGroup: {
    name: string;
    expenseCount: number;
  } | null; // COUNT ONLY
};

/**
 * Public-facing Recap Card Data
 * HARD PRIVACY RULE:
 * This card must NEVER contain any friend name, any counterparty ID,
 * any balance owed to/by a named person, or any data belonging to anyone
 * other than the card owner.
 */
export type RecapCardData = {
  userName: string;
  username: string;
  periodLabel: string;
  totalTrackedMinor: number;
  expenseCount: number;
  distinctFriendsCount: number; // A number only, never names or IDs
  topCategory: string;
  funStat: string;
};

export const getPersonalAnalytics = cache(async function getPersonalAnalytics(userId: string): Promise<PersonalAnalyticsData> {
  const supabase = await createClient();

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  // Query 1: 1:1 Expenses where user is payer or debtor (excluding cancelled)
  const expensesQuery = supabase
    .from('expenses')
    .select('id, amount, description, category, status, payer_id, debtor_id, created_at')
    .or(`payer_id.eq.${userId},debtor_id.eq.${userId}`)
    .neq('status', 'CANCELLED');

  // Query 2: Confirmed settlements involving user
  const settlementsQuery = supabase
    .from('settlements')
    .select('id, amount, status, payer_id, receiver_id, created_at')
    .or(`payer_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq('status', 'CONFIRMED');

  // Query 3: Groups user belongs to
  const groupsQuery = supabase.from('group_members').select('group_id, groups(id, name)').eq('user_id', userId);

  // Query 4: Group expenses for groups user belongs to
  const groupExpensesQuery = supabase
    .from('group_expenses')
    .select('id, group_id, amount, description, category, status, paid_by, created_at')
    .neq('status', 'CANCELLED');

  const [expensesResult, settlementsResult, groupsResult, groupExpensesResult] = await Promise.all([
    expensesQuery,
    settlementsQuery,
    groupsQuery,
    groupExpensesQuery,
  ]);

  const expenses = expensesResult.data ?? [];
  const settlements = settlementsResult.data ?? [];
  const groupMemberships = groupsResult.data ?? [];
  const groupExpenses = groupExpensesResult.data ?? [];

  // Group name lookup
  const groupNameMap = new Map<string, string>();
  for (const gm of groupMemberships) {
    const g = gm.groups as unknown as { id: string; name: string } | null;
    if (g?.id && g?.name) {
      groupNameMap.set(g.id, g.name);
    }
  }

  let spentThisMonthMinor = 0;
  let spentAllTimeMinor = 0;
  let receivedThisMonthMinor = 0;
  let receivedAllTimeMinor = 0;

  let highestExpense: PersonalAnalyticsData['highestExpense'] = null;
  const categorySpendMap = new Map<string, number>();
  const friendExpenseCounts = new Map<string, number>();
  const groupExpenseCounts = new Map<string, number>();

  // Process 1:1 Expenses
  for (const exp of expenses) {
    const isPayer = exp.payer_id === userId;
    const isDebtor = exp.debtor_id === userId;
    if (!isPayer && !isDebtor) continue;

    const amountMinor = toMinor(exp.amount);
    const expTime = new Date(exp.created_at).getTime();

    // Spend calculation: when you paid for something
    if (isPayer) {
      spentAllTimeMinor += amountMinor;
      if (expTime >= startOfThisMonth) {
        spentThisMonthMinor += amountMinor;
      }
    }

    // Category tracking
    const cat = exp.category ?? 'general';
    const currentCatSpend = categorySpendMap.get(cat) ?? 0;
    categorySpendMap.set(cat, currentCatSpend + amountMinor);

    // Highest expense check
    if (!highestExpense || amountMinor > highestExpense.amountMinor) {
      highestExpense = {
        description: exp.description,
        amountMinor,
        category: cat,
        date: exp.created_at,
      };
    }

    // Track most active friend by EXPENSE COUNT only
    const friendId = isPayer ? exp.debtor_id : exp.payer_id;
    if (friendId) {
      const prevCount = friendExpenseCounts.get(friendId) ?? 0;
      friendExpenseCounts.set(friendId, prevCount + 1);
    }
  }

  // Process Group Expenses
  for (const gexp of groupExpenses) {
    if (!groupNameMap.has(gexp.group_id)) continue;

    const amountMinor = toMinor(gexp.amount);
    const expTime = new Date(gexp.created_at).getTime();

    if (gexp.paid_by === userId) {
      spentAllTimeMinor += amountMinor;
      if (expTime >= startOfThisMonth) {
        spentThisMonthMinor += amountMinor;
      }
    }

    const cat = gexp.category ?? 'general';
    const currentCatSpend = categorySpendMap.get(cat) ?? 0;
    categorySpendMap.set(cat, currentCatSpend + amountMinor);

    if (!highestExpense || amountMinor > highestExpense.amountMinor) {
      highestExpense = {
        description: gexp.description,
        amountMinor,
        category: cat,
        date: gexp.created_at,
      };
    }

    const currentGCount = groupExpenseCounts.get(gexp.group_id) ?? 0;
    groupExpenseCounts.set(gexp.group_id, currentGCount + 1);
  }

  // Process Settlements for received amounts
  for (const s of settlements) {
    if (s.receiver_id === userId) {
      const amountMinor = toMinor(s.amount);
      const sTime = new Date(s.created_at).getTime();
      receivedAllTimeMinor += amountMinor;
      if (sTime >= startOfThisMonth) {
        receivedThisMonthMinor += amountMinor;
      }
    }
  }

  // Monthly trend for the last 6 months (single-pass bucketing O(N))
  const monthlySpendBuckets = new Map<string, number>();
  for (const exp of expenses) {
    if (exp.payer_id === userId) {
      const d = new Date(exp.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthlySpendBuckets.set(key, (monthlySpendBuckets.get(key) ?? 0) + toMinor(exp.amount));
    }
  }
  for (const gexp of groupExpenses) {
    if (gexp.paid_by === userId) {
      const d = new Date(gexp.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthlySpendBuckets.set(key, (monthlySpendBuckets.get(key) ?? 0) + toMinor(gexp.amount));
    }
  }

  const monthlyTrend: MonthlyTrendPoint[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = monthNames[d.getMonth()];
    monthlyTrend.push({ month: label, spentMinor: monthlySpendBuckets.get(key) ?? 0 });
  }

  // Top category
  let topCategory: PersonalAnalyticsData['topCategory'] = null;
  for (const [category, amountMinor] of categorySpendMap.entries()) {
    if (!topCategory || amountMinor > topCategory.amountMinor) {
      topCategory = { category, amountMinor };
    }
  }

  // Most active friend by count (Private only, name looked up for user's own view)
  let mostActiveFriend: PersonalAnalyticsData['mostActiveFriend'] = null;
  let maxFriendCount = 0;
  let topFriendId: string | null = null;
  for (const [friendId, count] of friendExpenseCounts.entries()) {
    if (count > maxFriendCount) {
      maxFriendCount = count;
      topFriendId = friendId;
    }
  }

  if (topFriendId) {
    const { data: friendProfile } = await supabase
      .from('public_profiles')
      .select('full_name')
      .eq('id', topFriendId)
      .maybeSingle();

    if (friendProfile?.full_name) {
      mostActiveFriend = {
        name: friendProfile.full_name,
        expenseCount: maxFriendCount,
      };
    }
  }

  // Most active group by count
  let mostActiveGroup: PersonalAnalyticsData['mostActiveGroup'] = null;
  let maxGroupCount = 0;
  let topGroupId: string | null = null;
  for (const [groupId, count] of groupExpenseCounts.entries()) {
    if (count > maxGroupCount) {
      maxGroupCount = count;
      topGroupId = groupId;
    }
  }
  if (topGroupId) {
    mostActiveGroup = {
      name: groupNameMap.get(topGroupId) ?? 'Group',
      expenseCount: maxGroupCount,
    };
  }

  return {
    spentThisMonthMinor,
    spentAllTimeMinor,
    receivedThisMonthMinor,
    receivedAllTimeMinor,
    highestExpense,
    topCategory,
    monthlyTrend,
    mostActiveFriend,
    mostActiveGroup,
  };
});

/**
 * Public-facing Recap Card
 * Evaluates strictly aggregate, anonymized stats for the current user.
 * ZERO friend names, ZERO counterparties, ZERO balances owed to others.
 */
export const getRecapCardData = cache(async function getRecapCardData(userId: string): Promise<RecapCardData> {
  const supabase = await createClient();

  const [profileResult, expensesResult, groupExpensesResult] = await Promise.all([
    supabase.from('profiles').select('full_name, username').eq('id', userId).maybeSingle(),
    supabase
      .from('expenses')
      .select('id, amount, category, payer_id, debtor_id')
      .or(`payer_id.eq.${userId},debtor_id.eq.${userId}`)
      .neq('status', 'CANCELLED'),
    supabase
      .from('group_expenses')
      .select('id, amount, category, paid_by')
      .eq('paid_by', userId)
      .neq('status', 'CANCELLED'),
  ]);

  const profile = profileResult.data ?? { full_name: 'You', username: 'you' };
  const expenses = expensesResult.data ?? [];
  const groupExpenses = groupExpensesResult.data ?? [];

  const distinctFriends = new Set<string>();
  let totalTrackedMinor = 0;
  let expenseCount = 0;
  const categoryCounts = new Map<string, number>();

  for (const exp of expenses) {
    const isPayer = exp.payer_id === userId;
    const isDebtor = exp.debtor_id === userId;
    if (!isPayer && !isDebtor) continue;

    expenseCount++;
    totalTrackedMinor += toMinor(exp.amount);

    const otherId = isPayer ? exp.debtor_id : exp.payer_id;
    if (otherId) distinctFriends.add(otherId);

    const cat = exp.category ?? 'general';
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }

  for (const gexp of groupExpenses) {
    if (gexp.paid_by === userId) {
      expenseCount++;
      totalTrackedMinor += toMinor(gexp.amount);

      const cat = gexp.category ?? 'general';
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    }
  }

  let topCategory: string = 'general';
  let maxCatCount = 0;
  for (const [cat, count] of categoryCounts.entries()) {
    if (count > maxCatCount) {
      maxCatCount = count;
      topCategory = cat;
    }
  }

  // Fun one-liner based on user's own data
  let funStat = 'Keeping track of every rupee with zero awkwardness.';
  if (topCategory === 'food') {
    funStat = 'The Chai & Biryani champion of the crew ☕';
  } else if (topCategory === 'travel') {
    funStat = 'Always on the road, never losing track of the fare 🚕';
  } else if (topCategory === 'printout') {
    funStat = 'Campus MVP: saving everyone with late-night printouts 📄';
  } else if (expenseCount > 10) {
    funStat = `Master splitter: logged ${expenseCount} expenses cleanly 🎯`;
  }

  return {
    userName: profile.full_name,
    username: profile.username,
    periodLabel: `${new Date().getFullYear()}`,
    totalTrackedMinor,
    expenseCount,
    distinctFriendsCount: distinctFriends.size, // ONLY COUNT!
    topCategory,
    funStat,
  };
});
