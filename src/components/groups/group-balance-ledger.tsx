'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatINR, toMinor } from '@/lib/money';
import type { GroupMemberRow } from '@/lib/types';

export function GroupBalanceLedger({
  currentUserId,
  members,
}: {
  currentUserId: string;
  members: GroupMemberRow[];
}) {
  const [open, setOpen] = useState(false);
  const me = members.find((m) => m.user_id === currentUserId);

  if (!me) return null;

  const myPaidMinor = toMinor(me.paid);
  const myShareMinor = toMinor(me.share);
  const mySettledOutMinor = toMinor(me.settled_out);
  const mySettledInMinor = toMinor(me.settled_in);
  const myNetMinor = toMinor(me.net);

  return (
    <Card className="border-muted bg-card/60 transition-colors">
      <CardHeader
        className="cursor-pointer py-3 px-4 select-none hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <HelpCircle className="h-4 w-4 text-primary" />
            <span>How your balance is calculated</span>
          </CardTitle>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 font-medium"
          >
            <span>{open ? 'Hide details' : 'View breakdown'}</span>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="px-4 pb-4 pt-1 space-y-3 text-xs border-t">
          <div className="rounded-lg bg-muted/60 p-3 space-y-2">
            <p className="font-medium text-foreground">Formula:</p>
            <p className="text-muted-foreground tabular font-mono text-[11px] bg-background/80 p-2 rounded border">
              Net Balance = (Total You Paid) − (Your Total Share) + (Settlements Paid Out) − (Settlements Received)
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 text-foreground">
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">Total You Paid for Bills:</span>
                <span className="font-semibold">{formatINR(myPaidMinor)}</span>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">Your Personal Share:</span>
                <span className="font-semibold">{formatINR(myShareMinor)}</span>
              </div>
              {mySettledOutMinor > 0 && (
                <div className="space-y-1">
                  <span className="text-muted-foreground block text-[11px]">Settlements You Sent:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{formatINR(mySettledOutMinor)}</span>
                </div>
              )}
              {mySettledInMinor > 0 && (
                <div className="space-y-1">
                  <span className="text-muted-foreground block text-[11px]">Settlements You Received:</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">−{formatINR(mySettledInMinor)}</span>
                </div>
              )}
            </div>
            <div className="pt-2 border-t flex items-center justify-between font-medium">
              <span>Your Final Net Balance:</span>
              <span className={myNetMinor > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : myNetMinor < 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground'}>
                {myNetMinor > 0 ? `+${formatINR(myNetMinor)} (You get back)` : myNetMinor < 0 ? `−${formatINR(Math.abs(myNetMinor))} (You owe)` : '₹0.00 (All square)'}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 text-muted-foreground text-[11px] leading-relaxed">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
            <p>
              When you pay for a group bill, your own share of that bill is subtracted from what you spent, and any previous debts are automatically balanced.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
