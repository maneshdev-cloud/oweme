'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck, BadgeX, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { transitionSettlement } from '@/lib/actions/expenses';
import type { SettlementStatus } from '@/lib/types';

export function SettlementActions({
  settlementId,
  status,
  youArePayer,
  youAreReceiver,
}: {
  settlementId: string;
  status: SettlementStatus;
  youArePayer: boolean;
  youAreReceiver: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: 'confirm' | 'dispute' | 'cancel', message: string) {
    startTransition(async () => {
      const result = await transitionSettlement({ settlementId, action });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(message);
      router.refresh();
    });
  }

  if (status === 'CANCELLED') {
    return (
      <div className="rounded-xl border border-muted bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-muted-foreground" />
          This settlement was cancelled and does not affect any balance.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* PENDING State */}
        {status === 'PENDING' && (
          <>
            {youAreReceiver && (
              <>
                <Button
                  variant="positive"
                  loading={pending}
                  disabled={pending}
                  onClick={() => run('confirm', 'Confirmed — the balance is cleared.')}
                >
                  <BadgeCheck className="h-4 w-4" /> Received
                </Button>
                <Button
                  variant="outline"
                  loading={pending}
                  disabled={pending}
                  onClick={() => run('dispute', 'Recorded — marked as didn’t receive.')}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <BadgeX className="h-4 w-4" /> Didn&apos;t Receive
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              loading={pending}
              disabled={pending}
              onClick={() => run('cancel', 'Settlement claim cancelled.')}
            >
              <Ban className="h-4 w-4" /> Cancel claim
            </Button>
          </>
        )}

        {/* DISPUTED State */}
        {status === 'DISPUTED' && (
          <>
            {youAreReceiver && (
              <Button
                variant="positive"
                loading={pending}
                disabled={pending}
                onClick={() => run('confirm', 'Confirmed — the balance is cleared.')}
              >
                <BadgeCheck className="h-4 w-4" /> I received it now (Confirm)
              </Button>
            )}
            <Button
              variant="outline"
              loading={pending}
              disabled={pending}
              onClick={() => run('cancel', 'Disputed payment cancelled.')}
            >
              <Ban className="h-4 w-4" /> Void / Cancel settlement
            </Button>
          </>
        )}

        {/* CONFIRMED State: allow either party to cancel if entered mistakenly */}
        {status === 'CONFIRMED' && (
          <div className="flex flex-wrap items-center gap-2">
            {youAreReceiver && (
              <Button
                variant="outline"
                size="sm"
                loading={pending}
                disabled={pending}
                onClick={() => run('dispute', 'Payment marked as disputed. The amount remains outstanding.')}
                className="text-xs text-amber-700 dark:text-amber-400"
              >
                <BadgeX className="h-3.5 w-3.5" /> Not received after all
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              loading={pending}
              disabled={pending}
              onClick={() => run('cancel', 'Settlement cancelled. The outstanding balance is restored on both ends.')}
              className="text-xs text-muted-foreground hover:text-negative"
            >
              <Ban className="h-3.5 w-3.5" /> Cancel / Void this settlement
            </Button>
          </div>
        )}
      </div>
      {status === 'CONFIRMED' && (youArePayer || youAreReceiver) && (
        <p className="text-[11px] text-muted-foreground">
          Need to cancel? Either party can cancel this payment if it didn&apos;t go through. The balance will immediately restore on both ends.
        </p>
      )}
    </div>
  );
}
