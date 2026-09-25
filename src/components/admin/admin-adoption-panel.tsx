import { CheckCircle2, Flame, Layers, Users2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AdoptionSignals } from '@/lib/queries/admin';

export function AdminAdoptionPanel({ adoption }: { adoption: AdoptionSignals }) {
  const { groups, settlements, usersUsedSettleUp, totalUsers } = adoption;

  const totalGroups = groups.total || 1;
  const threePlusPct = Math.round((groups.withThreePlusMembers / totalGroups) * 100);
  const oneTwoPct = Math.round((groups.withOneOrTwoMembers / totalGroups) * 100);
  const emptyPct = Math.round((groups.empty / totalGroups) * 100);

  const totalSettlements = settlements.total || 1;
  const confirmedPct = Math.round((settlements.confirmed / totalSettlements) * 100);
  const disputedPct = Math.round((settlements.disputed / totalSettlements) * 100);
  const pendingPct = Math.max(0, 100 - confirmedPct - disputedPct);

  const settleUpAdoptionPct = totalUsers > 0 ? Math.round((usersUsedSettleUp / totalUsers) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="h-4 w-4" aria-hidden /> Feature adoption signals
        </CardTitle>
        <CardDescription>
          Engagement depth: group member density, settlement success rates, and settle-up penetration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Groups distribution */}
          <div className="space-y-2 rounded-xl border bg-card/60 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Users2 className="h-3.5 w-3.5" aria-hidden /> Group Density
              </span>
              <span className="text-xs font-semibold">{groups.total} groups</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span>3+ members</span>
                <span className="font-medium text-positive">
                  {groups.withThreePlusMembers} ({threePlusPct}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-positive rounded-full" style={{ width: `${threePlusPct}%` }} />
              </div>

              <div className="flex justify-between text-muted-foreground pt-1">
                <span>1–2 members</span>
                <span>{groups.withOneOrTwoMembers} ({oneTwoPct}%)</span>
              </div>

              <div className="flex justify-between text-muted-foreground">
                <span>Empty (0)</span>
                <span>{groups.empty} ({emptyPct}%)</span>
              </div>
            </div>
          </div>

          {/* Settlements ratio */}
          <div className="space-y-2 rounded-xl border bg-card/60 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Settlement Outcomes
              </span>
              <span className="text-xs font-semibold">{settlements.total} total</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span>Confirmed</span>
                <span className="font-medium text-positive">
                  {settlements.confirmed} ({confirmedPct}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${confirmedPct}%` }} />
              </div>

              <div className="flex justify-between text-muted-foreground pt-1">
                <span>Disputed</span>
                <span className={settlements.disputed > 0 ? 'text-destructive font-medium' : ''}>
                  {settlements.disputed} ({disputedPct}%)
                </span>
              </div>

              <div className="flex justify-between text-muted-foreground">
                <span>Pending / Unconfirmed</span>
                <span>{settlements.pendingOrUnconfirmed} ({pendingPct}%)</span>
              </div>
            </div>
          </div>

          {/* Settle-up adoption */}
          <div className="space-y-2 rounded-xl border bg-card/60 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Layers className="h-3.5 w-3.5" aria-hidden /> Settle-Up Adoption
              </span>
              <span className="text-xs font-semibold">{settleUpAdoptionPct}% users</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <p className="text-sm font-semibold">
                {usersUsedSettleUp} of {totalUsers} users
              </p>
              <p className="text-xs text-muted-foreground">
                have initiated or confirmed at least one settle-up transaction.
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted mt-2">
                <div className="h-full bg-primary rounded-full" style={{ width: `${settleUpAdoptionPct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
