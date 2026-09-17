import { toMinor } from './money';

/**
 * Equal splits, done so they always reconcile exactly.
 *
 * This mirrors the SQL function `public.split_equally()` byte for byte:
 * work in minor units, floor-divide, and hand the leftover paise to the
 * participants with the lowest user ids. That makes the split deterministic
 * (same inputs -> same shares, on client and server) and guarantees the shares
 * sum to exactly the total — the database rejects anything else.
 */

export type Share = {
  userId: string;
  /** minor units (paise) */
  share: number;
};

/** Deterministic ordering that matches Postgres uuid comparison. */
export function compareUserIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function splitEqually(totalMinor: number, userIds: string[]): Share[] {
  const unique = Array.from(new Set(userIds)).sort(compareUserIds);
  if (unique.length === 0) return [];
  const total = Math.round(totalMinor);
  if (total < 0) throw new Error('Cannot split a negative amount');

  const count = unique.length;
  const base = Math.floor(total / count);
  const remainder = total - base * count; // 0..count-1 paise left over

  return unique.map((userId, index) => ({
    userId,
    share: base + (index < remainder ? 1 : 0),
  }));
}

/** Convenience wrapper for values that arrive as Postgres numeric strings. */
export function splitEquallyFromAmount(amount: number | string, userIds: string[]): Share[] {
  return splitEqually(toMinor(amount), userIds);
}

export function sharesSumToTotal(shares: Share[], totalMinor: number): boolean {
  return shares.reduce((sum, share) => sum + share.share, 0) === Math.round(totalMinor);
}
