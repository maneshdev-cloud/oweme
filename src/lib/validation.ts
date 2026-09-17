import { z } from 'zod';
import { toMinor } from './money';

/** Shared shapes. Every server action validates again — the client is not trusted. */
export const uuid = z.string().uuid();

export const amountString = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount like 28 or 1250.50')
  .refine((value) => Number(value) > 0, 'Amount must be more than zero');

export const categoryField = z.string().trim().min(1).max(48);

export const descriptionField = z.string().trim().min(1, 'Add a short description').max(200);

/**
 * The add-expense form only says *who the friend is* and *who paid* — the
 * server decides which of the two ids is the payer and which is the debtor from
 * the session, so a client can never file an expense in somebody else's name.
 */
export const createExpenseSchema = z
  .object({
    friendId: uuid,
    amount: amountString,
    description: descriptionField,
    category: categoryField,
    direction: z.enum(['i_paid', 'they_paid']),
    /** Generated once when the form mounts; makes a retry idempotent. */
    clientRequestId: uuid,
  })
  .refine((value) => value.friendId.length > 0, 'Pick a friend');

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const groupPayerItemSchema = z.object({
  userId: uuid,
  amount: amountString,
});

export const groupShareItemSchema = z.object({
  userId: uuid,
  amount: amountString,
});

export const createGroupExpenseSchema = z
  .object({
    groupId: uuid,
    amount: amountString,
    description: descriptionField,
    category: categoryField,
    clientRequestId: uuid,
    paidBy: uuid.optional(),
    payers: z.array(groupPayerItemSchema).optional(),
    participantIds: z.array(uuid).max(50).optional(),
    shares: z.array(groupShareItemSchema).optional(),
  })
  .superRefine((data, ctx) => {
    let totalPaise = 0;
    try {
      totalPaise = toMinor(data.amount);
    } catch {
      return;
    }

    const payers =
      data.payers && data.payers.length > 0
        ? data.payers
        : data.paidBy
          ? [{ userId: data.paidBy, amount: data.amount }]
          : [];

    if (payers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paidBy'],
        message: 'Select who paid the bill',
      });
    } else {
      const payerSum = payers.reduce((sum, p) => sum + toMinor(p.amount), 0);
      if (payerSum !== totalPaise) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payers'],
          message: `Total paid (₹${(payerSum / 100).toFixed(2)}) must equal total bill (₹${(totalPaise / 100).toFixed(2)})`,
        });
      }
    }

    if (data.shares && data.shares.length > 0) {
      const shareSum = data.shares.reduce((sum, s) => sum + toMinor(s.amount), 0);
      if (shareSum !== totalPaise) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shares'],
          message: `Total shares (₹${(shareSum / 100).toFixed(2)}) must equal total bill (₹${(totalPaise / 100).toFixed(2)})`,
        });
      }
    } else if (!data.participantIds || data.participantIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['participantIds'],
        message: 'Pick at least one person to split with',
      });
    }
  });

export const expenseTransitionSchema = z.object({
  expenseId: uuid,
  action: z.enum(['mark_paid', 'confirm', 'dispute', 'cancel']),
});

export const settlementActionSchema = z.object({
  settlementId: uuid,
  action: z.enum(['confirm', 'dispute', 'cancel']),
});

export const friendRequestSchema = z.object({ addresseeId: uuid });
export const friendResponseSchema = z.object({
  friendshipId: uuid,
  response: z.enum(['accept', 'decline', 'cancel']),
});

export const groupSchema = z.object({
  name: z.string().trim().min(2, 'Give the group a name').max(80),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  memberIds: z.array(uuid).optional(),
});

export const groupMemberSchema = z.object({ groupId: uuid, userId: uuid });

export const groupRoleSchema = z.object({
  groupId: uuid,
  userId: uuid,
  role: z.enum(['owner', 'admin', 'member']),
});

export const deleteGroupSchema = z.object({
  groupId: uuid,
});

export const settlementSchema = z.object({
  counterpartyId: uuid,
  groupId: uuid.nullable().optional(),
  amount: amountString,
  direction: z.enum(['i_paid', 'they_paid']),
  clientRequestId: uuid,
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, '3–24 characters: a–z, 0-9 and _'),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

export const notificationPreferencesSchema = z.object({
  browserPushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
});

export const adminSettingSchema = z.object({
  key: z.enum([
    'maintenance_mode',
    'registrations_enabled',
    'expense_creation_enabled',
    'read_only_mode',
    'retention_days',
    'archive_purge_days',
    'archive_notice_days',
  ]),
  value: z.union([z.boolean(), z.number().int().min(0).max(3650), z.string().max(500)]),
});

export const announcementSchema = z.object({
  message: z.string().trim().max(280),
  tone: z.enum(['info', 'warning']),
  dismissible: z.boolean(),
  active: z.boolean(),
});

export type CreateGroupExpenseInput = z.infer<typeof createGroupExpenseSchema>;
