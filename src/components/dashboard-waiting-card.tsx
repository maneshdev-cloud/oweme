'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PersonAvatar } from '@/components/person-avatar';
import { StatusBadge } from '@/components/status-badge';
import { formatINR, toMinor } from '@/lib/money';
import { transitionExpense, transitionSettlement } from '@/lib/actions/expenses';
import type { DashboardWaitingItem } from '@/lib/types';

export function DashboardWaitingCard({ item }: { item: DashboardWaitingItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleAction = (action: 'confirm' | 'dispute') => {
    startTransition(async () => {
      let result;
      if (item.kind === 'settlement') {
        result = await transitionSettlement({ settlementId: item.id, action });
      } else {
        result = await transitionExpense({ expenseId: item.id, action });
      }

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (action === 'confirm') {
        toast.success(`Confirmed! ${formatINR(toMinor(item.amount))} marked as settled.`);
      } else {
        toast.success(`Marked as didn’t receive. The ${formatINR(toMinor(item.amount))} remains pending.`);
      }

      router.refresh();
    });
  };

  const href = item.kind === 'settlement' ? `/settlements/${item.id}` : `/expenses/${item.id}`;

  return (
    <Card className="border-primary/40 bg-card transition-colors">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <PersonAvatar person={item.counterparty} className="h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-sm font-semibold text-foreground">
              {item.counterparty.full_name} says they paid you{' '}
              <span className="font-bold text-positive">{formatINR(toMinor(item.amount))}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate max-w-[180px] sm:max-w-none">
                For {item.kind === 'settlement' ? 'Settlement payment' : item.description}
              </span>
              <span>·</span>
              <StatusBadge status={item.status} className="align-middle shrink-0" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0">
          <Button
            size="sm"
            variant="positive"
            className="flex-1 sm:flex-initial gap-1.5"
            onClick={() => handleAction('confirm')}
            disabled={pending}
            loading={pending}
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> Received
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="flex-1 sm:flex-initial gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => handleAction('dispute')}
            disabled={pending}
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Didn&apos;t Receive
          </Button>

          <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0">
            <Link href={href} aria-label={`View details of payment from ${item.counterparty.full_name}`}>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
