import Link from 'next/link';
import { ArrowRight, UsersRound, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { Amount } from '@/components/money';
import { CreateGroupDialog } from '@/components/groups/create-group-dialog';
import { getGroups, getFriends } from '@/lib/queries/social';
import { getAppSettings } from '@/lib/queries/core';
import { timeAgo } from '@/lib/utils';
import { toMinor } from '@/lib/money';

export const metadata = { title: 'Groups' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GroupsPage() {
  const [groups, friends, settings] = await Promise.all([getGroups(), getFriends(), getAppSettings()]);
  const disabled = settings.read_only_mode || !settings.expense_creation_enabled;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Groups</h2>
          <p className="text-sm text-muted-foreground">Trips, project teams, hostel floors — split evenly, settle fairly.</p>
        </div>
        <CreateGroupDialog friends={friends} disabled={disabled} />
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No groups yet"
          description="Start one for your project team or your next trip. Everyone sees the same running split, and OweMe works out who pays whom at the end."
          action={<CreateGroupDialog friends={friends} disabled={disabled} />}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.group_id}>
              <Link
                href={`/groups/${group.group_id}`}
                className="block rounded-2xl border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{group.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {group.member_count} member{group.member_count === 1 ? '' : 's'}
                      {group.role === 'owner' ? ' · you own it' : group.role === 'admin' ? ' · you’re admin' : ''} · active {timeAgo(group.last_activity_at)}
                    </p>
                  </div>
                  <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {toMinor(group.my_net) === 0 ? 'You’re square' : toMinor(group.my_net) > 0 ? 'To receive' : 'To give'}
                  </span>
                  <Amount minor={toMinor(group.my_net)} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card className="bg-secondary/60">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <p className="text-muted-foreground">
            Anyone can leave a group, but not while they still owe money in it — OweMe won’t let an open balance
            disappear into the void.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/history">
              See past records <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
