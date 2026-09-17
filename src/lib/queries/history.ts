import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Expense, HistoryExport, HistoryFilters, HistoryRow, Settlement } from '@/lib/types';
import { toMinor } from '@/lib/money';

/**
 * History = every live record you are part of, plus anything already moved to
 * cold storage that you had a hand in.
 *
 * Search, date range, person and status filters are applied in SQL so a student
 * with three years of chai receipts never downloads all of it to filter locally.
 */
export async function getHistory(filters: HistoryFilters = {}): Promise<HistoryExport> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rows: HistoryRow[] = [];
  if (!user) {
    return emptyHistory(filters);
  }

  // ---- live 1:1 expenses ---------------------------------------------------
  let expenseQuery = supabase
    .from('expenses')
    .select('*, payer:payer_id(id, full_name, username, avatar_url), debtor:debtor_id(id, full_name, username, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (filters.from) expenseQuery = expenseQuery.gte('created_at', filters.from);
  if (filters.to) expenseQuery = expenseQuery.lte('created_at', `${filters.to}T23:59:59.999Z`);
  if (filters.query) expenseQuery = expenseQuery.ilike('description', `%${filters.query}%`);
  if (filters.personId) {
    expenseQuery = expenseQuery.or(`payer_id.eq.${filters.personId},debtor_id.eq.${filters.personId}`);
  }
  if (filters.status === 'settled') expenseQuery = expenseQuery.eq('status', 'CONFIRMED');
  if (filters.status === 'pending') expenseQuery = expenseQuery.in('status', ['PENDING', 'PAYMENT_MARKED']);
  if (filters.status === 'disputed') expenseQuery = expenseQuery.eq('status', 'DISPUTED');
  if (filters.status === 'cancelled') expenseQuery = expenseQuery.eq('status', 'CANCELLED');

  // A group filter is a statement about groups: your private 1:1 records are
  // not part of that story, so they stay out of it.
  const { data: expenses } = filters.groupId ? { data: [] } : await expenseQuery;
  type PersonJoin = { id: string; full_name: string; username: string; avatar_url: string | null };
  type ExpenseWithPeople = Expense & { payer: PersonJoin | null; debtor: PersonJoin | null };

  for (const expense of (expenses ?? []) as ExpenseWithPeople[]) {
    const youArePayer = expense.payer_id === user.id;
    const counterparty = youArePayer ? expense.debtor : expense.payer;
    rows.push({
      kind: 'expense',
      id: expense.id,
      date: expense.created_at,
      description: expense.description,
      amount: toMinor(expense.amount),
      currency: expense.currency,
      status: expense.status,
      direction: youArePayer ? 'you_paid' : 'you_owe',
      counterpartyNames: counterparty ? [counterparty.full_name] : [],
      groupName: null,
      source: 'live',
    });
  }

  // ---- live settlements ----------------------------------------------------
  let settlementQuery = supabase
    .from('settlements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (filters.from) settlementQuery = settlementQuery.gte('created_at', filters.from);
  if (filters.to) settlementQuery = settlementQuery.lte('created_at', `${filters.to}T23:59:59.999Z`);
  if (filters.personId) {
    settlementQuery = settlementQuery.or(`payer_id.eq.${filters.personId},receiver_id.eq.${filters.personId}`);
  }
  if (filters.status === 'settled') settlementQuery = settlementQuery.eq('status', 'CONFIRMED');
  if (filters.status === 'pending') settlementQuery = settlementQuery.in('status', ['PENDING']);
  if (filters.status === 'disputed') settlementQuery = settlementQuery.eq('status', 'DISPUTED');
  if (filters.status === 'cancelled') settlementQuery = settlementQuery.eq('status', 'CANCELLED');

  const { data: settlements } = await settlementQuery;
  // Settlements have one fixed description; a search only keeps them when the
  // search is actually about settling up.
  const searchCoversSettlements = !filters.query || 'settle up'.includes(filters.query.trim().toLowerCase());
  const settlementRows = searchCoversSettlements ? ((settlements ?? []) as Settlement[]) : [];

  // ---- group expenses (names resolved separately, groups are small) --------
  let groupExpenseQuery = supabase
    .from('group_expenses')
    .select('*, groups(name)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (filters.from) groupExpenseQuery = groupExpenseQuery.gte('created_at', filters.from);
  if (filters.to) groupExpenseQuery = groupExpenseQuery.lte('created_at', `${filters.to}T23:59:59.999Z`);
  if (filters.query) groupExpenseQuery = groupExpenseQuery.ilike('description', `%${filters.query}%`);
  if (filters.groupId) groupExpenseQuery = groupExpenseQuery.eq('group_id', filters.groupId);

  const { data: groupExpenses } = await groupExpenseQuery;

  // Group expenses have no per-person status of their own, so a "settled" or
  // "disputed" filter should not silently list them.
  const groupStatusAllowed =
    !filters.status || filters.status === 'pending' || filters.status === 'cancelled';
  const groupExpenseIdsForPerson = filters.personId ? await groupExpenseIdsPaidByOrSharedWith(filters.personId) : null;
  const groupRows = (groupExpenses ?? []) as Array<{
    id: string;
    group_id: string;
    paid_by: string;
    amount: number;
    currency: string;
    description: string;
    status: 'PENDING' | 'CANCELLED';
    created_at: string;
    groups: { name: string } | null;
  }>;
  for (const expense of groupRows) {
    if (!groupStatusAllowed) continue;
    if (groupExpenseIdsForPerson && !groupExpenseIdsForPerson.has(expense.id)) continue;
    rows.push({
      kind: 'group_expense',
      id: expense.id,
      date: expense.created_at,
      description: expense.description,
      amount: toMinor(expense.amount),
      currency: expense.currency,
      status: expense.status,
      direction: 'neutral',
      counterpartyNames: [],
      groupName: expense.groups?.name ?? null,
      source: 'live',
    });
  }

  // ---- archived (cold storage) records you were part of --------------------
  const archivedRows = await getArchivedRows(filters);
  rows.push(...archivedRows);
  for (const settlement of settlementRows) {
    if (filters.status === 'cancelled' && settlement.status !== 'CANCELLED') continue;
    if (filters.status === 'settled' && settlement.status !== 'CONFIRMED') continue;
    if (filters.status === 'pending' && settlement.status !== 'PENDING') continue;
    if (filters.status === 'disputed' && settlement.status !== 'DISPUTED') continue;
    if (filters.groupId && settlement.group_id !== filters.groupId) continue;

    const youPaid = settlement.payer_id === user.id;
    rows.push({
      kind: 'settlement',
      id: settlement.id,
      date: settlement.created_at,
      description: 'Settle up',
      amount: toMinor(settlement.amount),
      currency: settlement.currency,
      status: settlement.status,
      direction: youPaid ? 'you_paid_out' : 'you_received',
      counterpartyNames: [],
      groupName: null,
      source: 'live',
    });
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1));

  const totals = {
    owedToYou: 0,
    youOwe: 0,
    settled: 0,
    pending: 0,
    disputed: 0,
  };
  for (const row of rows) {
    if (row.status === 'CONFIRMED' || row.status === 'settled') totals.settled += row.amount;
    else if (row.status === 'DISPUTED') totals.disputed += row.amount;
    else if (row.status === 'CANCELLED') continue;
    else totals.pending += row.amount;

    if (row.direction === 'you_paid' || row.direction === 'you_paid_out') totals.owedToYou += row.amount;
    if (row.direction === 'you_owe') totals.youOwe += row.amount;
  }

  return {
    generatedAt: new Date().toISOString(),
    range: { from: filters.from ?? null, to: filters.to ?? null },
    filters,
    totals,
    rows,
  };
}

/**
 * Which group expenses a person is involved in — either they paid, or they hold
 * a share. Used only when a person filter is active, so the common path costs
 * nothing extra.
 */
async function groupExpenseIdsPaidByOrSharedWith(personId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const [paid, shares] = await Promise.all([
    supabase.from('group_expenses').select('id').eq('paid_by', personId).limit(500),
    supabase.from('group_expense_shares').select('group_expense_id').eq('user_id', personId).limit(1000),
  ]);

  return new Set<string>([
    ...((paid.data ?? []) as Array<{ id: string }>).map((row) => row.id),
    ...((shares.data ?? []) as Array<{ group_expense_id: string }>).map((row) => row.group_expense_id),
  ]);
}

/**
 * Archived records you were a participant in. They are read-only by design —
 * the whole point of the archive is that the numbers can no longer change.
 */
async function getArchivedRows(filters: HistoryFilters): Promise<HistoryRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from('archived_records')
    .select('id, kind, original_id, snapshot, archived_at')
    .order('archived_at', { ascending: false })
    .limit(500);

  if (filters.from) query = query.gte('archived_at', filters.from);
  if (filters.to) query = query.lte('archived_at', `${filters.to}T23:59:59.999Z`);
  if (filters.query) query = query.ilike('snapshot->expense->>description', `%${filters.query}%`);
  // `participant_ids` is a real uuid[] column, so this stays an index-friendly
  // database filter rather than a JSON scan.
  if (filters.personId) query = query.contains('participant_ids', [filters.personId]);

  const { data } = await query;
  type ArchivedExpense = {
    description?: string;
    amount?: string | number;
    currency?: string;
    status?: string;
    created_at?: string;
  };
  type Snapshot = { expense?: ArchivedExpense; group_expense?: ArchivedExpense; settlement?: ArchivedExpense; group_id?: string; group_name?: string };
  type ArchivedRow = { id: string; kind: string; original_id: string; snapshot: Snapshot | null; archived_at: string };

  return ((data ?? []) as ArchivedRow[])
    .map((record) => ({
      record,
      // An archived 1:1 expense, group expense or settlement all keep their
      // original row under a different key inside the snapshot.
      expense: (record.snapshot?.expense ?? record.snapshot?.group_expense ?? record.snapshot?.settlement ?? {}) as ArchivedExpense,
    }))
    // Archived rows honour the same filters as live ones, so a "settled only"
    // download never quietly includes something else.
    .filter(({ record, expense }) => {
      if (filters.groupId && record.snapshot?.group_id !== filters.groupId) return false;
      const status = String(expense.status ?? 'CONFIRMED');
      if (filters.status === 'settled' && status !== 'CONFIRMED') return false;
      if (filters.status === 'disputed' && status !== 'DISPUTED') return false;
      if (filters.status === 'cancelled' && status !== 'CANCELLED') return false;
      if (filters.status === 'pending' && status !== 'PENDING' && status !== 'PAYMENT_MARKED') return false;
      return true;
    })
    .map(({ record, expense }) => ({
      kind: record.kind === 'expense' ? 'archived_expense' : (record.kind as HistoryRow['kind']),
      id: record.original_id,
      date: expense.created_at ?? record.archived_at,
      description: `${expense.description ?? 'Settle up'} (archived)`,
      amount: toMinor(expense.amount ?? 0),
      currency: expense.currency ?? 'INR',
      status: expense.status ?? 'CONFIRMED',
      direction: 'neutral',
      counterpartyNames: [],
      groupName: record.snapshot?.group_name ?? null,
      source: 'archived',
    }) satisfies HistoryRow);
}

