import { Ban, CircleDashed, CircleCheck, ShieldAlert, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EXPENSE_STATUS_META } from '@/lib/constants';
import type { ExpenseStatus } from '@/lib/types';

const ICONS: Record<ExpenseStatus, typeof CircleCheck> = {
  PENDING: CircleDashed,
  PAYMENT_MARKED: Timer,
  CONFIRMED: CircleCheck,
  DISPUTED: ShieldAlert,
  CANCELLED: Ban,
};

/**
 * Status is communicated by icon + word + colour together, so it is never
 * colour-alone (and survives greyscale, colour-blindness and dark mode).
 */
export function StatusBadge({ status, className }: { status: ExpenseStatus; className?: string }) {
  const meta = EXPENSE_STATUS_META[status];
  const Icon = ICONS[status];
  const variant =
    meta.tone === 'positive'
      ? 'positive'
      : meta.tone === 'negative'
        ? 'negative'
        : meta.tone === 'waiting'
          ? 'waiting'
          : meta.tone === 'muted'
            ? 'muted'
            : 'secondary';

  return (
    <Badge variant={variant} className={className}>
      <Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function statusHint(status: ExpenseStatus): string {
  return EXPENSE_STATUS_META[status].hint;
}
