import { compareUserIds } from './split';

/**
 * The settlement engine.
 *
 * A pure, dependency-free module: balances in, minimal set of payments out.
 * No I/O, no Supabase, no React — which is exactly what makes it testable and
 * why the tests in tests/settlement.test.ts can cover circular debt, multiple
 * creditors/debtors and zero sums exhaustively.
 *
 * Sign convention (same everywhere in OweMe):
 *   amount > 0  -> this person is OWED money
 *   amount < 0  -> this person OWES money
 * All amounts are integer minor units (paise).
 */

export type Balance = {
  userId: string;
  /** minor units (paise); positive = owed to them, negative = they owe */
  amount: number;
};

export type Transfer = {
  from: string;
  to: string;
  /** minor units (paise), always > 0 */
  amount: number;
};

/**
 * Reduces everyone to a single net figure per person.
 * `entries` is any list of signed deltas (expenses already signed from the
 * perspective of `viewerId`, settlements, etc).
 */
export function computeNetBalances(
  entries: Array<{ userId: string; amount: number }>,
): Balance[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.userId, (totals.get(entry.userId) ?? 0) + Math.round(entry.amount));
  }
  return Array.from(totals.entries())
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => compareUserIds(a.userId, b.userId));
}

/**
 * Minimises the number of payments needed to clear every open balance.
 *
 * Greedy largest-debtor-pays-largest-creditor. Each step zeroes at least one
 * person, so it always produces at most n-1 transfers, and every produced
 * transfer is exact — never a split paisa, never a rounding stub.
 *
 * `epsilon` exists only to absorb a caller that hands us balances which do not
 * quite sum to zero; anything that survives is reported by `unsettledRemainder`
 * rather than silently rounded onto somebody's tab.
 */
export function minimizeTransfers(balances: Balance[], epsilon = 0): Transfer[] {
  const debtors: Balance[] = [];
  const creditors: Balance[] = [];

  for (const balance of balances) {
    const amount = Math.round(balance.amount);
    if (amount < -epsilon) debtors.push({ userId: balance.userId, amount: -amount });
    else if (amount > epsilon) creditors.push({ userId: balance.userId, amount });
  }

  // Deterministic order: biggest first, ties broken by user id.
  const bySize = (a: Balance, b: Balance) =>
    b.amount - a.amount || compareUserIds(a.userId, b.userId);
  debtors.sort(bySize);
  creditors.sort(bySize);

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0) {
      transfers.push({ from: debtor.userId, to: creditor.userId, amount });
      debtor.amount -= amount;
      creditor.amount -= amount;
    }

    if (debtor.amount === 0) d += 1;
    if (creditor.amount === 0) c += 1;
  }

  return transfers;
}

/**
 * Convenience: net balances straight to payments.
 * Throws on input that is not a closed loop, because that always means a bug
 * upstream (an unrecorded settlement) rather than something to paper over.
 */
export function settleUp(balances: Balance[]): Transfer[] {
  const remainder = unsettledRemainder(balances);
  if (remainder !== 0) {
    throw new Error(
      `Balances do not sum to zero (off by ${remainder} paise) — refusing to invent a settlement.`,
    );
  }
  return minimizeTransfers(balances);
}

/** Non-zero here means somebody's numbers are inconsistent (should be impossible). */
export function unsettledRemainder(balances: Balance[]): number {
  return balances.reduce((sum, balance) => sum + Math.round(balance.amount), 0);
}

/**
 * How much one person has to pay / receive in total, for the "Settle up"
 * screen: who pays whom, in the smallest number of taps.
 */
export function transfersForUser(transfers: Transfer[], userId: string): Transfer[] {
  return transfers.filter((transfer) => transfer.from === userId || transfer.to === userId);
}

/** Total that a person is due to pay out under a plan. */
export function totalOutgoing(transfers: Transfer[], userId: string): number {
  return transfers
    .filter((transfer) => transfer.from === userId)
    .reduce((sum, transfer) => sum + transfer.amount, 0);
}

export function totalIncoming(transfers: Transfer[], userId: string): number {
  return transfers
    .filter((transfer) => transfer.to === userId)
    .reduce((sum, transfer) => sum + transfer.amount, 0);
}
