'use client';

import { useState } from 'react';
import { Handshake, Users } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PersonAvatar } from '@/components/person-avatar';
import { SettleUpDialog } from '@/components/settle-up-dialog';
import { formatINR, toMinor } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { FriendRow, Person } from '@/lib/types';

type SettleTarget = {
  person: Person;
  balanceMinor: number;
};

export function DashboardSettleUpButton({
  friends = [],
  balances,
  className,
  variant = 'outline',
  size,
  label = 'Settle up',
}: {
  friends?: FriendRow[];
  balances?: Array<{ counterparty: Person; currency: string; balance: number }>;
  className?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  label?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState<SettleTarget | null>(null);

  // Compute outstanding balances
  const outstandingTargets: SettleTarget[] = balances
    ? balances
        .filter((b) => b.balance !== 0)
        .map((b) => ({
          person: b.counterparty,
          balanceMinor: toMinor(b.balance),
        }))
    : (friends ?? [])
        .filter((f) => f.balance !== 0)
        .map((f) => ({
          person: {
            id: f.friend_id,
            full_name: f.full_name,
            username: f.username,
            avatar_url: f.avatar_url,
          },
          balanceMinor: toMinor(f.balance),
        }));

  // Remaining friends (who currently have zero balance)
  const outstandingIds = new Set(outstandingTargets.map((t) => t.person.id));
  const otherFriends: SettleTarget[] = (friends ?? [])
    .filter((f) => !outstandingIds.has(f.friend_id))
    .map((f) => ({
      person: {
        id: f.friend_id,
        full_name: f.full_name,
        username: f.username,
        avatar_url: f.avatar_url,
      },
      balanceMinor: 0,
    }));

  function handleButtonClick() {
    if (outstandingTargets.length === 1) {
      // Exactly one outstanding balance: jump straight into settling it
      setActiveTarget(outstandingTargets[0]);
      setSettleOpen(true);
    } else {
      // Multiple outstanding balances or zero: show quick picker
      setPickerOpen(true);
    }
  }

  function selectFriend(target: SettleTarget) {
    setActiveTarget(target);
    setPickerOpen(false);
    setSettleOpen(true);
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleButtonClick}
        className={cn('inline-flex items-center gap-2', className)}
      >
        <Handshake className="h-4 w-4 shrink-0" aria-hidden />
        {label}
      </Button>

      {/* Quick picker modal when multiple or zero outstanding balances exist */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md max-h-[85dvh] flex flex-col p-4 sm:p-6 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Who are you settling with?</DialogTitle>
            <DialogDescription>
              {outstandingTargets.length > 0
                ? 'Choose someone with an open balance to record payment.'
                : 'You have no open balances right now. Select a friend to record a payment.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {outstandingTargets.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Outstanding balances
                </p>
                <ul className="space-y-1.5">
                  {outstandingTargets.map((target) => (
                    <li key={target.person.id}>
                      <button
                        type="button"
                        onClick={() => selectFriend(target)}
                        className="w-full flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PersonAvatar person={target.person} className="h-9 w-9 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{target.person.full_name}</p>
                            <p className="truncate text-xs text-muted-foreground">@{target.person.username}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={cn(
                              'text-sm font-semibold tabular',
                              target.balanceMinor > 0 ? 'text-positive' : 'text-negative',
                            )}
                          >
                            {target.balanceMinor > 0 ? '+' : '-'}
                            {formatINR(Math.abs(target.balanceMinor))}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {target.balanceMinor > 0 ? 'to receive' : 'to give'}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {otherFriends.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  {outstandingTargets.length > 0 ? 'Other friends' : 'Friends'}
                </p>
                <ul className="space-y-1.5">
                  {otherFriends.map((target) => (
                    <li key={target.person.id}>
                      <button
                        type="button"
                        onClick={() => selectFriend(target)}
                        className="w-full flex items-center justify-between gap-3 rounded-xl border border-transparent bg-muted/40 p-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PersonAvatar person={target.person} className="h-8 w-8 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{target.person.full_name}</p>
                            <p className="truncate text-xs text-muted-foreground">@{target.person.username}</p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">all square</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {outstandingTargets.length === 0 && otherFriends.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Users className="mx-auto h-8 w-8 opacity-40 mb-2" />
                <p className="text-sm font-medium">No friends connected yet</p>
                <p className="text-xs mt-1">Connect with friends on OweMe first to settle balances.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Settle-up flow dialog */}
      {activeTarget && (
        <SettleUpDialog
          open={settleOpen}
          onOpenChange={setSettleOpen}
          person={activeTarget.person}
          balanceMinor={activeTarget.balanceMinor}
        />
      )}
    </>
  );
}

export default DashboardSettleUpButton;

