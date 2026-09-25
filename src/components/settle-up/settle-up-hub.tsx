'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, Clock, Handshake } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PersonAvatar } from '@/components/person-avatar';
import { StatusBadge } from '@/components/status-badge';
import { SettleUpDialog } from '@/components/settle-up-dialog';
import { SettlementActions } from '@/components/settlement-actions';
import { DashboardWaitingCard } from '@/components/dashboard-waiting-card';
import { formatINR, toMinor } from '@/lib/money';
import { timeAgo } from '@/lib/utils';
import type { DashboardWaitingItem, FriendRow, Person } from '@/lib/types';
import type { SettlementItemView } from '@/lib/queries/social';

export function SettleUpHub({
  friends,
  settlements,
  waitingOnYou = [],
  userId,
}: {
  friends: FriendRow[];
  settlements: SettlementItemView[];
  waitingOnYou?: DashboardWaitingItem[];
  userId?: string;
}) {
  const [selectedFriend, setSelectedFriend] = useState<{ person: Person; balanceMinor: number } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed'>('all');

  // Categorize friends by balance
  const friendsYouOwe = friends.filter((f) => f.balance < 0);
  const friendsWhoOweYou = friends.filter((f) => f.balance > 0);
  const allSettled = friends.every((f) => f.balance === 0);

  // Totals
  const totalYouOweMinor = friendsYouOwe.reduce((sum, f) => sum + Math.abs(toMinor(f.balance)), 0);
  const totalYouAreOwedMinor = friendsWhoOweYou.reduce((sum, f) => sum + toMinor(f.balance), 0);

  // Outgoing pending settlement claims (you paid, waiting for recipient to confirm)
  const outgoingPendingClaims = settlements.filter(
    (s) => s.isPayer && (s.settlement.status === 'PENDING' || s.settlement.status === 'DISPUTED'),
  );

  // Filtered settlements list
  const filteredSettlements = settlements.filter((s) => {
    if (statusFilter === 'pending') {
      return s.settlement.status === 'PENDING' || s.settlement.status === 'DISPUTED';
    }
    if (statusFilter === 'confirmed') {
      return s.settlement.status === 'CONFIRMED';
    }
    return true;
  });

  const handleOpenSettle = (friend: FriendRow) => {
    setSelectedFriend({
      person: {
        id: friend.friend_id,
        full_name: friend.full_name,
        username: friend.username,
        avatar_url: friend.avatar_url,
      },
      balanceMinor: toMinor(friend.balance),
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Overview Metric Tiles */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-negative/20 bg-gradient-to-br from-card to-negative/5">
          <CardContent className="space-y-1.5 p-4 sm:p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Total you need to give</span>
              <ArrowUpRight className="h-4 w-4 text-negative" />
            </div>
            <p className="tabular text-2xl font-bold text-negative sm:text-3xl">
              {formatINR(totalYouOweMinor)}
            </p>
            <p className="text-xs text-muted-foreground">
              {friendsYouOwe.length === 0
                ? 'You don’t owe anything to anyone.'
                : `Across ${friendsYouOwe.length} friend${friendsYouOwe.length > 1 ? 's' : ''}.`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-positive/20 bg-gradient-to-br from-card to-positive/5">
          <CardContent className="space-y-1.5 p-4 sm:p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Total you need to receive</span>
              <ArrowDownLeft className="h-4 w-4 text-positive" />
            </div>
            <p className="tabular text-2xl font-bold text-positive sm:text-3xl">
              {formatINR(totalYouAreOwedMinor)}
            </p>
            <p className="text-xs text-muted-foreground">
              {friendsWhoOweYou.length === 0
                ? 'Nobody owes you anything right now.'
                : `From ${friendsWhoOweYou.length} friend${friendsWhoOweYou.length > 1 ? 's' : ''}.`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 1. Incoming Payments Waiting on You (Top Priority) */}
      {waitingOnYou.length > 0 && (
        <section aria-labelledby="waiting-on-you-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h3 id="waiting-on-you-heading" className="text-base font-semibold tracking-tight">
              Did you receive these payments? ({waitingOnYou.length})
            </h3>
          </div>
          <div className="space-y-2">
            {waitingOnYou.map((item) => (
              <DashboardWaitingCard key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* 2. Outgoing Payment Claims You Sent (Waiting for Counterparty) */}
      {outgoingPendingClaims.length > 0 && (
        <section aria-labelledby="outgoing-pending-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <h3 id="outgoing-pending-heading" className="text-base font-semibold tracking-tight">
              Payment claims you sent ({outgoingPendingClaims.length})
            </h3>
          </div>
          <div className="space-y-2.5">
            {outgoingPendingClaims.map(({ settlement, receiver, groupName }) => (
              <Card key={settlement.id} className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <PersonAvatar person={receiver} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          You sent{' '}
                          <span className="font-bold text-negative">{formatINR(toMinor(settlement.amount))}</span> to{' '}
                          <span className="font-semibold">{receiver.full_name}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Waiting for them to confirm receipt. You can cancel if sent mistakenly.
                          {groupName && ` · Group: ${groupName}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <SettlementActions
                        settlementId={settlement.id}
                        status={settlement.status}
                        youArePayer={true}
                        youAreReceiver={false}
                      />
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/settlements/${settlement.id}`}>
                          Details <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Active Balances: Who to Settle With */}
      <section aria-labelledby="balances-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="balances-heading" className="text-base font-semibold tracking-tight">
            Balances to settle
          </h3>
          <span className="text-xs text-muted-foreground">
            {friends.filter((f) => f.balance !== 0).length} open balances
          </span>
        </div>

        {allSettled ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-positive/10 text-positive">
                <BadgeCheck className="h-6 w-6" />
              </span>
              <p className="mt-3 font-semibold">All settled up!</p>
              <p className="max-w-sm text-xs text-muted-foreground mt-1">
                You don&apos;t have any outstanding money to give or receive with your friends.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {friends
              .filter((f) => f.balance !== 0)
              .map((friend) => {
                const minor = toMinor(friend.balance);
                const youOweThem = minor < 0;
                return (
                  <Card key={friend.friend_id} className="transition-colors hover:border-primary/40">
                    <CardContent className="flex items-center justify-between p-3.5 sm:p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <PersonAvatar
                          person={{
                            id: friend.friend_id,
                            full_name: friend.full_name,
                            username: friend.username,
                            avatar_url: friend.avatar_url,
                          }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{friend.full_name}</p>
                          <p
                            className={`text-xs font-semibold ${
                              youOweThem ? 'text-negative' : 'text-positive'
                            }`}
                          >
                            {youOweThem ? `You owe ${formatINR(Math.abs(minor))}` : `Owes you ${formatINR(minor)}`}
                          </p>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={youOweThem ? 'default' : 'outline'}
                        onClick={() => handleOpenSettle(friend)}
                        className="gap-1.5 shrink-0 text-xs"
                      >
                        <Handshake className="h-3.5 w-3.5" />
                        {youOweThem ? 'Pay now' : 'Record paid'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}
      </section>

      {/* Settlement History / Activity */}
      <section aria-labelledby="history-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="history-heading" className="text-base font-semibold tracking-tight">
            Settlement records
          </h3>
          <div className="flex items-center gap-1 rounded-xl border bg-muted/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                statusFilter === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                statusFilter === 'pending' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Pending
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('confirmed')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                statusFilter === 'confirmed' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Settled
            </button>
          </div>
        </div>

        {filteredSettlements.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No settlement records found for this filter.
          </p>
        ) : (
          <div className="space-y-2">
            {filteredSettlements.map(({ settlement, payer, receiver, groupName, isPayer }) => (
              <Card key={settlement.id} className="transition-colors hover:border-primary/30">
                <CardContent className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <PersonAvatar person={isPayer ? receiver : payer} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium">
                          {isPayer ? (
                            <>
                              Paid to <span className="font-semibold">{receiver.full_name}</span>
                            </>
                          ) : (
                            <>
                              Received from <span className="font-semibold">{payer.full_name}</span>
                            </>
                          )}
                        </p>
                        {groupName && (
                          <Badge variant="outline" className="hidden text-[10px] sm:inline-flex">
                            {groupName}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {settlement.created_at ? timeAgo(settlement.created_at) : 'Recently'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="tabular font-semibold text-sm">
                        {formatINR(toMinor(settlement.amount))}
                      </p>
                      <StatusBadge status={settlement.status} className="mt-0.5 text-[10px]" />
                    </div>

                    <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0">
                      <Link href={`/settlements/${settlement.id}`} aria-label="View settlement details">
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Settle Up Dialog */}
      {selectedFriend && (
        <SettleUpDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          person={selectedFriend.person}
          balanceMinor={selectedFriend.balanceMinor}
        />
      )}
    </div>
  );
}

export default SettleUpHub;
