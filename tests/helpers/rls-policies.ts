import type { FakeDb, Row } from './fake-supabase';

/**
 * A readable mirror of `0003_rls.sql`.
 *
 * The SQL suite (`supabase/tests/02_rls_test.sql`) is what actually proves the
 * database refuses cross-user reads and writes. This mirror exists so the
 * TypeScript tests can hand the query helpers a *realistically scoped* row set
 * — the same rows Postgres would return for that session — and then assert the
 * helpers never widen that set on their own.
 *
 * Keep it in step with the migration: one predicate per policy.
 */
type Predicate = (row: Row, viewer: string, db: FixtureDb) => boolean;

type FixtureDb = { tables: Record<string, Row[]> };

export const policies: Record<string, Predicate> = {
  // profiles: own row only (other people's public fields come from the view).
  profiles: (row, viewer) => row.id === viewer,
  public_profiles: () => true,
  admin_users: (row, viewer) => row.user_id === viewer,

  friendships: (row, viewer) => row.requester_id === viewer || row.addressee_id === viewer,

  expenses: (row, viewer) => row.payer_id === viewer || row.debtor_id === viewer,

  expense_events: (row, viewer, db) => {
    const expense = (db.tables.expenses ?? []).find((candidate) => candidate.id === row.expense_id);
    return Boolean(expense) && (expense!.payer_id === viewer || expense!.debtor_id === viewer);
  },

  groups: (row, viewer, db) =>
    row.created_by === viewer ||
    (db.tables.group_members ?? []).some((member) => member.group_id === row.id && member.user_id === viewer),

  group_members: (row, viewer, db) =>
    (db.tables.group_members ?? []).some((member) => member.group_id === row.group_id && member.user_id === viewer),

  group_expenses: (row, viewer, db) =>
    (db.tables.group_members ?? []).some((member) => member.group_id === row.group_id && member.user_id === viewer),

  group_expense_shares: (row, viewer, db) => {
    const expense = (db.tables.group_expenses ?? []).find((candidate) => candidate.id === row.group_expense_id);
    return Boolean(expense) && policies.group_expenses(expense!, viewer, db);
  },

  settlements: (row, viewer) => row.payer_id === viewer || row.receiver_id === viewer,

  notifications: (row, viewer) => row.user_id === viewer,
  notification_preferences: (row, viewer) => row.user_id === viewer,

  // Archived records stay readable only by the people who were in them.
  archived_records: (row, viewer) => ((row.participant_ids as string[] | undefined) ?? []).includes(viewer),

  user_exports: (row, viewer) => row.user_id === viewer,

  app_settings: () => true,
  admin_audit_log: () => false,
  server_logs: () => false,
};

export function scopedTables(
  tables: Record<string, Row[]>,
  viewer: string,
): Record<string, Row[]> {
  const scoped: Record<string, Row[]> = {};
  for (const [table, rows] of Object.entries(tables)) {
    const policy = policies[table];
    scoped[table] = policy ? rows.filter((row) => policy(row, viewer, { tables })) : [];
  }
  return scoped;
}

export function scopedDb(tables: Record<string, Row[]>, viewer: string, rpcs: FakeDb['rpcs']): FakeDb {
  return {
    tables: scopedTables(tables, viewer),
    user: { id: viewer },
    rpcs,
    writes: [],
    failNext: null,
  };
}
