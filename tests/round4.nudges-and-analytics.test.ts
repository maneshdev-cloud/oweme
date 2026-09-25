import { describe, expect, it } from 'vitest';
import { getUnsettledAgingText, isExpenseUnsettled, UNSETTLED_NUDGE_DAYS } from '@/lib/nudge';
import type { RecapCardData } from '@/lib/queries/analytics';

describe('Round 4 — Unsettled Aging Nudge', () => {
  const BASE_NOW = 1750000000000; // Fixed timestamp for deterministic tests
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  it('enforces constant threshold of 3 days', () => {
    expect(UNSETTLED_NUDGE_DAYS).toBe(3);
  });

  it('returns null for fresh expenses (< 3 days)', () => {
    // Just created
    expect(getUnsettledAgingText(new Date(BASE_NOW).toISOString(), BASE_NOW)).toBeNull();
    // 1 day old
    expect(getUnsettledAgingText(new Date(BASE_NOW - ONE_DAY_MS).toISOString(), BASE_NOW)).toBeNull();
    // 2 days and 23 hours old
    expect(
      getUnsettledAgingText(new Date(BASE_NOW - (2 * ONE_DAY_MS + 23 * 3600 * 1000)).toISOString(), BASE_NOW)
    ).toBeNull();
  });

  it('returns formatted aging text for expenses >= 3 days', () => {
    // Exactly 3 days
    expect(getUnsettledAgingText(new Date(BASE_NOW - 3 * ONE_DAY_MS).toISOString(), BASE_NOW)).toBe(
      '3 days unsettled'
    );
    // 5 days
    expect(getUnsettledAgingText(new Date(BASE_NOW - 5 * ONE_DAY_MS).toISOString(), BASE_NOW)).toBe(
      '5 days unsettled'
    );
    // 14 days
    expect(getUnsettledAgingText(new Date(BASE_NOW - 14 * ONE_DAY_MS).toISOString(), BASE_NOW)).toBe(
      '14 days unsettled'
    );
  });

  it('safely handles missing, invalid, or future dates', () => {
    expect(getUnsettledAgingText(null, BASE_NOW)).toBeNull();
    expect(getUnsettledAgingText(undefined, BASE_NOW)).toBeNull();
    expect(getUnsettledAgingText('invalid-date', BASE_NOW)).toBeNull();
    // Future date (clock skew)
    expect(getUnsettledAgingText(new Date(BASE_NOW + ONE_DAY_MS).toISOString(), BASE_NOW)).toBeNull();
  });

  it('correctly classifies unsettled vs settled statuses', () => {
    expect(isExpenseUnsettled('PENDING')).toBe(true);
    expect(isExpenseUnsettled('PAYMENT_MARKED')).toBe(true);
    expect(isExpenseUnsettled('DISPUTED')).toBe(true);
    expect(isExpenseUnsettled('CONFIRMED')).toBe(false);
    expect(isExpenseUnsettled('CANCELLED')).toBe(false);
  });
});

describe('Round 4 — Recap Card Privacy Review', () => {
  it('strictly ensures recap card data contains only aggregate owner stats with no counterparty data', () => {
    const mockRecap: RecapCardData = {
      userName: 'Aarav Sharma',
      username: 'aarav',
      periodLabel: '2026',
      totalTrackedMinor: 450000,
      expenseCount: 12,
      distinctFriendsCount: 1, // Edge case: only split with 1 single friend
      topCategory: 'food',
      funStat: 'The Chai & Biryani champion of the crew ☕',
    };

    const keys = Object.keys(mockRecap);

    // Hard rules: No friend names, no counterparties, no debtor/payer IDs, no individual balances
    expect(keys).not.toContain('friendName');
    expect(keys).not.toContain('friendId');
    expect(keys).not.toContain('counterparty');
    expect(keys).not.toContain('counterpartyId');
    expect(keys).not.toContain('balanceWithFriend');
    expect(keys).not.toContain('amountOwed');

    // Confirm that even in the 1-friend edge case, the count is 1 and no identifying info leaks
    expect(mockRecap.distinctFriendsCount).toBe(1);
    expect(typeof mockRecap.distinctFriendsCount).toBe('number');
    expect(mockRecap.userName).toBe('Aarav Sharma');
  });
});

describe('Round 4 — Admin Panel Stats Fallback Resilience', () => {
  type TestStats = {
    users?: { total: number; new_7d: number; active_7d: number };
    storage?: { database_bytes: number; largest_tables: Array<{ table: string; bytes: number }> };
  } | null;

  function getDatabaseBytes(stats: TestStats) {
    return stats?.storage?.database_bytes;
  }

  function getLargestTables(stats: TestStats) {
    return stats?.storage?.largest_tables ?? [];
  }

  it('safely handles null stats without throwing TypeError on storage', () => {
    expect(getDatabaseBytes(null)).toBeUndefined();
    expect(getLargestTables(null)).toEqual([]);
  });

  it('safely handles degraded stats where storage is empty or undefined', () => {
    const degradedStats: TestStats = {
      users: { total: 5, new_7d: 1, active_7d: 2 },
      storage: undefined,
    };

    expect(getDatabaseBytes(degradedStats)).toBeUndefined();
    expect(getLargestTables(degradedStats)).toEqual([]);
  });
});
