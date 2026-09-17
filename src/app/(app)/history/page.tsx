import { Archive, Download, ReceiptText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { Amount } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { HistoryFilters } from '@/components/history/history-filters';
import { ExportButtons } from '@/components/history/export-buttons';
import { getFriends, getGroups } from '@/lib/queries/social';
import { getHistory } from '@/lib/queries/history';
import { formatINR } from '@/lib/money';
import { formatDate } from '@/lib/utils';
import type { ExpenseStatus, HistoryFilters as Filters } from '@/lib/types';

export const metadata = { title: 'History' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

const STATUS_VALUES = ['settled', 'pending', 'disputed', 'cancelled'] as const;

function readFilters(params: Record<string, string | string[] | undefined>): Filters {
  const status = single(params.status);
  return {
    query: single(params.q),
    from: single(params.from),
    to: single(params.to),
    personId: single(params.person),
    groupId: single(params.group),
    status: (STATUS_VALUES as readonly string[]).includes(status ?? '') ? (status as Filters['status']) : undefined,
  };
}

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = readFilters(params);

  const [history, friends, groups] = await Promise.all([getHistory(filters), getFriends(), getGroups()]);

  const totals = [
    { label: 'To receive', value: history.totals.owedToYou, tone: 'positive' as const },
    { label: 'To give', value: history.totals.youOwe, tone: 'negative' as const },
    { label: 'Settled', value: history.totals.settled, tone: 'muted' as const },
    { label: 'Pending', value: history.totals.pending, tone: 'muted' as const },
    { label: 'Disputed', value: history.totals.disputed, tone: 'muted' as const },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">History</h2>
          <p className="text-sm text-muted-foreground">
            Everything you have been part of, in one place. Download it whenever you like — it’s your data.
          </p>
        </div>
        <ExportButtons />
      </div>

      <HistoryFilters
        initial={filters}
        friends={friends.map((friend) => ({ id: friend.friend_id, label: friend.full_name }))}
        groups={groups.map((group) => ({ id: group.group_id, label: group.name }))}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {totals.map((total) => (
          <Card key={total.label}>
            <CardContent className="space-y-1 p-3.5">
              <p className="text-xs text-muted-foreground">{total.label}</p>
              <p className="tabular text-base font-semibold">{formatINR(total.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="h-4 w-4" aria-hidden />
            {history.rows.length} record{history.rows.length === 1 ? '' : 's'}
            {filters.query || filters.from || filters.to || filters.personId || filters.groupId || filters.status ? (
              <span className="text-xs font-normal text-muted-foreground">· filtered</span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.rows.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Nothing here yet"
              description="Expenses, group splits and settle-ups you’re part of appear here — including anything moved to the archive."
            />
          ) : (
            <ul className="divide-y">
              {history.rows.map((row) => (
                <li key={`${row.source}-${row.kind}-${row.id}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.description}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(row.date)}
                      {row.counterpartyNames.length > 0 && ` · ${row.counterpartyNames.join(', ')}`}
                      {row.groupName && ` · ${row.groupName}`}
                      {row.source === 'archived' && (
                        <>
                          {' · '}
                          <span className="inline-flex items-center gap-1">
                            <Archive className="h-3 w-3" aria-hidden /> archived
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {row.direction === 'neutral' ? (
                      <span className="tabular text-sm font-medium">{formatINR(row.amount)}</span>
                    ) : (
                      <Amount minor={row.direction === 'you_owe' ? -row.amount : row.amount} />
                    )}
                    <StatusBadge status={(row.status === 'settled' ? 'CONFIRMED' : row.status) as ExpenseStatus} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Downloads are generated on the server from your own session: CSV and JSON today. A styled PDF (red/green
        totals, your name and date range) is deliberately left for a later version — see the README.
      </p>
    </div>
  );
}
