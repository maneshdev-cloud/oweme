import { describe, expect, it } from 'vitest';
import { splitEqually } from '@/lib/split';
import { minimizeTransfers, type Balance } from '@/lib/settlement';
import { toMinor } from '@/lib/money';
import { createGroupExpenseSchema } from '@/lib/validation';

describe('Group Expense Flow Modes', () => {
  const YOU = '11111111-1111-4111-8111-111111111111';
  const ALICE = '22222222-2222-4222-8222-222222222222';
  const BOB = '33333333-3333-4333-8333-333333333333';
  const GROUP = '44444444-4444-4444-8444-444444444444';

  describe('Mode 1: SPLIT THE BILL (Equal Split)', () => {
    it('calculates equal shares and transfers with a single payer', () => {
      const totalPaise = toMinor('300.00'); // ₹300
      const participants = [YOU, ALICE, BOB];

      const shares = splitEqually(totalPaise, participants);
      expect(shares).toEqual([
        { userId: YOU, share: 10000 },
        { userId: ALICE, share: 10000 },
        { userId: BOB, share: 10000 },
      ]);

      // Single payer: You paid ₹300 (30000 paise)
      const balances: Balance[] = [
        { userId: YOU, amount: 30000 - 10000 }, // +20000
        { userId: ALICE, amount: 0 - 10000 },   // -10000
        { userId: BOB, amount: 0 - 10000 },     // -10000
      ];

      const transfers = minimizeTransfers(balances);
      expect(transfers).toHaveLength(2);
      expect(transfers).toContainEqual({ from: ALICE, to: YOU, amount: 10000 });
      expect(transfers).toContainEqual({ from: BOB, to: YOU, amount: 10000 });
    });

    it('calculates equal shares and transfers with multiple payers', () => {
      const totalPaise = toMinor('600.00'); // ₹600
      const participants = [YOU, ALICE, BOB];

      const shares = splitEqually(totalPaise, participants);
      expect(shares.map((s) => s.share)).toEqual([20000, 20000, 20000]); // ₹200 each

      // Multiple payers: You paid ₹400, Alice paid ₹200, Bob paid ₹0
      const balances: Balance[] = [
        { userId: YOU, amount: 40000 - 20000 },   // +20000 (to receive ₹200)
        { userId: ALICE, amount: 20000 - 20000 }, // 0 (settled)
        { userId: BOB, amount: 0 - 20000 },       // -20000 (to give ₹200)
      ];

      const transfers = minimizeTransfers(balances);
      expect(transfers).toEqual([{ from: BOB, to: YOU, amount: 20000 }]);
    });
  });

  describe('Mode 2: DIVIDE / DISTRIBUTE PROPERLY (Custom Payments & Custom Shares)', () => {
    it('reconciles the prompt example: ₹800 bill with You ₹500, Alice ₹100, Bob ₹200', () => {
      const totalPaise = toMinor('800.00'); // 80000 paise
      const participants = [YOU, ALICE, BOB];

      // Equal split of 80000 into 3 people:
      // 80000 / 3 = 26666.666...
      const shares = splitEqually(totalPaise, participants);
      expect(shares.reduce((sum, s) => sum + s.share, 0)).toBe(80000);

      // Payments: You = ₹500 (50000), Alice = ₹100 (10000), Bob = ₹200 (20000)
      const payments: Record<string, number> = {
        [YOU]: 50000,
        [ALICE]: 10000,
        [BOB]: 20000,
      };

      const balances: Balance[] = shares.map((s) => ({
        userId: s.userId,
        amount: payments[s.userId] - s.share,
      }));

      // Check net balances
      const youBal = balances.find((b) => b.userId === YOU)!.amount;
      const aliceBal = balances.find((b) => b.userId === ALICE)!.amount;
      const bobBal = balances.find((b) => b.userId === BOB)!.amount;

      expect(youBal).toBe(23333); // +₹233.33 (to receive)
      expect(aliceBal).toBe(-16667); // -₹166.67 (to give)
      expect(bobBal).toBe(-6666); // -₹66.66 (to give)
      expect(youBal + aliceBal + bobBal).toBe(0); // perfect balance

      const transfers = minimizeTransfers(balances);
      expect(transfers).toHaveLength(2);

      // Alice pays You ₹166.67 (16667 paise)
      expect(transfers).toContainEqual({ from: ALICE, to: YOU, amount: 16667 });
      // Bob pays You ₹66.66 (6666 paise)
      expect(transfers).toContainEqual({ from: BOB, to: YOU, amount: 6666 });
      // Total received by You is exactly ₹233.33 (23333 paise)
      const totalReceived = transfers
        .filter((t) => t.to === YOU)
        .reduce((sum, t) => sum + t.amount, 0);
      expect(totalReceived).toBe(23333);
    });

    it('handles fully custom payments and custom consumption shares', () => {
      // Total ₹1000
      // Payments: You paid ₹800, Alice paid ₹200, Bob paid ₹0
      // Custom Shares: You ate ₹300, Alice ate ₹400, Bob ate ₹300
      const balances: Balance[] = [
        { userId: YOU, amount: 80000 - 30000 },   // +50000 (to receive ₹500)
        { userId: ALICE, amount: 20000 - 40000 }, // -20000 (to give ₹200)
        { userId: BOB, amount: 0 - 30000 },       // -30000 (to give ₹300)
      ];

      expect(balances.reduce((sum, b) => sum + b.amount, 0)).toBe(0);

      const transfers = minimizeTransfers(balances);
      expect(transfers).toEqual([
        { from: BOB, to: YOU, amount: 30000 },
        { from: ALICE, to: YOU, amount: 20000 },
      ]);
    });
  });

  describe('Validation Schema', () => {
    it('accepts valid multi-payer and custom shares', () => {
      const input = {
        groupId: GROUP,
        amount: '800.00',
        description: 'Team dinner',
        category: 'Food',
        clientRequestId: crypto.randomUUID(),
        payers: [
          { userId: YOU, amount: '500.00' },
          { userId: ALICE, amount: '100.00' },
          { userId: BOB, amount: '200.00' },
        ],
        shares: [
          { userId: YOU, amount: '266.67' },
          { userId: ALICE, amount: '266.67' },
          { userId: BOB, amount: '266.66' },
        ],
      };

      const result = createGroupExpenseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects when payer amounts do not sum to total', () => {
      const input = {
        groupId: GROUP,
        amount: '800.00',
        description: 'Team dinner',
        category: 'Food',
        clientRequestId: crypto.randomUUID(),
        payers: [
          { userId: YOU, amount: '500.00' },
          { userId: ALICE, amount: '100.00' },
          // Missing ₹200 from Bob!
        ],
        shares: [
          { userId: YOU, amount: '266.67' },
          { userId: ALICE, amount: '266.67' },
          { userId: BOB, amount: '266.66' },
        ],
      };

      const result = createGroupExpenseSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Total paid');
      }
    });

    it('rejects when share amounts do not sum to total', () => {
      const input = {
        groupId: GROUP,
        amount: '800.00',
        description: 'Team dinner',
        category: 'Food',
        clientRequestId: crypto.randomUUID(),
        payers: [
          { userId: YOU, amount: '800.00' },
        ],
        shares: [
          { userId: YOU, amount: '300.00' },
          { userId: ALICE, amount: '300.00' },
          // Total is ₹600 instead of ₹800
        ],
      };

      const result = createGroupExpenseSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Total shares');
      }
    });
  });
});
