'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck, BadgeX, Ban, CircleSlash, Handshake, Send, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { transitionExpense, transitionSettlement } from '@/lib/actions/expenses';
import { SettleUpDialog } from '@/components/settle-up-dialog';
import type { ExpenseStatus, Person } from '@/lib/types';

type ExpenseAction = 'mark_paid' | 'confirm' | 'dispute' | 'cancel';

export function ExpenseActions({
  expenseId,
  settlementId,
  status,
  youArePayer,
  youAreDebtor,
  canCancel,
  counterparty,
  amountMinor,
}: {
  expenseId: string;
  settlementId?: string | null;
  status: ExpenseStatus;
  youArePayer: boolean;
  youAreDebtor: boolean;
  canCancel: boolean;
  counterparty?: Person;
  amountMinor?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [settleOpen, setSettleOpen] = useState(false);

  function runExpense(action: ExpenseAction, successMessage: string) {
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

  function runSettlement(action: 'confirm' | 'dispute' | 'cancel', successMessage: string) {
    if (!settlementId) return;
    startTransition(async () => {
      const result = await transitionSettlement({ settlementId, action });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  function handleConfirm() {
    if (settlementId) {
      runSettlement('confirm', 'Confirmed — that one is settled.');
    } else {
      runExpense('confirm', 'Confirmed. That one’s settled.');
    }
  }

  function handleDispute() {
    if (settlementId) {
      runSettlement('dispute', 'Payment marked as not received.');
    } else {
      runExpense('dispute', 'Recorded. They’ll see that you haven’t received it.');
    }
  }

  function handleCancelClaim() {
    if (settlementId) {
      runSettlement('cancel', 'Settlement claim cancelled.');
    } else {
      runExpense('cancel', 'Payment claim cancelled.');
    }
  }

  return (
    <div className="space-y-3">
      {/* 1. CONFIRMED / Settled state */}
      {status === 'CONFIRMED' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {youArePayer && settlementId && (
              <Button
                variant="outline"
                size="sm"
                loading={pending}
                disabled={pending}
                onClick={handleDispute}
                className="text-xs text-amber-700 dark:text-amber-400"
              >
                <BadgeX className="h-3.5 w-3.5" /> Not received after all
              </Button>
            )}
            {settlementId && (
              <Button
                variant="ghost"
                size="sm"
                loading={pending}
                disabled={pending}
                onClick={() => runSettlement('cancel', 'Settlement cancelled. The outstanding balance is restored on both ends.')}
                className="text-xs text-muted-foreground hover:text-negative"
              >
                <Ban className="h-3.5 w-3.5" /> Cancel / Void this settlement
              </Button>
            )}
          </div>
          {settlementId && (
            <p className="text-[11px] text-muted-foreground">
              Need to cancel? Either person can cancel this settlement if it didn&apos;t go through. The balance will immediately restore on both ends.
            </p>
          )}
          {!settlementId && (
            <p className="flex items-center gap-2 rounded-2xl bg-secondary px-3.5 py-3 text-sm text-secondary-foreground">
              <CircleSlash className="h-4 w-4 shrink-0" aria-hidden />
              This one is settled — nothing left to do.
            </p>
          )}
        </div>
      )}

      {/* 2. PAYMENT_MARKED / Pending settlement confirmation state */}
      {status === 'PAYMENT_MARKED' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {youArePayer && (
              <>
                <Button
                  variant="positive"
                  loading={pending}
                  disabled={pending}
                  onClick={handleConfirm}
                >
                  <BadgeCheck className="h-4 w-4" /> Received
                </Button>
                <Button
                  variant="outline"
                  loading={pending}
                  disabled={pending}
                  onClick={handleDispute}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <ShieldQuestion className="h-4 w-4" /> Didn&apos;t Receive
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              loading={pending}
              disabled={pending}
              onClick={handleCancelClaim}
            >
              <Ban className="h-4 w-4" /> {youAreDebtor ? 'Cancel / Withdraw "I’ve paid"' : 'Cancel claim'}
            </Button>
          </div>
          {youAreDebtor && (
            <p className="text-xs text-muted-foreground">
              Waiting for {counterparty?.full_name ?? 'the other person'} to confirm they received the money. You can cancel if marked mistakenly.
            </p>
          )}
        </div>
      )}

      {/* 3. DISPUTED state */}
      {status === 'DISPUTED' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {youArePayer && (
              <Button
                variant="positive"
                loading={pending}
                disabled={pending}
                onClick={handleConfirm}
              >
                <BadgeCheck className="h-4 w-4" /> It arrived after all (Confirm)
              </Button>
            )}
            {youAreDebtor && (
              <Button
                variant="default"
                loading={pending}
                disabled={pending}
                onClick={() => runExpense('mark_paid', 'Marked as paid again — they’ll be notified.')}
              >
                <Send className="h-4 w-4" /> I’ve paid — tell them again
              </Button>
            )}
            <Button
              variant="outline"
              loading={pending}
              disabled={pending}
              onClick={handleCancelClaim}
            >
              <Ban className="h-4 w-4" /> Void / Cancel settlement
            </Button>
          </div>
        </div>
      )}

      {/* 4. CANCELLED state */}
      {status === 'CANCELLED' && (
        <p className="flex items-center gap-2 rounded-2xl bg-secondary px-3.5 py-3 text-sm text-secondary-foreground">
          <CircleSlash className="h-4 w-4 shrink-0" aria-hidden />
          This expense was cancelled. It stays in the history as a record.
        </p>
      )}

      {/* 5. PENDING state (open debt) */}
      {status === 'PENDING' && (
        <div className="flex flex-wrap items-center gap-2">
          {youAreDebtor && (
            <>
              <Button
                variant="default"
                loading={pending}
                disabled={pending}
                onClick={() => runExpense('mark_paid', 'Marked as paid — they’ll be asked to confirm.')}
              >
                <Send className="h-4 w-4" /> I’ve paid
              </Button>
              {counterparty && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => setSettleOpen(true)}
                >
                  <Handshake className="h-4 w-4" /> Settle up
                </Button>
              )}
            </>
          )}

          {youArePayer && (
            <>
              {counterparty && (
                <Button
                  variant="positive"
                  disabled={pending}
                  onClick={() => setSettleOpen(true)}
                >
                  <BadgeCheck className="h-4 w-4" /> They paid me
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="outline"
                  loading={pending}
                  disabled={pending}
                  onClick={() => runExpense('cancel', 'Cancelled this expense.')}
                >
                  <Ban className="h-4 w-4" /> Cancel this expense
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Inline Settle Up dialog so user stays right here in this one setup */}
      {counterparty && (
        <SettleUpDialog
          open={settleOpen}
          onOpenChange={setSettleOpen}
          person={counterparty}
          balanceMinor={youAreDebtor ? -(amountMinor ?? 0) : (amountMinor ?? 0)}
          initialDirection={youAreDebtor ? 'i_paid' : 'they_paid'}
          redirect={false}
        />
      )}
    </div>
  );
}
