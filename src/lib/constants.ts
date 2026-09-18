/** Quick-select categories. Free text is still allowed — this is just the fast path. */
export const CATEGORIES = [
  { value: 'Printout' },
  { value: 'Food' },
  { value: 'Travel' },
  { value: 'Ticket' },
  { value: 'Stationery' },
  { value: 'Project' },
  { value: 'Other' },
] as const;

export type Category = (typeof CATEGORIES)[number]['value'];

export const CURRENCY = 'INR';
export const APP_NAME = 'OweMe';
export const APP_TAGLINE = 'Small money between friends, remembered.';

/**
 * Status presentation. Never colour alone: every status ships an icon and a
 * human label too, so the UI still reads correctly in greyscale.
 */
export const EXPENSE_STATUS_META = {
  PENDING: {
    label: 'Not settled',
    hint: 'Nothing has happened yet',
    tone: 'neutral' as const,
  },
  PAYMENT_MARKED: {
    label: 'Waiting to confirm',
    hint: 'They say they paid — the other person needs to confirm',
    tone: 'waiting' as const,
  },
  CONFIRMED: {
    label: 'Settled',
    hint: 'Both sides agree this is done',
    tone: 'positive' as const,
  },
  DISPUTED: {
    label: 'Not confirmed / Not received',
    hint: 'The payment was not received — the amount remains outstanding',
    tone: 'negative' as const,
  },
  CANCELLED: {
    label: 'Cancelled',
    hint: 'Cancelled — kept for the record',
    tone: 'muted' as const,
  },
} as const;

/** Event labels for the audit timeline. */
export const EVENT_META: Record<string, string> = {
  created: 'added the expense',
  updated: 'edited the expense',
  payment_marked: 'said they paid',
  confirmed: 'confirmed the money arrived',
  disputed: 'said the money never arrived',
  cancelled: 'cancelled the expense',
  note: 'left a note',
  expired_reminder: 'reminded',
};
