import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Amount } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import { StatusBadge, statusHint } from '@/components/status-badge';
import { CategoryChip } from '@/components/category-chip';
import { timeAgo } from '@/lib/utils';
import { toMinor } from '@/lib/money';
import { getUnsettledAgingText, isExpenseUnsettled } from '@/lib/nudge';
import type { Expense, Person } from '@/lib/types';

export function ExpenseCard({
  expense,
  counterparty,
  youArePayer,
  href,
}: {
  expense: Expense;
  counterparty: Person;
  youArePayer: boolean;
  href?: string;
}) {
  const amount = toMinor(expense.amount);
  const isSettled = expense.status === 'CONFIRMED' || Boolean(expense.settled_at);
  const isCancelled = expense.status === 'CANCELLED';

  return (
    <Link
      href={href ?? `/expenses/${expense.id}`}
      className="flex items-center gap-3.5 rounded-2xl border bg-card p-3.5 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PersonAvatar person={counterparty} className="h-10 w-10 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {/* Who (Person involved) + Time */}
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {counterparty.full_name}
          </p>
          <time dateTime={expense.created_at} className="shrink-0 text-[11px] text-muted-foreground">
            {timeAgo(expense.created_at)}
          </time>
        </div>

        {/* What (Payment purpose: Dinner, Movie Tickets, Uber, Coffee, Rent, etc.) + Category */}
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-medium text-foreground/80">
            {expense.description}
          </p>
          <CategoryChip category={expense.category} className="shrink-0 scale-90 origin-left" />
        </div>

        {/* Status + Role hint */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <StatusBadge status={isSettled ? 'CONFIRMED' : expense.status} />
          <span className="text-[11px] text-muted-foreground truncate">
            {isSettled
              ? `Settled with ${counterparty.full_name.split(' ')[0]}`
              : isCancelled
                ? 'Cancelled'
                : youArePayer
                  ? 'To receive'
                  : 'To give'}
          </span>
          {!isSettled && isExpenseUnsettled(expense.status) && getUnsettledAgingText(expense.created_at) ? (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              {getUnsettledAgingText(expense.created_at)}
            </span>
          ) : null}
          {expense.status === 'PAYMENT_MARKED' ? (
            <span className="text-[11px] font-medium text-primary">
              Waiting for confirmation
            </span>
          ) : null}
        </div>
      </div>

      {/* Amount + Chevron */}
      <div className="flex flex-col items-end gap-1 shrink-0 pl-1">
        <Amount
          minor={isSettled ? amount : youArePayer ? amount : -amount}
          tone={isSettled ? 'positive' : undefined}
          showSign={false}
          className="text-base font-semibold"
        />
        <ChevronRight className="h-4 w-4 text-muted-foreground/70" aria-hidden />
      </div>
      <span className="sr-only">{statusHint(isSettled ? 'CONFIRMED' : expense.status)}</span>
    </Link>
  );
}
