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

  const actionable = status === 'PENDING' || status === 'DISPUTED';
  if (!actionable) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {youAreReceiver && (
        <>
          <Button variant="positive" loading={pending} disabled={pending} onClick={() => run('confirm', 'Confirmed — the balance is cleared.')}>
            <BadgeCheck className="h-4 w-4" /> Yes, I received it
          </Button>
          <Button variant="outline" loading={pending} disabled={pending} onClick={() => run('dispute', 'Recorded — they’ll see you haven’t received it.')}>
            <BadgeX className="h-4 w-4" /> No, it hasn’t arrived
          </Button>
        </>
      )}
      {(youArePayer || youAreReceiver) && (
        <Button variant="ghost" loading={pending} disabled={pending} onClick={() => run('cancel', 'Claim withdrawn.')}>
          <Ban className="h-4 w-4" /> Withdraw this claim
        </Button>
      )}
    </div>
  );
}
