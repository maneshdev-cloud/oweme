import { Handshake } from 'lucide-react';
import { requireUser } from '@/lib/supabase/server';
import { getFriends, getMySettlements } from '@/lib/queries/social';
import { getDashboard } from '@/lib/queries/core';
import { SettleUpHub } from '@/components/settle-up/settle-up-hub';
import { DashboardSettleUpButton } from '@/components/dashboard-settle-up-button';

export const metadata = { title: 'Settle up' };

export default async function SettleUpPage() {
  const user = await requireUser();
  const [friends, settlements, dashboard] = await Promise.all([
    getFriends(),
    getMySettlements(),
    getDashboard(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Handshake className="h-5 w-5 text-primary" aria-hidden />
            Settle up
          </h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Pay what you owe, record received money, and manage all settlement claims.
          </p>
        </div>
        <DashboardSettleUpButton friends={friends} label="Settle with a friend" />
      </div>

      <SettleUpHub
        friends={friends}
        settlements={settlements}
        waitingOnYou={dashboard.waitingOnYou}
        userId={user.id}
      />
    </div>
  );
}
