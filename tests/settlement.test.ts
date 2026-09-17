import { describe, expect, it } from 'vitest';
import {
  computeNetBalances,
  minimizeTransfers,
  settleUp,
  totalIncoming,
  totalOutgoing,
  transfersForUser,
  unsettledRemainder,
  type Balance,
  type Transfer,
} from '@/lib/settlement';

/** Applies a plan and returns the balances it leaves behind. */
function applyTransfers(balances: Balance[], transfers: Transfer[]): Map<string, number> {
  const result = new Map(balances.map((balance) => [balance.userId, balance.amount]));
  for (const transfer of transfers) {
    result.set(transfer.from, (result.get(transfer.from) ?? 0) + transfer.amount);
    result.set(transfer.to, (result.get(transfer.to) ?? 0) - transfer.amount);
  }
  return result;
}

function expectAllSettled(balances: Balance[], transfers: Transfer[]) {
  const after = applyTransfers(balances, transfers);
  for (const [userId, amount] of after) {
    expect(amount, `${userId} should be settled`).toBe(0);
  }
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';

describe('computeNetBalances', () => {
  it('nets several entries per person into one figure', () => {
    const balances = computeNetBalances([
      { userId: A, amount: 5000 },
      { userId: A, amount: -1500 },
      { userId: A, amount: 250 },
      { userId: B, amount: -3750 },
    ]);

    expect(balances).toEqual([
      { userId: A, amount: 3750 },
      { userId: B, amount: -3750 },
    ]);
  });

  it('keeps people whose entries cancel out', () => {
    const balances = computeNetBalances([
      { userId: A, amount: 100 },
      { userId: A, amount: -100 },
    ]);
    expect(balances).toEqual([{ userId: A, amount: 0 }]);
  });

  it('is ordered deterministically by user id', () => {
    const balances = computeNetBalances([
      { userId: D, amount: 1 },
      { userId: B, amount: 2 },
      { userId: A, amount: 3 },
    ]);
    expect(balances.map((balance) => balance.userId)).toEqual([A, B, D]);
  });
});

describe('minimizeTransfers', () => {
  it('handles a simple debtor and creditor', () => {
    const balances: Balance[] = [
      { userId: A, amount: 2800 }, // Manesh paid for Rahul's printout
      { userId: B, amount: -2800 },
    ];
    const transfers = minimizeTransfers(balances);

    expect(transfers).toEqual([{ from: B, to: A, amount: 2800 }]);
    expectAllSettled(balances, transfers);
  });

  it('returns nothing when everyone is already square', () => {
    const balances: Balance[] = [
      { userId: A, amount: 0 },
      { userId: B, amount: 0 },
      { userId: C, amount: 0 },
    ];
    expect(minimizeTransfers(balances)).toEqual([]);
  });

  it('cancels a circular debt chain down to nothing', () => {
    // A owes B ₹100, B owes C ₹100, C owes A ₹100 — a closed loop.
    const balances: Balance[] = [
      { userId: A, amount: 0 },
      { userId: B, amount: 0 },
      { userId: C, amount: 0 },
    ];
    expect(minimizeTransfers(balances)).toEqual([]);

    // …and the same loop expressed as raw entries nets to zero too:
    // A owes B ₹100, B owes C ₹100, C owes A ₹100.
    const netted = computeNetBalances([
      { userId: A, amount: -10_000 }, // A owes B
      { userId: B, amount: 10_000 }, // B is owed by A
      { userId: B, amount: -10_000 }, // B owes C
      { userId: C, amount: 10_000 }, // C is owed by B
      { userId: C, amount: -10_000 }, // C owes A
      { userId: A, amount: 10_000 }, // A is owed by C
    ]);
    expect(netted.every((balance) => balance.amount === 0)).toBe(true);
    expect(minimizeTransfers(netted)).toEqual([]);
  });

  it('handles several creditors and debtors at once', () => {
    const balances: Balance[] = [
      { userId: A, amount: 5000 }, // owed
      { userId: B, amount: 2500 }, // owed
      { userId: C, amount: -4000 }, // owes
      { userId: D, amount: -3500 }, // owes
    ];

    const transfers = minimizeTransfers(balances);

    expectAllSettled(balances, transfers);
    expect(transfers).toHaveLength(3); // n - 1, the minimum possible here
    expect(transfers.every((transfer) => transfer.amount > 0)).toBe(true);
    expect(sum(transfers.map((t) => t.amount))).toBe(7500);
  });

  it('nets two people who owe each other down to a single payment', () => {
    const balances: Balance[] = [
      { userId: A, amount: 600 },
      { userId: B, amount: -600 },
    ];
    const transfers = minimizeTransfers(balances);
    expect(transfers).toEqual([{ from: B, to: A, amount: 600 }]);
    expect(transfers).toHaveLength(1);
  });

  it('is deterministic — same input, same plan', () => {
    const balances: Balance[] = [
      { userId: D, amount: -1000 },
      { userId: B, amount: 1000 },
      { userId: A, amount: -1000 },
      { userId: C, amount: 1000 },
    ];
    const first = minimizeTransfers(balances);
    const second = minimizeTransfers([...balances].reverse());
    expect(first).toEqual(second);
  });

  it('never asks anybody to pay themselves', () => {
    const balances: Balance[] = [
      { userId: A, amount: 1000 },
      { userId: B, amount: -1000 },
      { userId: C, amount: 0 },
    ];
    const transfers = minimizeTransfers(balances);
    expect(transfers.some((transfer) => transfer.from === transfer.to)).toBe(false);
  });

  it('keeps paise exact — never loses or invents a paisa', () => {
    const balances: Balance[] = [
      { userId: A, amount: 3334 },
      { userId: B, amount: 3333 },
      { userId: C, amount: -3333 },
      { userId: D, amount: -3334 },
    ];
    const transfers = minimizeTransfers(balances);
    expectAllSettled(balances, transfers);
    expect(sum(transfers.map((t) => t.amount))).toBe(6667);
    expect(transfers.every((transfer) => Number.isInteger(transfer.amount))).toBe(true);
  });

  it('handles realistic student amounts and big ones', () => {
    const balances: Balance[] = [
      { userId: A, amount: 2800 }, // ₹28 printout
      { userId: B, amount: 125_000_00 }, // ₹1,25,000 project cost
      { userId: C, amount: -125_028_00 },
    ];
    const transfers = minimizeTransfers(balances);
    expectAllSettled(balances, transfers);
  });

  it('holds its invariants over randomised ledgers', () => {
    // A tiny deterministic PRNG so a failure is reproducible.
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const people = [A, B, C, D];
    for (let round = 0; round < 200; round += 1) {
      const balances: Balance[] = people.map((userId) => ({
        userId,
        amount: 0,
      }));

      // Build a closed ledger: every expense adds to one and subtracts another.
      for (let i = 0; i < 1 + Math.floor(random() * 8); i += 1) {
        const payer = Math.floor(random() * people.length);
        let debtor = Math.floor(random() * people.length);
        if (debtor === payer) debtor = (debtor + 1) % people.length;
        const amount = 1 + Math.floor(random() * 50_000);
        balances[payer].amount += amount;
        balances[debtor].amount -= amount;
      }

      const nonZero = balances.filter((balance) => balance.amount !== 0);
      const transfers = settleUp(nonZero);

      expectAllSettled(nonZero, transfers);
      expect(transfers.length).toBeLessThanOrEqual(Math.max(nonZero.length - 1, 0));
      expect(transfers.every((transfer) => transfer.amount > 0)).toBe(true);
      // Money is conserved: what leaves debtors lands on creditors.
      expect(sum(transfers.map((t) => t.amount))).toBe(
        sum(nonZero.filter((b) => b.amount < 0).map((b) => -b.amount)),
      );
    }
  });

  it('refuses to settle a ledger that does not sum to zero', () => {
    expect(() =>
      settleUp([
        { userId: A, amount: 100 },
        { userId: B, amount: -90 },
      ]),
    ).toThrow(/do not sum to zero/);
  });

  it('reports the remainder instead of quietly rounding it away', () => {
    expect(
      unsettledRemainder([
        { userId: A, amount: 100 },
        { userId: B, amount: -90 },
      ]),
    ).toBe(10);
  });
});

describe('per-user helpers', () => {
  const balances: Balance[] = [
    { userId: A, amount: 5000 },
    { userId: B, amount: 2500 },
    { userId: C, amount: -4000 },
    { userId: D, amount: -3500 },
  ];
  const transfers = minimizeTransfers(balances);

  it('lists only the payments a person is involved in', () => {
    for (const userId of [A, B, C, D]) {
      expect(transfersForUser(transfers, userId).every((t) => t.from === userId || t.to === userId)).toBe(true);
    }
  });

  it('totals what a person pays out and receives', () => {
    expect(totalOutgoing(transfers, C) + totalOutgoing(transfers, D)).toBe(7500);
    expect(totalIncoming(transfers, A) + totalIncoming(transfers, B)).toBe(7500);
    expect(totalOutgoing(transfers, A)).toBe(0);
  });
});

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
