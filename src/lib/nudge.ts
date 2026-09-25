/**
 * Gentle Aging Nudges
 *
 * Provides a low-key, non-intrusive indicator for open balances or expenses
 * that have remained unsettled past a defined threshold (default: 3 days).
 * Never triggers push notifications or alerts.
 */

export const UNSETTLED_NUDGE_DAYS = 3;

/**
 * Returns true if an expense is considered open / unsettled.
 */
export function isExpenseUnsettled(status: string): boolean {
  return status === 'PENDING' || status === 'PAYMENT_MARKED' || status === 'DISPUTED';
}

/**
 * Calculates a gentle aging label if the item has been unsettled for at least
 * UNSETTLED_NUDGE_DAYS (3 days).
 *
 * @param createdAt - ISO timestamp string or Date object
 * @param nowMs - Optional current timestamp in milliseconds for deterministic testing
 * @returns e.g. "3 days unsettled", "5 days unsettled", or null if below threshold
 */
export function getUnsettledAgingText(
  createdAt: string | Date | null | undefined,
  nowMs: number = Date.now()
): string | null {
  if (!createdAt) return null;
  const time = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt.getTime();
  if (isNaN(time)) return null;

  const diffMs = nowMs - time;
  if (diffMs < 0) return null;

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < UNSETTLED_NUDGE_DAYS) {
    return null;
  }

  return `${diffDays} days unsettled`;
}
