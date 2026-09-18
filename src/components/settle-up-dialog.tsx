'use client';

import { cloneElement, isValidElement, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowUpRight, Handshake, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PersonAvatar } from '@/components/person-avatar';
import { createSettlement } from '@/lib/actions/expenses';
import { formatINR, parseAmountInput, sanitizeAmountInput, toAmountString } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { Person } from '@/lib/types';

/**
 * "We settled this in cash/UPI — write it down."
 * The other person confirms it, which is what actually moves the numbers.
 */
export function SettleUpDialog({
  open,
  onOpenChange,
  person,
  balanceMinor,
  groupId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Person;
  balanceMinor: number;
  groupId?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const suggested = Math.abs(balanceMinor);
  const [amount, setAmount] = useState(suggested > 0 ? (suggested / 100).toFixed(2).replace(/\.00$/, '') : '');
  const [direction, setDirection] = useState<'i_paid' | 'they_paid'>(balanceMinor < 0 ? 'i_paid' : 'they_paid');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(crypto.randomUUID());
  const amountRef = useRef<HTMLInputElement>(null);

  const minor = parseAmountInput(amount);
  const firstName = person.full_name.split(' ')[0];

  const amountWarning =
    amount && minor !== null
      ? minor < 10
        ? 'Minimum amount is ₹0.10'
        : minor > 500000
          ? 'Maximum amount is ₹5,000'
          : null
      : null;

  function submit() {
    if (minor === null || minor < 10 || minor > 500000) {
      setError('Enter an amount between ₹0.10 and ₹5,000.');
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await createSettlement({
        counterpartyId: person.id,
        groupId: groupId ?? null,
        amount: toAmountString(minor),
        direction,
        clientRequestId: requestId.current,
      });

      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      requestId.current = crypto.randomUUID();
      toast.success(
        direction === 'i_paid'
          ? `Payment recorded · To give ${formatINR(minor)}`
          : `Payment recorded · To receive ${formatINR(minor)}`,
      );
      onOpenChange(false);
      router.push(`/settlements/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[95dvh] flex flex-col p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Settle up with {firstName}</DialogTitle>
          <DialogDescription>
            This records money that already changed hands. They’ll get a prompt to confirm it arrived.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex-1 overflow-y-auto overscroll-contain pr-1 space-y-4 pb-4"
        >
          <div className="flex items-center gap-3 rounded-xl bg-secondary p-3">
            <PersonAvatar person={person} className="h-9 w-9" />
            <div className="flex-1">
              <p className="text-sm font-medium">{person.full_name}</p>
              <p className="text-xs text-secondary-foreground">
                {balanceMinor === 0
                  ? 'No open balance — you can still record a payment.'
                  : balanceMinor > 0
                    ? `To receive from ${firstName}: ${formatINR(Math.abs(balanceMinor))}`
                    : `To give to ${firstName}: ${formatINR(Math.abs(balanceMinor))}`}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settle-amount">How much?</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium text-lg">₹</span>
              <Input
                ref={amountRef}
                id="settle-amount"
                inputMode="decimal"
                maxLength={7}
                value={amount}
                onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
                onFocus={(e) => {
                  setTimeout(() => {
                    e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 150);
                }}
                placeholder="0.00"
                className="tabular text-lg font-semibold"
              />
            </div>
            {amountWarning && (
              <p className="text-xs font-medium text-destructive">{amountWarning}</p>
            )}
            {suggested > 0 && (
              <button
                type="button"
                className="text-xs text-primary underline-offset-4 hover:underline"
                onClick={() => setAmount(sanitizeAmountInput((suggested / 100).toFixed(2).replace(/\.00$/, '')))}
              >
                Use the full balance · {formatINR(Math.min(suggested, 500000))}
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Who paid?</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={direction === 'i_paid'}
                onClick={() => setDirection('i_paid')}
                className={cn(
                  'flex flex-col items-start rounded-xl border p-2.5 text-left text-sm font-medium transition-colors',
                  direction === 'i_paid' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-input hover:bg-accent',
                )}
              >
                <span className="font-semibold">I paid {firstName}</span>
                <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-negative">
                  <ArrowUpRight className="h-3 w-3" /> To give
                </span>
              </button>
              <button
                type="button"
                aria-pressed={direction === 'they_paid'}
                onClick={() => setDirection('they_paid')}
                className={cn(
                  'flex flex-col items-start rounded-xl border p-2.5 text-left text-sm font-medium transition-colors',
                  direction === 'they_paid' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-input hover:bg-accent',
                )}
              >
                <span className="font-semibold">{firstName} paid me</span>
                <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-positive">
                  <ArrowDownLeft className="h-3 w-3" /> To receive
                </span>
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              <Wallet className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Cash, UPI, whatever you used.
            </p>
            <Button type="submit" loading={pending} disabled={pending}>
              <Handshake className="h-4 w-4" /> Record payment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SettleUpButton(props: Omit<React.ComponentProps<typeof SettleUpDialog>, 'open' | 'onOpenChange'>) {
  const [open, setOpen] = useState(false);
  const trigger = isValidElement(props.trigger) ? (
    cloneElement(props.trigger as React.ReactElement<{ onClick?: (event: React.MouseEvent) => void }>, {
      onClick: (event: React.MouseEvent) => {
        (props.trigger as React.ReactElement<{ onClick?: (event: React.MouseEvent) => void }>).props.onClick?.(event);
        setOpen(true);
      },
    })
  ) : (
    <span role="button" tabIndex={0} onClick={() => setOpen(true)} className="inline-flex">
      {props.trigger}
    </span>
  );

  return (
    <>
      {trigger}
      <SettleUpDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}
