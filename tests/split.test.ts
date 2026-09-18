import { describe, expect, it } from 'vitest';
import { sharesSumToTotal, splitEqually, splitEquallyFromAmount } from '@/lib/split';
import { formatINR, formatINRCompact, parseAmountInput, sanitizeAmountInput, toAmountString, toMinor } from '@/lib/money';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

describe('splitEqually', () => {
  it('splits evenly when it divides cleanly', () => {
    expect(splitEqually(30_000, [A, B, C])).toEqual([
      { userId: A, share: 10_000 },
      { userId: B, share: 10_000 },
      { userId: C, share: 10_000 },
    ]);
  });

  it('hands the leftover paise out deterministically, lowest id first', () => {
    // ₹100 three ways = 33.33 each with 1 paisa left over.
    const shares = splitEqually(10_000, [C, A, B]);

    expect(shares).toEqual([
      { userId: A, share: 3334 },
      { userId: B, share: 3333 },
      { userId: C, share: 3333 },
    ]);
    expect(sharesSumToTotal(shares, 10_000)).toBe(true);
  });

  it('splits ₹0.05 three ways without inventing money', () => {
    const shares = splitEqually(5, [A, B, C]);
    expect(shares).toEqual([
      { userId: A, share: 2 },
      { userId: B, share: 2 },
      { userId: C, share: 1 },
    ]);
    expect(sharesSumToTotal(shares, 5)).toBe(true);
  });

  it('handles a single participant', () => {
    expect(splitEqually(2800, [A])).toEqual([{ userId: A, share: 2800 }]);
  });

  it('ignores duplicate participants instead of double-charging them', () => {
    const shares = splitEqually(3000, [A, B, B, A]);
    expect(shares).toHaveLength(2);
    expect(sharesSumToTotal(shares, 3000)).toBe(true);
  });

  it('returns nothing for an empty participant list', () => {
    expect(splitEqually(1000, [])).toEqual([]);
  });

  it('rejects negative totals', () => {
    expect(() => splitEqually(-100, [A, B])).toThrow(/negative/);
  });

  it('reconciles exactly for every awkward total from 1 paisa to ₹100', () => {
    for (let total = 1; total <= 10_000; total += 7) {
      for (const people of [[A, B], [A, B, C], [A, B, C, A]]) {
        const shares = splitEqually(total, people);
        expect(sharesSumToTotal(shares, total), `total=${total} people=${people.length}`).toBe(true);
        expect(shares.every((share) => share.share >= 0)).toBe(true);
        expect(shares.every((share) => Number.isInteger(share.share))).toBe(true);
      }
    }
  });

  it('accepts Postgres numeric strings straight from the API', () => {
    const shares = splitEquallyFromAmount('300.00', [A, B, C]);
    expect(sharesSumToTotal(shares, 30_000)).toBe(true);
    expect(shares.map((share) => share.share)).toEqual([10_000, 10_000, 10_000]);
  });
});

describe('money', () => {
  it('formats with Indian digit grouping', () => {
    expect(formatINR(125_000_00)).toBe('₹1,25,000.00');
    expect(formatINR(28_00)).toBe('₹28.00');
    expect(formatINR(1_00_00_000_00, { withDecimals: false })).toBe('₹1,00,00,000');
  });

  it('formats negatives the way a student would read them', () => {
    expect(formatINR(-1250_00)).toBe('-₹1,250.00');
  });

  it('compacts big numbers for chips', () => {
    expect(formatINRCompact(28_00)).toBe('₹28');
    expect(formatINRCompact(1500_00)).toBe('₹1.5k');
    expect(formatINRCompact(1_25_000_00)).toBe('₹1.25L');
  });

  it('parses without floating point drift', () => {
    expect(toMinor('0.1') + toMinor('0.2')).toBe(30); // ₹0.30, exactly
    expect(toMinor('1,25,000.50')).toBe(12_500_050);
    expect(toMinor('28')).toBe(2800);
    expect(toMinor(120.5)).toBe(12_050);
    expect(toMinor(null)).toBe(0);
  });

  it('round-trips through the string form Postgres expects', () => {
    expect(toAmountString(12_500_050)).toBe('125000.50');
    expect(toAmountString(5)).toBe('0.05');
    expect(toAmountString(-1250_00)).toBe('-1250.00');
  });

  it('rejects nonsense in the amount field', () => {
    expect(parseAmountInput('12.345')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('₹ 28')).toBe(2800);
    expect(parseAmountInput('1,299.99')).toBe(129_999);
  });

  it('clamps and restricts input to bounds with sanitizeAmountInput', () => {
    // Clamps extreme amounts to ₹5,000 max
    expect(sanitizeAmountInput('5000000000000000')).toBe('5000');
    expect(sanitizeAmountInput('99999')).toBe('5000');
    expect(sanitizeAmountInput('5000')).toBe('5000');
    expect(sanitizeAmountInput('5000.00')).toBe('5000.00');
    // Enforces valid characters and decimals
    expect(sanitizeAmountInput('28.50')).toBe('28.50');
    expect(sanitizeAmountInput('28.509')).toBe('28.50');
    expect(sanitizeAmountInput('abc28.5xyz')).toBe('28.5');
    expect(sanitizeAmountInput('0.1')).toBe('0.1');
    expect(sanitizeAmountInput('0.10')).toBe('0.10');
  });
});
