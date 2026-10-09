'use client';

import { useState, useMemo } from 'react';
import { ReceiptText, Calendar, User, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CategoryChip } from '@/components/category-chip';
import { StatusBadge } from '@/components/status-badge';
import { EditGroupExpenseDialog } from '@/components/groups/add-group-expense-dialog';
import { DeleteGroupExpenseDialog } from '@/components/groups/delete-group-expense-dialog';
import { formatINR, toMinor } from '@/lib/money';
import { formatDateTime, isEdited, timeAgo } from '@/lib/utils';
import type { GroupExpense, GroupMemberRow } from '@/lib/types';

type FilterTab = 'all' | 'active' | 'cancelled';

export function GroupExpensesSection({
  groupId,
  members,
  currentUserId,
  expenses,
  isAdminOrOwner,
  disabled,
}: {
  groupId: string;
  members: GroupMemberRow[];
  currentUserId: string;
  expenses: GroupExpense[];
  isAdminOrOwner: boolean;
  disabled?: boolean;
}) {
  const [tab, setTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.user_id, m.profile.full_name);
    }
    return map;
  }, [members]);

  const nameOf = (userId: string) => {
    if (userId === currentUserId) return 'You';
    const m = members.find((member) => member.user_id === userId);
    return m ? m.profile.full_name.split(' ')[0] : 'Someone';
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      // Tab filter
      if (tab === 'active' && e.status === 'CANCELLED') return false;
      if (tab === 'cancelled' && e.status !== 'CANCELLED') return false;

      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const descMatch = e.description.toLowerCase().includes(query);
        const catMatch = e.category.toLowerCase().includes(query);
        const payerName = e.paid_by === currentUserId ? 'You' : (memberNameMap.get(e.paid_by) ?? 'Someone');
        const creatorName = e.created_by === currentUserId ? 'You' : (memberNameMap.get(e.created_by) ?? 'Someone');
        const payerMatch = payerName.toLowerCase().includes(query);
        const creatorMatch = creatorName.toLowerCase().includes(query);
        return descMatch || catMatch || payerMatch || creatorMatch;
      }
      return true;
    });
  }, [expenses, tab, search, currentUserId, memberNameMap]);

  const activeCount = useMemo(() => expenses.filter((e) => e.status !== 'CANCELLED').length, [expenses]);
  const cancelledCount = useMemo(() => expenses.filter((e) => e.status === 'CANCELLED').length, [expenses]);

  return (
    <section aria-labelledby="group-expenses-heading" className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <h2 id="group-expenses-heading" className="flex items-center gap-2 text-base font-semibold">
          <ReceiptText className="h-4 w-4" aria-hidden />
          <span>Group expenses ({expenses.length})</span>
        </h2>

        {expenses.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  tab === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({expenses.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('active')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  tab === 'active' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Active ({activeCount})
              </button>
              {cancelledCount > 0 && (
                <button
                  type="button"
                  onClick={() => setTab('cancelled')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    tab === 'cancelled' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Cancelled ({cancelledCount})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {expenses.length > 4 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by description, category, or member name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      )}

      {filteredExpenses.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">No expenses found</p>
          <p className="text-xs">
            {expenses.length === 0
              ? 'Add the first expense and everybody sees their share straight away.'
              : 'Try clearing your search or filter tab.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filteredExpenses.map((expense) => {
            // Calculate personal impact on the current user
            const myPaidMinor = expense.payers && expense.payers.length > 0
              ? toMinor(expense.payers.find((p) => p.user_id === currentUserId)?.paid_amount ?? 0)
              : expense.paid_by === currentUserId
                ? toMinor(expense.amount)
                : 0;

            const myShareMinor = toMinor(
              expense.shares.find((s) => s.user_id === currentUserId)?.share_amount ?? 0
            );

            const isCancelled = expense.status === 'CANCELLED';
            const personalImpact = myPaidMinor - myShareMinor;
            const canManage = (isAdminOrOwner || expense.created_by === currentUserId);

            return (
              <li key={expense.id}>
                <Card className={`transition-all ${isCancelled ? 'opacity-65 border-dashed bg-muted/20' : 'hover:border-primary/30'}`}>
                  <CardContent className="space-y-2.5 p-3.5">
                    {/* Top Row: Description, Category, Personal Impact, Actions */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`truncate font-medium text-sm ${isCancelled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {expense.description}
                          </p>
                          <CategoryChip category={expense.category} className="align-middle text-[11px]" />

                          {isEdited(expense.created_at, expense.updated_at) && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 font-normal border-muted-foreground/30 text-muted-foreground"
                              title={`Edited on ${expense.updated_at ? formatDateTime(expense.updated_at) : ''}`}
                            >
                              Edited
                            </Badge>
                          )}

                          {/* Personal Impact Badge */}
                          {!isCancelled ? (
                            personalImpact > 0 ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0 font-medium">
                                +{formatINR(personalImpact)} you get back
                              </Badge>
                            ) : personalImpact < 0 ? (
                              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0 font-medium">
                                −{formatINR(Math.abs(personalImpact))} you owe
                              </Badge>
                            ) : myShareMinor > 0 ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                                Your share paid
                              </Badge>
                            ) : null
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground border-dashed">
                              Cancelled (No balance impact)
                            </Badge>
                          )}
                        </div>

                        {/* Who Paid and Total Bill */}
                        {expense.payers && expense.payers.length > 1 ? (
                          <p className="text-xs text-muted-foreground">
                            {expense.payers.length} people paid <strong className="text-foreground">{formatINR(toMinor(expense.amount))}</strong> (
                            {expense.payers
                              .map((p) => `${nameOf(p.user_id)} ${formatINR(toMinor(p.paid_amount))}`)
                              .join(', ')}
                            )
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            <strong>{nameOf(expense.paid_by)}</strong> paid <strong className="text-foreground">{formatINR(toMinor(expense.amount))}</strong>
                          </p>
                        )}

                        {/* Full Audit Metadata: Added by [Person] on [Date and Time] */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground pt-0.5">
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground/70" />
                            Added by <strong className="font-medium text-foreground/80">{nameOf(expense.created_by)}</strong>
                          </span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1" title={formatDateTime(expense.created_at)}>
                            <Calendar className="h-3 w-3 text-muted-foreground/70" />
                            {formatDateTime(expense.created_at)} ({timeAgo(expense.created_at)})
                          </span>
                        </div>
                      </div>

                      {/* Right side: Amount and Manage Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {canManage && !isCancelled && (
                          <EditGroupExpenseDialog
                            groupId={groupId}
                            members={members}
                            currentUserId={currentUserId}
                            expense={expense}
                            disabled={disabled}
                          />
                        )}

                        {canManage && (
                          <DeleteGroupExpenseDialog expense={expense} />
                        )}

                        <StatusBadge status={isCancelled ? 'CANCELLED' : 'PENDING'} />
                      </div>
                    </div>

                    {/* Bottom Row: Detailed Shares Breakdown */}
                    <div className="rounded-lg bg-muted/40 p-2 text-xs border border-border/40 space-y-1">
                      <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                        <span className="font-medium text-foreground/80">Split breakdown:</span>
                        <span>{expense.shares.length} participant{expense.shares.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {expense.shares.map((share) => {
                          const isMe = share.user_id === currentUserId;
                          return (
                            <span
                              key={share.user_id}
                              className={`rounded px-1.5 py-0.5 ${
                                isMe ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'
                              }`}
                            >
                              {nameOf(share.user_id)}: {formatINR(toMinor(share.share_amount))}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
