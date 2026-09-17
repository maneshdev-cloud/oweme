import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Ban, ShieldQuestion } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PersonAvatar } from '@/components/person-avatar';
import { StatusBadge } from '@/components/status-badge';
import { SettlementActions } from '@/components/settlement-actions';
import { requireUser } from '@/lib/supabase/server';
import { getSettlementDetail } from '@/lib/queries/social';
import { formatINR, toMinor } from '@/lib/money';
import { timeAgo } from '@/lib/utils';

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const detail = await getSettlementDetail(id);
  if (!detail) notFound();

  const { settlement, payer, receiver, groupName } = detail;
  const amount = toMinor(settlement.amount);
  const youAreReceiver = settlement.receiver_id === user.id;

  return (
    <div className="space-y-5">
      <Link
        href={settlement.group_id ? `/groups/${settlement.group_id}` : '/home'}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </Link>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-lg">Settle up{groupName ? ` · ${groupName}` : ''}</CardTitle>
            <StatusBadge status={settlement.status === 'CONFIRMED' ? 'CONFIRMED' : settlement.status === 'DISPUTED' ? 'DISPUTED' : settlement.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-3xl font-semibold tabular">{formatINR(amount)}</p>

          <div className="flex items-center gap-3 rounded-2xl border p-3">
            <PersonAvatar person={payer} className="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {payer.full_name} {payer.id === user.id && <span className="text-muted-foreground">(you)</span>}
              </p>
              <p className="text-xs text-muted-foreground">Says they paid</p>
            </div>
            <span className="text-muted-foreground" aria-hidden>→</span>
            <PersonAvatar person={receiver} className="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {receiver.full_name} {receiver.id === user.id && <span className="text-muted-foreground">(you)</span>}
              </p>
              <p className="text-xs text-muted-foreground">Should have received it</p>
            </div>
          </div>

          {settlement.status === 'PENDING' && (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
              {youAreReceiver
                ? `Once the ${formatINR(amount)} actually lands, confirm it — that’s what clears the balance. If it never arrived, say so and both sides will see it.`
                : 'Waiting for them to confirm they received it. Only then does the balance move.'}
            </p>
          )}

          {settlement.status === 'CONFIRMED' && (
            <p className="flex items-center gap-2 rounded-xl bg-positive/10 px-3 py-2 text-sm text-positive">
              <BadgeCheck className="h-4 w-4" aria-hidden />
              Confirmed {settlement.confirmed_at ? timeAgo(settlement.confirmed_at) : ''}. This payment counts towards
              the balance.
            </p>
          )}

          {settlement.status === 'DISPUTED' && (
            <p className="flex items-center gap-2 rounded-xl bg-negative/10 px-3 py-2 text-sm text-negative">
              <ShieldQuestion className="h-4 w-4" aria-hidden />
              The receiver says this payment hasn’t arrived. Sort it out between you, then re-record it if needed.
            </p>
          )}

          {settlement.status === 'CANCELLED' && (
            <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Ban className="h-4 w-4" aria-hidden />
              This claim was withdrawn. Nothing about it affects your balance.
            </p>
          )}

          <SettlementActions
            settlementId={settlement.id}
            status={settlement.status}
            youArePayer={settlement.payer_id === user.id}
            youAreReceiver={youAreReceiver}
          />

          <p className="text-xs text-muted-foreground">
            Recorded {timeAgo(settlement.created_at)}. OweMe doesn’t move money — this is the two of you agreeing that
            it has moved.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
