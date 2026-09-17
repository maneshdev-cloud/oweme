/**
 * A small in-memory stand-in for `@supabase/supabase-js`.
 *
 * Why it exists: the SQL suites in `supabase/tests` already prove the database
 * side (constraints, triggers, RLS). These TypeScript tests prove the *other*
 * half — that the queries and route handlers this app ships actually apply the
 * filters they claim to apply (date ranges, person, status, search), scope
 * everything to the signed-in user, and never leak somebody else's rows.
 *
 * It implements only the slice of the PostgREST builder the app uses:
 *   select / eq / neq / gt / gte / lt / lte / in / ilike / is / or / order /
 *   limit / range / single / maybeSingle / insert / update / upsert / delete
 * plus `auth.getUser()` and `rpc()`.
 *
 * Row shapes are stored pre-joined (e.g. an expense row already carries its
 * `payer` and `debtor` objects) because embedding is a presentation detail;
 * what the tests care about is filtering, ordering and scoping.
 */

export type Row = Record<string, unknown>;
export type Result<T = Row[]> = { data: T | null; error: { message: string } | null };

export type FakeDb = {
  tables: Record<string, Row[]>;
  user: { id: string; email?: string } | null;
  rpcs: Record<string, (params: Record<string, unknown>, db: FakeDb) => Result<unknown> | unknown>;
  /** Every mutation the code under test attempted, in order. */
  writes: Array<{ table: string; op: 'insert' | 'update' | 'upsert' | 'delete'; payload: Row; matched: number }>;
  /** Set to make the next query fail, to exercise error paths. */
  failNext: { table?: string; message: string } | null;
};

export function createFakeDb(init: {
  tables?: Record<string, Row[]>;
  user?: { id: string; email?: string } | null;
  rpcs?: FakeDb['rpcs'];
}): FakeDb {
  return {
    tables: init.tables ?? {},
    user: init.user ?? null,
    rpcs: init.rpcs ?? {},
    writes: [],
    failNext: null,
  };
}

function withId(row: Row): Row {
  return { id: (row.id as string) ?? crypto.randomUUID(), ...row };
}

function pick(obj: Row, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Row)[key];
  }
  return current;
}

/** Supports PostgREST JSON paths such as `snapshot->expense->>description`. */
function readColumn(row: Row, column: string): unknown {
  if (!column.includes('->')) return row[column];
  const segments = column.replace(/->>/g, '->').split('->');
  return pick(row, segments);
}

function likeToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i');
}

type Comparator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is';

function compare(actual: unknown, comparator: Comparator, expected: string): boolean {
  switch (comparator) {
    case 'eq':
      return String(actual) === expected;
    case 'neq':
      return String(actual) !== expected;
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return String(actual) >= expected || Number(actual) >= Number(expected);
    case 'lt':
      return String(actual) < expected || Number(actual) < Number(expected);
    case 'lte':
      return String(actual) <= expected || Number(actual) <= Number(expected);
    case 'like':
      return likeToRegex(expected).test(String(actual ?? ''));
    case 'ilike':
      return likeToRegex(expected).test(String(actual ?? ''));
    case 'is':
      return expected === 'null' ? actual === null || actual === undefined : String(actual) === expected;
  }
}

class Query implements PromiseLike<Result<Row[]>> {
  private filters: Array<(row: Row) => boolean> = [];
  private ordering: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private from = 0;
  private to: number | null = null;
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private singleMode: 'single' | 'maybe' | null = null;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  private rows(): Row[] {
    if (!this.db.tables[this.table]) this.db.tables[this.table] = [];
    return this.db.tables[this.table];
  }

  private resolveResult(rows: Row[]): Result<Row[]> {
    const failure = this.db.failNext;
    if (failure && (!failure.table || failure.table === this.table)) {
      this.db.failNext = null;
      return { data: null, error: { message: failure.message } };
    }
    if (this.singleMode === 'single') {
      if (rows.length !== 1) {
        return { data: null, error: { message: `expected exactly one row, got ${rows.length}` } };
      }
      return { data: rows[0] as unknown as Row[], error: null };
    }
    if (this.singleMode === 'maybe') {
      return { data: (rows[0] ?? null) as unknown as Row[], error: null };
    }
    return { data: rows, error: null };
  }

