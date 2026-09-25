import Link from 'next/link';
import { ArrowRight, BellRing, ExternalLink, HandshakeIcon, MailWarning, ReceiptText, UserPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { Amount } from '@/components/money';
import { ExpenseCard } from '@/components/expense-card';
import { PersonAvatar } from '@/components/person-avatar';
import { StatusBadge } from '@/components/status-badge';
import { formatINR, toMinor } from '@/lib/money';
import { getUnsettledAgingText, isExpenseUnsettled } from '@/lib/nudge';
import { getAppSettings, getDashboard, getMyProfile } from '@/lib/queries/core';
import { getFriends } from '@/lib/queries/social';
import { sendFriendRequest } from '@/lib/actions/friends';
import { ReportIssueLink } from '@/components/report-issue-button';
import { AddExpenseButton } from '@/components/add-expense/add-expense-fab';
import { DashboardSettleUpButton } from '@/components/dashboard-settle-up-button';
import { DashboardWaitingCard } from '@/components/dashboard-waiting-card';

export const metadata = { title: 'Home' };

export default async function HomePage() {
  const [dashboard, profile, friends, settings] = await Promise.all([
    getDashboard(),
    getMyProfile(),
    getFriends(),
    getAppSettings(),
  ]);
  const firstName = profile?.full_name.split(' ')[0] ?? 'there';
  const { totals } = dashboard;
  const creationDisabled = settings.read_only_mode || !settings.expense_creation_enabled;

  return (
    <div className="space-y-6">
      <section aria-labelledby="summary-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="summary-heading" className="text-xl font-semibold tracking-tight">
              Hey {firstName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {totals.you_are_owed === 0 && totals.you_owe === 0
                ? 'You’re all square with everyone.'
                : 'Here’s where things stand right now.'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <AddExpenseButton
                friends={friends}
                variant="inline"
                size="sm"
                label="Add expense"
                disabled={creationDisabled}
              />
              <DashboardSettleUpButton
                friends={friends}
                balances={dashboard.balances}
                size="sm"
                variant="outline"
              />
            </div>
          </div>
          <a
            href="https://manesh.pages.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
          >
            <span>Built by</span>
            <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
          </a>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="bg-gradient-to-br from-primary/10 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">To receive</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular text-positive">{formatINR(toMinor(totals.you_are_owed))}</p>
              <div className="mt-2.5 space-y-0.5 border-t border-border/40 pt-2 text-xs text-muted-foreground">
                <p>Friends · <span className="font-medium text-foreground">{formatINR(toMinor(totals.friends_owed))}</span></p>
                <p>Groups · <span className="font-medium text-foreground">{formatINR(toMinor(totals.groups_owed))}</span></p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">To give</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular text-negative">{formatINR(toMinor(totals.you_owe))}</p>
              <div className="mt-2.5 space-y-0.5 border-t border-border/40 pt-2 text-xs text-muted-foreground">
                <p>Friends · <span className="font-medium text-foreground">{formatINR(toMinor(totals.friends_owe))}</span></p>
                <p>Groups · <span className="font-medium text-foreground">{formatINR(toMinor(totals.groups_owe))}</span></p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Needs your response</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular">{dashboard.needsResponseCount}</p>
              <div className="mt-2.5 border-t border-border/40 pt-2 text-xs text-muted-foreground">
                <p>
                  {dashboard.needsResponseCount > 0
                    ? `${dashboard.needsResponseCount} waiting on your response`
                    : 'Nothing needs your response'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {dashboard.waitingOnYou.length > 0 && (
        <section aria-labelledby="waiting-heading" className="space-y-3">
          <h2 id="waiting-heading" className="flex items-center gap-2 text-base font-semibold">
            <BellRing className="h-4 w-4 text-primary" aria-hidden />
            Did you receive these payments?
          </h2>
          <div className="space-y-2">
            {dashboard.waitingOnYou.map((item) => (
              <DashboardWaitingCard key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="balances-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="balances-heading" className="text-base font-semibold">
            Balances
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/friends">
              All friends <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {dashboard.balances.length === 0 ? (
          <EmptyState
            icon={HandshakeIcon}
            title="No open balances"
            description="Add an expense and OweMe keeps track of what to give and what to receive — you’ll never have to remember it yourself."
          />
        ) : (
          <ul className="space-y-2">
            {dashboard.balances.map((row) => {
              const cpExpenses = dashboard.openExpenses.filter(
                (e) => e.counterparty.id === row.counterparty.id && isExpenseUnsettled(e.status)
              );
              const oldestExp = cpExpenses.reduce<typeof cpExpenses[0] | null>(
                (oldest, curr) => (!oldest || new Date(curr.created_at) < new Date(oldest.created_at) ? curr : oldest),
                null
              );
              const nudge = oldestExp ? getUnsettledAgingText(oldestExp.created_at) : null;

              return (
                <li key={`${row.counterparty.id}-${row.currency}`}>
                  <Link
                    href={`/friends?friend=${row.counterparty.id}`}
                    className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 transition-colors hover:bg-accent/40"
                  >
                    <PersonAvatar person={row.counterparty} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{row.counterparty.full_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{row.balance > 0 ? 'To receive' : 'To give'}</span>
                        {nudge && (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            {nudge}
                          </span>
                        )}
                      </div>
                    </div>
                    <Amount minor={toMinor(row.balance)} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="activity-heading" className="space-y-3">
        <h2 id="activity-heading" className="flex items-center gap-2 text-base font-semibold">
          <ReceiptText className="h-4 w-4" aria-hidden />
          Recent activity
        </h2>

        {dashboard.recentActivity.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Nothing here yet"
            description="Your printouts, chai runs and ticket splits will show up here the moment you add one."
          />
        ) : (
          <div className="space-y-2">
            {dashboard.recentActivity.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                counterparty={expense.counterparty}
                youArePayer={expense.youArePayer}
              />
            ))}
          </div>
        )}
      </section>

      {dashboard.suggestions.length > 0 && (
        <section aria-labelledby="people-heading" className="space-y-3">
          <h2 id="people-heading" className="flex items-center gap-2 text-base font-semibold">
            <UserPlus className="h-4 w-4" aria-hidden />
            People on OweMe
          </h2>
          <ul className="space-y-2">
            {dashboard.suggestions.map((person) => (
              <li key={person.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
                <PersonAvatar person={person} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{person.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">@{person.username}</p>
                </div>
                {person.friendship_status === 'accepted' ? (
                  <span className="text-sm font-medium text-positive">Friends</span>
                ) : person.request_direction === 'outgoing' ? (
                  <span className="text-sm text-muted-foreground">Request sent</span>
                ) : person.request_direction === 'incoming' ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/notifications">Accept request</Link>
                  </Button>
                ) : (
                  <form
                    action={async () => {
                      'use server';
                      await sendFriendRequest({ addresseeId: person.id });
                    }}
                  >
                    <Button type="submit" size="sm" variant="outline">
                      Add friend
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <MailWarning className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Something wrong?</span>
        <ReportIssueLink />
      </div>
    </div>
  );
}
