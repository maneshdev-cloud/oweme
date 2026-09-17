'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck, Ban, CircleSlash, Send, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { transitionExpense } from '@/lib/actions/expenses';
import type { ExpenseStatus } from '@/lib/types';

type Action = 'mark_paid' | 'confirm' | 'dispute' | 'cancel';

/**
 * The buttons that move an expense through the state machine. Which ones appear
 * is decided by the database's rules, but the database is what actually
 * enforces them — if this component were tampered with, the write would still
 * be refused.
 */
export function ExpenseActions({
  expenseId,
  status,
  youArePayer,
  youAreDebtor,
  canCancel,
}: {
  expenseId: string;
  status: ExpenseStatus;
  youArePayer: boolean;
  youAreDebtor: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: Action, successMessage: string) {
    startTransition(async () => {
      const result = await transitionExpense({ expenseId, action });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  const actions: Array<{ action: Action; label: string; icon: typeof Send; variant?: 'default' | 'outline' | 'destructive' | 'positive'; hidden?: boolean }> = [];

  if (youAreDebtor && (status === 'PENDING' || status === 'DISPUTED')) {
    actions.push({
      action: 'mark_paid',
      label: status === 'DISPUTED' ? 'I’ve paid — tell them again' : 'I’ve paid',
      icon: Send,
    });
  }

  if (youArePayer && status === 'PAYMENT_MARKED') {
    actions.push({ action: 'confirm', label: 'Yes, I got it', icon: BadgeCheck, variant: 'positive' });
    actions.push({ action: 'dispute', label: 'No, didn’t arrive', icon: ShieldQuestion, variant: 'outline' });
  }

  if (youArePayer && status === 'DISPUTED') {
    actions.push({ action: 'confirm', label: 'It arrived after all', icon: BadgeCheck, variant: 'outline' });
  }

  if (canCancel && status === 'PENDING') {
    actions.push({ action: 'cancel', label: 'Cancel this expense', icon: Ban, variant: 'outline' });
  }

  if (actions.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-secondary px-3.5 py-3 text-sm text-secondary-foreground">
        <CircleSlash className="h-4 w-4 shrink-0" aria-hidden />
        {status === 'CONFIRMED'
          ? 'This one is settled — nothing left to do.'
          : status === 'CANCELLED'
            ? 'This expense was cancelled. It stays in the history as a record.'
            : status === 'PAYMENT_MARKED'
              ? 'Waiting on the other person to confirm the payment.'
              : 'Nothing needs your input right now.'}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((item) => (
        <Button
          key={item.action}
          variant={item.variant ?? 'default'}
          loading={pending}
          disabled={pending}
          onClick={() =>
            run(
              item.action,
              item.action === 'mark_paid'
                ? 'Marked as paid — they’ll be asked to confirm.'
                : item.action === 'confirm'
                  ? 'Confirmed. That one’s settled.'
                  : item.action === 'dispute'
                    ? 'Recorded. They’ll see that you haven’t received it.'
                    : 'Cancelled. The record stays in history.',
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Button>
      ))}
    </div>
  );
}