  select(_columns?: string, _options?: unknown): this {
    if (this.mode === 'select') this.mode = 'select';
    return this;
  }
  eq(column: string, value: unknown): this {
    return this.add(column, 'eq', String(value));
  }
  neq(column: string, value: unknown): this {
    return this.add(column, 'neq', String(value));
  }
  gt(column: string, value: unknown): this {
    return this.add(column, 'gt', String(value));
  }
  gte(column: string, value: unknown): this {
    return this.add(column, 'gte', String(value));
  }
  lt(column: string, value: unknown): this {
    return this.add(column, 'lt', String(value));
  }
  lte(column: string, value: unknown): this {
    return this.add(column, 'lte', String(value));
  }
  like(column: string, value: string): this {
    return this.add(column, 'like', value);
  }
  ilike(column: string, value: string): this {
    return this.add(column, 'ilike', value);
  }
  is(column: string, value: null | boolean): this {
    return this.add(column, 'is', value === null ? 'null' : String(value));
  }
  in(column: string, values: unknown[]): this {
    const list = values.map(String);
    this.filters.push((row) => list.includes(String(readColumn(row, column))));
    return this;
  }
  /** PostgREST `or=(a.eq.1,b.eq.2)`; comparator and value are separated by the first dot. */
  /** PostgREST `cs` — used for uuid[] columns such as archived participant_ids. */
  contains(column: string, value: unknown): this {
    const wanted = Array.isArray(value) ? value.map(String) : [String(value)];
    this.filters.push((row) => {
      const actual = readColumn(row, column);
      if (Array.isArray(actual)) return wanted.every((entry) => actual.map(String).includes(entry));
      return wanted.every((entry) => String(actual).includes(entry));
    });
    return this;
  }
  or(expression: string): this {
    const clauses = expression.split(',').map((clause) => {
      const [column, comparator, ...rest] = clause.split('.');
      return { column, comparator: comparator as Comparator, value: rest.join('.') };
    });
    this.filters.push((row) =>
      clauses.some((clause) => compare(readColumn(row, clause.column), clause.comparator, clause.value)),
    );
    return this;
  }
  order(column: string, options?: { ascending?: boolean }): this {
    this.ordering = { column, ascending: options?.ascending !== false };
    return this;
  }
  limit(count: number): this {
    this.max = count;
    return this;
  }
  range(from: number, to: number): this {
    this.from = from;
    this.to = to;
    return this;
  }
  single(): this {
    this.singleMode = 'single';
    return this;
  }
  maybeSingle(): this {
    this.singleMode = 'maybe';
    return this;
  }
  insert(payload: Row | Row[]): this {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[]): this {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row): this {
    this.mode = 'update';
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.mode = 'delete';
    return this;
  }

  private add(column: string, comparator: Comparator, value: string): this {
    this.filters.push((row) => compare(readColumn(row, column), comparator, value));
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => filter(row));
  }

  private run(): Result<Row[]> {
    const failure = this.db.failNext;
    if (failure && (!failure.table || failure.table === this.table)) {
      this.db.failNext = null;
      return { data: null, error: { message: failure.message } };
    }

    if (this.mode === 'insert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const rows = this.rows();
      for (const row of incoming) {
        const existingIndex = rows.findIndex((candidate) => candidate.id !== undefined && candidate.id === row.id);
        const next = withId(row);
        if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...next };
        else rows.push(next);
        this.db.writes.push({ table: this.table, op: 'insert', payload: next, matched: 1 });
      }
      return this.resolveResult(incoming.map((row) => withId(row)));
    }

    if (this.mode === 'update') {
      const matched = this.rows().filter((row) => this.matches(row));
      matched.forEach((row) => Object.assign(row, this.payload));
      this.db.writes.push({ table: this.table, op: 'update', payload: this.payload as Row, matched: matched.length });
      return this.resolveResult(matched);
    }

    if (this.mode === 'delete') {
      const keep: Row[] = [];
      let matched = 0;
      for (const row of this.rows()) {
        if (this.matches(row)) matched += 1;
        else keep.push(row);
      }
      this.db.tables[this.table] = keep;
      this.db.writes.push({ table: this.table, op: 'delete', payload: {}, matched });
      return { data: [], error: null };
    }

    let rows = this.rows().filter((row) => this.matches(row));

    if (this.ordering) {
      const { column, ascending } = this.ordering;
      rows = [...rows].sort((a, b) => {
        const left = readColumn(a, column);
        const right = readColumn(b, column);
        if (left === right) return 0;
        const result = String(left) < String(right) ? -1 : 1;
        return ascending ? result : -result;
      });
    }
    if (this.from) rows = rows.slice(this.from);
    if (this.max !== null) rows = rows.slice(0, this.max);
    else if (this.to !== null) rows = rows.slice(0, this.to - this.from + 1);

    return this.resolveResult(rows);
  }

  then<TResult1 = Result<Row[]>, TResult2 = never>(
    onfulfilled?: ((value: Result<Row[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.run();
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

export type FakeClient = {
  from: (table: string) => Query;
  rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<Result<unknown>>;
  auth: {
    getUser: () => Promise<{ data: { user: FakeDb['user'] }; error: null }>;
    getSession: () => Promise<{ data: { session: { user: FakeDb['user'] } | null } }>;
  };
  __db: FakeDb;
};

export function createFakeClient(db: FakeDb): FakeClient {
  return {
    from: (table: string) => new Query(db, table),
    rpc: (name: string, params: Record<string, unknown> = {}) => {
      const handler = db.rpcs[name];
      const outcome = handler ? handler(params, db) : { data: null, error: { message: `unknown rpc ${name}` } };
      const result: Result<unknown> =
        outcome && typeof outcome === 'object' && 'data' in (outcome as Row)
          ? (outcome as Result<unknown>)
          : ({ data: outcome, error: null } as Result<unknown>);
      return { then: (onfulfilled?: ((value: Result<unknown>) => unknown) | null) => Promise.resolve(result).then(onfulfilled) } as PromiseLike<Result<unknown>>;
    },
    auth: {
      getUser: async () => ({ data: { user: db.user }, error: null }),
      getSession: async () => ({ data: { session: db.user ? { user: db.user } : null } }),
    },
    __db: db,
  };
}
