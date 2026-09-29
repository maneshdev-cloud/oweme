import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calculator, ReceiptText, UsersRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Amount } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import { CategoryChip } from '@/components/category-chip';
import { StatusBadge } from '@/components/status-badge';
import { AddGroupExpenseDialog, EditGroupExpenseDialog } from '@/components/groups/add-group-expense-dialog';
import { GroupMemberActions } from '@/components/groups/group-member-actions';
import { DeleteGroupDialog } from '@/components/groups/delete-group-dialog';
import { SettleUpButton } from '@/components/settle-up-dialog';
import { TripSettledSummary } from '@/components/groups/trip-settled-summary';
import { requireUser } from '@/lib/supabase/server';
import { getGroupDetail } from '@/lib/queries/social';
import { getAppSettings } from '@/lib/queries/core';
import { formatINR, toMinor } from '@/lib/money';
import { minimizeTransfers } from '@/lib/settlement';
import { formatDateTime, isEdited, timeAgo } from '@/lib/utils';

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const [detail, settings] = await Promise.all([getGroupDetail(id), getAppSettings()]);
  if (!detail) notFound();

  const { group, members, expenses, settlements } = detail;
  const me = members.find((member) => member.user_id === user.id);
  const isOwner = me?.role === 'owner';
  const isAdmin = me?.role === 'admin';
  const isAdminOrOwner = isOwner || isAdmin;
  const hasOtherAdminOrOwner = members.some(
    (member) => member.user_id !== user.id && (member.role === 'owner' || member.role === 'admin')
  );
  const disabled = settings.read_only_mode || !settings.expense_creation_enabled;

  // Minimised settle-up plan for the whole group (pure function, unit tested).
  const netTotal = members.reduce((sum, member) => sum + toMinor(member.net), 0);
  const plan = netTotal === 0 ? minimizeTransfers(members.map((member) => ({ userId: member.user_id, amount: toMinor(member.net) }))) : [];
  const myPayments = plan.filter((transfer) => transfer.from === user.id || transfer.to === user.id);

  // Group is fully settled when all members have 0 net balance and there are real group expenses
  const isFullySettled =
    members.length > 0 &&
    expenses.length > 0 &&
    members.every((member) => toMinor(member.net) === 0);

  const totalGroupSpendMinor = expenses
    .filter((e) => e.status !== 'CANCELLED')
    .reduce((sum, e) => sum + toMinor(e.amount), 0);

  // Reuse existing settlement-minimization output on historical unbalances to show the settled transfer list
  const tripTransfers = isFullySettled
    ? minimizeTransfers(
        members.map((member) => ({
          userId: member.user_id,
          amount: toMinor(member.paid) - toMinor(member.share),
        }))
      )
    : [];

  const nameOf = (userId: string) =>
    members.find((member) => member.user_id === userId)?.profile.full_name.split(' ')[0] ?? 'Someone';

  return (
    <div className="space-y-5">
      <Link href="/groups" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All groups
      </Link>

      {isFullySettled && (
        <TripSettledSummary
          groupName={group.name}
          totalGroupSpendMinor={totalGroupSpendMinor}
          members={members}
          transfers={tripTransfers}
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{group.name}</h2>
          {group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {isAdminOrOwner && (
            <DeleteGroupDialog
              groupId={group.id}
              groupName={group.name}
              members={members}
            />
          )}
          <AddGroupExpenseDialog
            groupId={group.id}
            members={members}
            currentUserId={user.id}
            disabled={disabled}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersRound className="h-4 w-4" aria-hidden /> Who’s in
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {members.map((member) => (
            <div key={member.user_id} className="flex items-center gap-3 rounded-xl px-1 py-2">
              <PersonAvatar person={member.profile} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.profile.full_name}
                  {member.user_id === user.id && <span className="text-muted-foreground"> (you)</span>}
                  {member.role === 'owner' && (
                    <Badge variant="secondary" className="ml-2 align-middle text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400">
                      owner
                    </Badge>
                  )}
                  {member.role === 'admin' && (
                    <Badge variant="secondary" className="ml-2 align-middle text-[10px] border-primary/30 text-primary">
                      admin
                    </Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  paid {formatINR(toMinor(member.paid))} · share {formatINR(toMinor(member.share))}
                </p>
              </div>
              <div className="text-right">
                <Amount minor={toMinor(member.net)} />
                <p className="text-[11px] text-muted-foreground">
                  {toMinor(member.net) > 0 ? 'gets back' : toMinor(member.net) < 0 ? 'owes' : 'square'}
                </p>
              </div>
              <GroupMemberActions
                groupId={group.id}
                groupName={group.name}
                member={member}
                isOwner={isOwner}
                currentUserRole={me?.role}
                isMe={member.user_id === user.id}
                memberCount={members.length}
                hasOtherAdminOrOwner={hasOtherAdminOrOwner}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {myPayments.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" aria-hidden /> Settle up plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1.5 text-sm">
              {myPayments.map((transfer, index) => (
                <li key={index} className="flex items-center justify-between tabular">
                  <span>
                    {transfer.from === user.id ? (
                      <>You pay {nameOf(transfer.to)}</>
                    ) : (
                      <>{nameOf(transfer.from)} pays you</>
                    )}
                  </span>
                  <span className="font-medium">{formatINR(transfer.amount)}</span>
                </li>
              ))}
            </ul>
            <Separator />
            <p className="text-xs text-muted-foreground">
              OweMe works out the fewest payments that clear everybody — not one transfer per expense.
            </p>
            {myPayments
              .filter((transfer) => transfer.from === user.id)
              .map((transfer, index) => {
                const person = members.find((member) => member.user_id === transfer.to);
                if (!person) return null;
                return (
                  <SettleUpButton
                    key={index}
                    person={person.profile}
                    balanceMinor={-transfer.amount}
                    groupId={group.id}
                    trigger={
                      <button className="text-sm text-primary underline-offset-4 hover:underline">
                        Record the {formatINR(transfer.amount)} → {person.profile.full_name.split(' ')[0]}
                      </button>
                    }
                  />
                );
              })}
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="group-expenses" className="space-y-3">
        <h2 id="group-expenses" className="flex items-center gap-2 text-base font-semibold">
          <ReceiptText className="h-4 w-4" aria-hidden /> Group expenses
        </h2>

        {expenses.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No expenses yet. Add the first one and everybody sees their share straight away.
          </p>
        ) : (
          <ul className="space-y-2">
            {expenses.map((expense) => (
              <li key={expense.id}>
                <Card className={expense.status === 'CANCELLED' ? 'opacity-70' : undefined}>
                  <CardContent className="space-y-2 p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">
                            {expense.description}
                          </p>
                          <CategoryChip category={expense.category} className="align-middle" />
                          {isEdited(expense.created_at, expense.updated_at) && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 font-normal border-muted-foreground/30 text-muted-foreground"
                              title={`Edited on ${expense.updated_at ? formatDateTime(expense.updated_at) : ''}`}
                            >
                              Edited
                            </Badge>
                          )}
                        </div>
                        {expense.payers && expense.payers.length > 1 ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {expense.payers.length} people paid {formatINR(toMinor(expense.amount))} (
                            {expense.payers
                              .map((p) => `${nameOf(p.user_id)} ${formatINR(toMinor(p.paid_amount))}`)
                              .join(', ')}
                            ) · <span title={formatDateTime(expense.created_at)}>{timeAgo(expense.created_at)}</span>
                          </p>
                        ) : (
                          <p className="truncate text-xs text-muted-foreground">
                            {nameOf(expense.paid_by)} paid {formatINR(toMinor(expense.amount))} ·{' '}
                            <span title={formatDateTime(expense.created_at)}>{timeAgo(expense.created_at)}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isOwner && expense.status !== 'CANCELLED' && (
                          <EditGroupExpenseDialog
                            groupId={group.id}
                            members={members}
                            currentUserId={user.id}
                            expense={expense}
                            disabled={disabled}
                          />
                        )}
                        <StatusBadge status={expense.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">Shares:</span>
                      {expense.shares.map((share) => (
                        <span key={share.user_id}>
                          {nameOf(share.user_id)}: {formatINR(toMinor(share.share_amount))}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settlements.length > 0 && (
        <section aria-labelledby="group-settlements" className="space-y-3">
          <h2 id="group-settlements" className="text-base font-semibold">
            Payments recorded
          </h2>
          <ul className="space-y-2">
            {settlements.map((settlement) => (
              <li key={settlement.id} className="flex items-center justify-between rounded-2xl border p-3.5 text-sm">
                <span>
                  {nameOf(settlement.payer_id)} → {nameOf(settlement.receiver_id)}
                  <span className="ml-2 text-xs text-muted-foreground">{timeAgo(settlement.created_at)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular font-medium">{formatINR(toMinor(settlement.amount))}</span>
                  <StatusBadge
                    status={
                      settlement.status === 'CONFIRMED'
                        ? 'CONFIRMED'
                        : settlement.status === 'DISPUTED'
                          ? 'DISPUTED'
                          : settlement.status === 'CANCELLED'
                            ? 'CANCELLED'
                            : 'PENDING'
                    }
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
