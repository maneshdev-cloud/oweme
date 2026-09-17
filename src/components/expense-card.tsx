import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Amount } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import { StatusBadge, statusHint } from '@/components/status-badge';
import { CategoryChip } from '@/components/category-chip';
import { timeAgo } from '@/lib/utils';
import { toMinor } from '@/lib/money';
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

  return (
    <Link
      href={href ?? `/expenses/${expense.id}`}
      className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PersonAvatar person={counterparty} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{expense.description}</p>
          <CategoryChip category={expense.category} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {youArePayer ? `To receive from ${counterparty.full_name}` : `To give to ${counterparty.full_name}`}
          </span>
          <span aria-hidden>·</span>
          <time dateTime={expense.created_at}>{timeAgo(expense.created_at)}</time>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={expense.status} />
          {expense.status === 'PAYMENT_MARKED' ? (
            <span className="text-xs text-muted-foreground">Waiting on {counterparty.full_name.split(' ')[0]}</span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Amount minor={youArePayer ? amount : -amount} showSign={false} />
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <span className="sr-only">{statusHint(expense.status)}</span>
    </Link>
  );
}