function emptyHistory(filters: HistoryFilters): HistoryExport {
  return {
    generatedAt: new Date().toISOString(),
    range: { from: filters.from ?? null, to: filters.to ?? null },
    filters,
    totals: { owedToYou: 0, youOwe: 0, settled: 0, pending: 0, disputed: 0 },
    rows: [],
  };
}

/** CSV with Indian-friendly numbers, quoted properly, ready for Excel/Sheets. */
export function toCsv(history: HistoryExport): string {
  const header = [
    'Date',
    'Type',
    'Description',
    'Group',
    'People',
    'Amount (INR)',
    'Direction',
    'Status',
    'Source',
  ];

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const lines = history.rows.map((row) =>
    [
      new Date(row.date).toISOString().slice(0, 10),
      row.kind.replace('_', ' '),
      row.description,
      row.groupName ?? '',
      row.counterpartyNames.join(', '),
      (row.amount / 100).toFixed(2),
      row.direction.replace('_', ' '),
      row.status,
      row.source,
    ]
      .map((cell) => escape(String(cell)))
      .join(','),
  );

  const summary = [
    '',
    `"Downloaded",${escape(new Date(history.generatedAt).toISOString())}`,
    `"Range from",${escape(history.range.from ?? 'the beginning')}`,
    `"Range to",${escape(history.range.to ?? 'today')}`,
    `"Owed to you (INR)",${(history.totals.owedToYou / 100).toFixed(2)}`,
    `"You owe (INR)",${(history.totals.youOwe / 100).toFixed(2)}`,
    `"Settled (INR)",${(history.totals.settled / 100).toFixed(2)}`,
    `"Pending (INR)",${(history.totals.pending / 100).toFixed(2)}`,
    `"Disputed (INR)",${(history.totals.disputed / 100).toFixed(2)}`,
  ];

  return [header.map(escape).join(','), ...lines, ...summary].join('\n');
}
