import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock3, Handshake, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Amount } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import { CategoryChip } from '@/components/category-chip';
import { StatusBadge, statusHint } from '@/components/status-badge';
import { ExpenseActions } from '@/components/expense-actions';
import { requireUser } from '@/lib/supabase/server';
import { getExpenseDetail } from '@/lib/queries/social';
import { EVENT_META } from '@/lib/constants';
import { formatINR, toMinor } from '@/lib/money';
import { timeAgo } from '@/lib/utils';
import type { ExpenseStatus } from '@/lib/types';

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const detail = await getExpenseDetail(id);
  if (!detail) notFound();

  const { expense, payer, debtor, events, settlement } = detail;
  const youArePayer = expense.payer_id === user.id;
  const youAreDebtor = expense.debtor_id === user.id;
  const counterparty = youArePayer ? debtor : payer;
  const amount = toMinor(expense.amount);
  const canCancel = expense.created_by === user.id || youArePayer;

  // Single unified truth: combines expense state and settlement state into one coherent status
  let unifiedStatus: ExpenseStatus = expense.status;
  if (expense.status === 'CANCELLED') {
    unifiedStatus = 'CANCELLED';
  } else if (expense.status === 'CONFIRMED' || settlement?.status === 'CONFIRMED') {
    unifiedStatus = 'CONFIRMED';
  } else if (expense.status === 'PAYMENT_MARKED' || settlement?.status === 'PENDING') {
    unifiedStatus = 'PAYMENT_MARKED';
  } else if (expense.status === 'DISPUTED' || settlement?.status === 'DISPUTED') {
    unifiedStatus = 'DISPUTED';
  }

  return (
    <div className="space-y-5">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </Link>

      <Card>
        <CardHeader className="gap-3 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-lg">{expense.description}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <CategoryChip category={expense.category} />
                <span aria-hidden>·</span>
                <time dateTime={expense.created_at}>{timeAgo(expense.created_at)}</time>
              </div>
            </div>
            <StatusBadge status={unifiedStatus} />
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-secondary p-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-secondary-foreground/70">
                {unifiedStatus === 'CONFIRMED'
                  ? 'Settled'
                  : youArePayer
                    ? 'To receive'
                    : youAreDebtor
                      ? 'To give'
                      : 'Amount'}
              </p>
              <Amount minor={unifiedStatus === 'CONFIRMED' ? amount : youArePayer ? amount : -amount} className="text-2xl" />
            </div>
            <p className="text-right text-xs text-secondary-foreground/80">
              {unifiedStatus === 'CONFIRMED'
                ? settlement?.confirmed_at
                  ? `Settled · Confirmed ${timeAgo(settlement.confirmed_at)}`
                  : 'Settled · Confirmed'
                : statusHint(unifiedStatus)}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border p-3">
              <PersonAvatar person={payer} className="h-9 w-9" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {payer.full_name} {payer.id === user.id && <span className="text-muted-foreground">(you)</span>}
                </p>
                <p className="text-xs text-muted-foreground">Paid {formatINR(amount)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border p-3">
              <PersonAvatar person={debtor} className="h-9 w-9" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {debtor.full_name} {debtor.id === user.id && <span className="text-muted-foreground">(you)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {unifiedStatus === 'CONFIRMED'
                    ? 'Settled'
                    : youArePayer
                      ? `To receive ${formatINR(amount)}`
                      : `To give ${formatINR(amount)}`}
                </p>
              </div>
            </div>
          </div>

          {unifiedStatus === 'DISPUTED' && (
            <div className="flex items-start gap-2 rounded-xl bg-negative/10 p-3 text-sm text-negative">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                {payer.full_name} says the money hasn’t arrived, and {debtor.full_name} says it has. OweMe doesn’t
                pick a side — it keeps both claims and the timeline below so you can sort it out between you.
              </p>
            </div>
          )}

          {/* Unified actions: handles Confirm, Dispute, Cancel, Settle up right here */}
          <ExpenseActions
            expenseId={expense.id}
            settlementId={settlement?.id ?? null}
            status={unifiedStatus}
            youArePayer={youArePayer}
            youAreDebtor={youAreDebtor}
            canCancel={canCancel}
            counterparty={counterparty}
            amountMinor={amount}
          />
        </CardContent>
      </Card>

      <section aria-labelledby="timeline-heading" className="space-y-3">
        <h2 id="timeline-heading" className="flex items-center gap-2 text-base font-semibold">
          <Clock3 className="h-4 w-4" aria-hidden />
          What happened
        </h2>
        <ol className="relative space-y-4 border-l pl-5">
          {events.map((event) => (
            <li key={event.id} className="relative">
              <span
                className="pointer-events-none select-none absolute -left-[1.6rem] top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-background bg-primary"
                aria-hidden
              />
              <p className="text-sm">
                <span className="font-medium">{event.actor?.full_name ?? 'Someone'}</span>{' '}
                <span className="text-muted-foreground">{EVENT_META[event.event_type] ?? event.event_type}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                <time dateTime={event.created_at}>{timeAgo(event.created_at)}</time>
                {event.from_status && event.to_status && event.from_status !== event.to_status ? (
                  <>
                    {' '}
                    · <Badge variant="outline" className="text-[10px]">{event.from_status} → {event.to_status}</Badge>
                  </>
                ) : null}
              </p>
            </li>
          ))}
          {settlement && (
            <li className="relative">
              <span
                className="pointer-events-none select-none absolute -left-[1.6rem] top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-background bg-primary"
                aria-hidden
              />
              <p className="text-sm">
                <span className="font-medium">{settlement.payer_id === user.id ? 'You' : counterparty.full_name}</span>{' '}
                <span className="text-muted-foreground">
                  {settlement.status === 'CONFIRMED'
                    ? 'settled the balance'
                    : settlement.status === 'CANCELLED'
                      ? 'cancelled the settlement claim'
                      : settlement.status === 'DISPUTED'
                        ? 'reported settlement not received'
                        : 'recorded a settlement claim'}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                <time dateTime={settlement.created_at}>{timeAgo(settlement.created_at)}</time>
                {' '}· <Badge variant="outline" className="text-[10px]">{formatINR(toMinor(settlement.amount))} · {settlement.status}</Badge>
              </p>
            </li>
          )}
        </ol>
      </section>

      <p className="text-xs text-muted-foreground">
        OweMe never moves money. Once you’ve settled up in cash or UPI, confirm it here so both sides agree.
      </p>
    </div>
  );
}
