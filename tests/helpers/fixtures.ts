import type { FakeDb, Row } from './fake-supabase';

/**
 * Fixtures shaped like the rows the app queries: four people, a couple of live
 * 1:1 expenses, a settlement each way, one group expense, one archived record
 * and notifications (including a deliberately stale deep link).
 *
 * Everything below belongs to two or more people on purpose — the tests then
 * assert that the helpers only ever surface the viewer's side of the story.
 */
export const ME = '11111111-1111-1111-1111-111111111111';
export const RAHUL = '22222222-2222-2222-2222-222222222222';
export const PRIYA = '33333333-3333-3333-3333-333333333333';
export const VIKRAM = '55555555-5555-5555-5555-555555555555';

export const GROUP_CS = 'cccccccc-cccc-cccc-cccc-cccccccc0001';
export const GROUP_OTHER = 'cccccccc-cccc-cccc-cccc-cccccccc0002';

const person = (id: string, full_name: string, username: string) => ({
  id,
  full_name,
  username,
  avatar_url: null,
});

export const PEOPLE: Record<string, ReturnType<typeof person>> = {
  [ME]: person(ME, 'Manesh Kumar', 'manesh'),
  [RAHUL]: person(RAHUL, 'Rahul Sharma', 'rahul_s'),
  [PRIYA]: person(PRIYA, 'Priya Nair', 'priya_n'),
  [VIKRAM]: person(VIKRAM, 'Vikram Rao', 'vikram_r'),
};

/** Me + Rahul the wrong way round, confirmed; me ↔ Priya disputed. */
export const EXPENSE_PENDING = 'eeeeeeee-0000-0000-0000-000000000001';
export const EXPENSE_CONFIRMED = 'eeeeeeee-0000-0000-0000-000000000002';
export const EXPENSE_DISPUTED = 'eeeeeeee-0000-0000-0000-000000000003';
export const EXPENSE_NOT_MINE = 'eeeeeeee-0000-0000-0000-000000000004';

export const SETTLEMENT_PENDING = 'a0000000-0000-0000-0000-000000000001';
export const SETTLEMENT_CONFIRMED = 'a0000000-0000-0000-0000-000000000002';
export const SETTLEMENT_NOT_MINE = 'a0000000-0000-0000-0000-000000000003';

export const GROUP_EXPENSE_MINE = '9f000000-0000-0000-0000-000000000001';
export const GROUP_EXPENSE_NOT_MINE = '9f000000-0000-0000-0000-000000000002';

export const ARCHIVED_MINE = 'ab000000-0000-0000-0000-000000000001';
/** History rows key archived records by their *original* id, not the archive row id. */
export const ARCHIVED_ORIGINAL_ID = 'eeeeeeee-0000-0000-0000-0000000000aa';
export const ARCHIVED_NOT_MINE = 'ab000000-0000-0000-0000-000000000002';

export const NOTIFICATION_UNREAD = '0f000000-0000-0000-0000-000000000001';
export const NOTIFICATION_STALE = '0f000000-0000-0000-0000-000000000002';
export const NOTIFICATION_READ = '0f000000-0000-0000-0000-000000000003';
export const NOTIFICATION_NOT_MINE = '0f000000-0000-0000-0000-000000000004';

const expense = (over: Row): Row => ({
  currency: 'INR',
  category: 'Food',
  created_by: ME,
  client_request_id: null,
  settled_at: null,
  updated_at: '2026-02-10T09:00:00.000Z',
  ...over,
});

export function fixtureTables(): Record<string, Row[]> {
  return {
    // The private table: emails live here and nowhere else.
    profiles: Object.values(PEOPLE).map((p) => ({ ...p, email: `${p.username}@example.com` })),

    // The view every other person reads: public columns only, on purpose.
    public_profiles: Object.values(PEOPLE).map((p) => ({ ...p })),

    friendships: [
      {
        id: 'f0000000-0000-0000-0000-000000000001',
        requester_id: ME,
        addressee_id: RAHUL,
        status: 'accepted',
        created_at: '2025-12-01T10:00:00.000Z',
        responded_at: '2025-12-01T11:00:00.000Z',
      },
      {
        id: 'f0000000-0000-0000-0000-000000000002',
        requester_id: ME,
        addressee_id: PRIYA,
        status: 'pending',
        created_at: '2026-02-01T10:00:00.000Z',
        responded_at: null,
      },
      {
        id: 'f0000000-0000-0000-0000-000000000003',
        requester_id: VIKRAM,
        addressee_id: PRIYA,
        status: 'accepted',
        created_at: '2025-11-01T10:00:00.000Z',
        responded_at: '2025-11-01T10:05:00.000Z',
      },
    ],

    expenses: [
      expense({
        id: EXPENSE_PENDING,
        payer_id: ME,
        debtor_id: RAHUL,
        amount: '120.50',
        description: 'Printout bundle',
        status: 'PENDING',
        created_at: '2026-02-10T09:00:00.000Z',
        payer: PEOPLE[ME],
        debtor: PEOPLE[RAHUL],
      }),
      expense({
        id: EXPENSE_CONFIRMED,
        payer_id: RAHUL,
        debtor_id: ME,
        amount: '500.00',
        description: 'Train ticket',
        category: 'Travel',
        status: 'CONFIRMED',
        settled_at: '2026-01-06T08:00:00.000Z',
        created_at: '2026-01-05T08:00:00.000Z',
        payer: PEOPLE[RAHUL],
        debtor: PEOPLE[ME],
      }),
      expense({
        id: EXPENSE_DISPUTED,
        payer_id: ME,
        debtor_id: PRIYA,
        amount: '300.00',
        description: 'Lab manual',
        status: 'DISPUTED',
        created_at: '2026-03-01T08:00:00.000Z',
        payer: PEOPLE[ME],
        debtor: PEOPLE[PRIYA],
      }),
      expense({
        id: EXPENSE_NOT_MINE,
        payer_id: VIKRAM,
        debtor_id: PRIYA,
        amount: '999.00',
        description: 'Someone else’s dinner',
        status: 'PENDING',
        created_at: '2026-02-20T08:00:00.000Z',
        created_by: VIKRAM,
        payer: PEOPLE[VIKRAM],
        debtor: PEOPLE[PRIYA],
      }),
    ],

    settlements: [
      {
        id: SETTLEMENT_PENDING,
        payer_id: ME,
        receiver_id: RAHUL,
        group_id: null,
        amount: '100.00',
        currency: 'INR',
        status: 'PENDING',
        created_at: '2026-02-11T09:00:00.000Z',
        confirmed_at: null,
        cleared_expense_ids: [],
      },
      {
        id: SETTLEMENT_CONFIRMED,
        payer_id: RAHUL,
        receiver_id: ME,
        group_id: null,
        amount: '50.00',
        currency: 'INR',
        status: 'CONFIRMED',
        created_at: '2026-01-07T09:00:00.000Z',
        confirmed_at: '2026-01-07T09:10:00.000Z',
        cleared_expense_ids: [],
      },
      {
        id: SETTLEMENT_NOT_MINE,
        payer_id: VIKRAM,
        receiver_id: PRIYA,
        group_id: null,
        amount: '75.00',
        currency: 'INR',
        status: 'PENDING',
        created_at: '2026-02-12T09:00:00.000Z',
        confirmed_at: null,
        cleared_expense_ids: [],
      },
    ],

    groups: [
      { id: GROUP_CS, name: 'CS Project', description: null, owner_id: ME, created_at: '2025-12-05T10:00:00.000Z' },
      { id: GROUP_OTHER, name: 'Drama Club', description: null, owner_id: VIKRAM, created_at: '2025-12-06T10:00:00.000Z' },
    ],

    group_members: [
      { id: '6a000000-0000-0000-0000-000000000001', group_id: GROUP_CS, user_id: ME, role: 'owner', joined_at: '2025-12-05T10:00:00.000Z' },
      { id: '6a000000-0000-0000-0000-000000000002', group_id: GROUP_CS, user_id: RAHUL, role: 'member', joined_at: '2025-12-05T10:01:00.000Z' },
      { id: '6a000000-0000-0000-0000-000000000003', group_id: GROUP_OTHER, user_id: VIKRAM, role: 'owner', joined_at: '2025-12-06T10:00:00.000Z' },
      { id: '6a000000-0000-0000-0000-000000000004', group_id: GROUP_OTHER, user_id: PRIYA, role: 'member', joined_at: '2025-12-06T10:01:00.000Z' },
    ],

    group_expenses: [
      {
        id: GROUP_EXPENSE_MINE,
        group_id: GROUP_CS,
        paid_by: ME,
        amount: '300.00',
        currency: 'INR',
        description: 'Printout bundle',
        category: 'Project',
        status: 'PENDING',
        created_by: ME,
        created_at: '2026-02-14T10:00:00.000Z',
        groups: { name: 'CS Project' },
      },
      {
        id: GROUP_EXPENSE_NOT_MINE,
        group_id: GROUP_OTHER,
        paid_by: VIKRAM,
        amount: '1200.00',
        currency: 'INR',
        description: 'Stage props',
        category: 'Other',
        status: 'PENDING',
        created_by: VIKRAM,
        created_at: '2026-02-15T10:00:00.000Z',
        groups: { name: 'Drama Club' },
      },
    ],

    group_expense_shares: [
      {
        id: '5a000000-0000-0000-0000-000000000001',
        group_expense_id: GROUP_EXPENSE_MINE,
        user_id: ME,
        share_amount: '150.00',
        currency: 'INR',
      },
      {
        id: '5a000000-0000-0000-0000-000000000002',
        group_expense_id: GROUP_EXPENSE_MINE,
        user_id: RAHUL,
        share_amount: '150.00',
        currency: 'INR',
      },
      {
        id: '5a000000-0000-0000-0000-000000000003',
        group_expense_id: GROUP_EXPENSE_NOT_MINE,
        user_id: VIKRAM,
        share_amount: '1200.00',
        currency: 'INR',
      },
    ],

    archived_records: [
      {
        id: ARCHIVED_MINE,
        kind: 'expense',
        original_id: ARCHIVED_ORIGINAL_ID,
        participant_ids: [ME, RAHUL],
        archived_at: '2026-04-01T03:15:00.000Z',
        purge_after: '2060-01-01T00:00:00.000Z',
        snapshot: {
          expense: {
            id: 'eeeeeeee-0000-0000-0000-0000000000aa',
            amount: '60.00',
            currency: 'INR',
            description: 'Old chai run',
            status: 'CONFIRMED',
            created_at: '2025-06-01T09:00:00.000Z',
          },
        },
      },
      {
        id: ARCHIVED_NOT_MINE,
        kind: 'expense',
        original_id: 'eeeeeeee-0000-0000-0000-0000000000bb',
        participant_ids: [VIKRAM, PRIYA],
        archived_at: '2026-04-01T03:15:00.000Z',
        purge_after: '2060-01-01T00:00:00.000Z',
        snapshot: {
          expense: {
            id: 'eeeeeeee-0000-0000-0000-0000000000bb',
            amount: '999.00',
            currency: 'INR',
            description: 'Not my business',
            status: 'CONFIRMED',
            created_at: '2025-06-02T09:00:00.000Z',
          },
        },
      },
    ],

    notifications: [
      {
        id: NOTIFICATION_UNREAD,
        user_id: ME,
        type: 'expense_created',
        title: 'Rahul owes you ₹120.50',
        body: 'Printout bundle',
        deep_link: `/expenses/${EXPENSE_PENDING}`,
        related_expense_id: EXPENSE_PENDING,
        related_group_id: null,
        related_user_id: RAHUL,
        related_settlement_id: null,
        is_read: false,
        created_at: '2026-02-10T09:00:01.000Z',
      },
      {
        id: NOTIFICATION_STALE,
        user_id: ME,
        type: 'payment_marked',
        title: 'Priya said they paid',
        body: null,
        deep_link: '/expenses/eeeeeeee-0000-0000-0000-00000000dead',
        related_expense_id: 'eeeeeeee-0000-0000-0000-00000000dead',
        related_group_id: null,
        related_user_id: PRIYA,
        related_settlement_id: null,
        is_read: false,
        created_at: '2026-02-12T09:00:00.000Z',
      },
      {
        id: NOTIFICATION_READ,
        user_id: ME,
        type: 'payment_confirmed',
        title: 'Rahul confirmed ₹500.00',
        body: null,
        deep_link: `/expenses/${EXPENSE_CONFIRMED}`,
        related_expense_id: EXPENSE_CONFIRMED,
        related_group_id: null,
        related_user_id: RAHUL,
        related_settlement_id: null,
        is_read: true,
        created_at: '2026-01-06T08:00:01.000Z',
      },
      {
        id: NOTIFICATION_NOT_MINE,
        user_id: VIKRAM,
        type: 'expense_created',
        title: 'Priya owes you ₹999.00',
        body: null,
        deep_link: `/expenses/${EXPENSE_NOT_MINE}`,
        related_expense_id: EXPENSE_NOT_MINE,
        related_group_id: null,
        related_user_id: PRIYA,
        related_settlement_id: null,
        is_read: false,
        created_at: '2026-02-20T08:00:01.000Z',
      },
    ],

    user_exports: [],
    app_settings: [
      { key: 'maintenance_mode', value: false },
      { key: 'expense_creation_enabled', value: true },
    ],
    server_logs: [],
  };
}

/** RPCs the read helpers call, implemented over the fixture tables. */
export const fixtureRpcs: FakeDb['rpcs'] = {
  healthcheck: (_params, db) => {
    if (db.failNext?.table === 'healthcheck') {
      db.failNext = null;
      return { data: null, error: { message: 'project paused' } };
    }
    return { data: true, error: null };
  },
  unread_notification_count: (_params, db) => {
    const rows = db.tables.notifications ?? [];
    return { data: rows.filter((row) => row.user_id === db.user?.id && row.is_read === false).length, error: null };
  },
  is_admin: () => false,
  my_friends: (_params, db) => {
    const viewer = db.user?.id;
    const friendships = db.tables.friendships ?? [];
    const people = new Map((db.tables.public_profiles ?? []).map((row) => [row.id as string, row]));
    const friendIds = friendships
      .filter((row) => row.status === 'accepted' && (row.requester_id === viewer || row.addressee_id === viewer))
      .map((row) => (row.requester_id === viewer ? row.addressee_id : row.requester_id) as string);

    return {
      data: friendIds.map((friendId) => {
        // Only unsettled records move a running balance; a CONFIRMED expense
        // has already been squared away.
        const mine = (db.tables.expenses ?? []).filter(
          (row) =>
            (row.status === 'PENDING' || row.status === 'PAYMENT_MARKED' || row.status === 'DISPUTED') &&
            ((row.payer_id === viewer && row.debtor_id === friendId) ||
              (row.payer_id === friendId && row.debtor_id === viewer)),
        );
        const balance = mine.reduce(
          (sum, row) => sum + (row.payer_id === viewer ? 1 : -1) * Math.round(Number(row.amount) * 100),
          0,
        );
        return {
          friendship_id: (friendships.find(
            (row) =>
              (row.requester_id === viewer && row.addressee_id === friendId) ||
              (row.addressee_id === viewer && row.requester_id === friendId),
          )?.id ?? '') as string,
          friend_id: friendId,
          full_name: (people.get(friendId)?.full_name ?? '') as string,
          username: (people.get(friendId)?.username ?? '') as string,
          avatar_url: null,
          balance: balance / 100,
          currency: 'INR',
        };
      }),
      error: null,
    };
  },
  search_people: (params, db) => {
    const query = String(params.p_query ?? '').toLowerCase().replace(/^@/, '');
    const limit = Number(params.p_limit ?? 20);
    const viewer = db.user?.id;
    const rows = (db.tables.public_profiles ?? [])
      .filter((row) => row.id !== viewer)
      .filter((row) => !query || String(row.full_name).toLowerCase().includes(query) || String(row.username).toLowerCase().includes(query))
      .slice(0, limit)
      .map((row) => ({ ...row, friendship_status: null, request_direction: null }));
    return { data: rows, error: null };
  },
  my_totals: (_params, db) => {
    const viewer = db.user?.id;
    let owed = 0;
    let owe = 0;
    for (const row of db.tables.expenses ?? []) {
      if (row.status !== 'PENDING' && row.status !== 'PAYMENT_MARKED' && row.status !== 'DISPUTED') continue;
      const minor = Math.round(Number(row.amount) * 100);
      if (row.debtor_id === viewer) {
        if (row.status !== 'PAYMENT_MARKED') owe += minor;
      }
      if (row.payer_id === viewer) owed += minor;
    }
    for (const row of db.tables.settlements ?? []) {
      if (!row.group_id) {
        const minor = Math.round(Number(row.amount) * 100);
        if (row.payer_id === viewer && (row.status === 'CONFIRMED' || row.status === 'PENDING')) {
          owe = Math.max(0, owe - minor);
        } else if (row.receiver_id === viewer && row.status === 'CONFIRMED') {
          owed = Math.max(0, owed - minor);
        }
      }
    }
    return { data: [{ currency: 'INR', you_are_owed: owed / 100, you_owe: owe / 100, net: (owed - owe) / 100 }], error: null };
  },
  my_balances: (_params, db) => {
    const viewer = db.user?.id;
    const byCounterparty = new Map<string, number>();
    for (const row of db.tables.expenses ?? []) {
      if (row.status !== 'PENDING' && row.status !== 'PAYMENT_MARKED' && row.status !== 'DISPUTED') continue;
      if (row.payer_id !== viewer && row.debtor_id !== viewer) continue;
      const other = row.payer_id === viewer ? (row.debtor_id as string) : (row.payer_id as string);
      const minor = Math.round(Number(row.amount) * 100);
      let delta = 0;
      if (row.payer_id === viewer) delta = minor;
      else if (row.status !== 'PAYMENT_MARKED') delta = -minor;
      byCounterparty.set(other, (byCounterparty.get(other) ?? 0) + delta);
    }
    for (const row of db.tables.settlements ?? []) {
      if (!row.group_id && (row.payer_id === viewer || row.receiver_id === viewer)) {
        const other = row.payer_id === viewer ? (row.receiver_id as string) : (row.payer_id as string);
        const minor = Math.round(Number(row.amount) * 100);
        let delta = 0;
        if (row.payer_id === viewer && (row.status === 'CONFIRMED' || row.status === 'PENDING')) delta = minor;
        else if (row.receiver_id === viewer && row.status === 'CONFIRMED') delta = -minor;
        byCounterparty.set(other, (byCounterparty.get(other) ?? 0) + delta);
      }
    }
    return {
      data: [...byCounterparty.entries()]
        .filter(([, balance]) => balance !== 0)
        .map(([counterparty_id, balance]) => ({ counterparty_id, currency: 'INR', balance: balance / 100 })),
      error: null,
    };
  },
  my_group_summaries: (_params, db) => {
    const viewer = db.user?.id;
    const members = (db.tables.group_members ?? []).filter((m) => m.user_id === viewer);
    const groups = (db.tables.groups ?? []).filter((g) => members.some((m) => m.group_id === g.id));
    const rows = groups.map((g) => {
      const live = (db.tables.group_expenses ?? []).filter((ge) => ge.group_id === g.id && ge.status === 'PENDING');
      let paid = 0;
      for (const e of live) {
        if (e.paid_by === viewer) paid += Number(e.amount);
      }
      let share = 0;
      for (const s of db.tables.group_expense_shares ?? []) {
        if (s.user_id === viewer && live.some((e) => e.id === s.group_expense_id)) {
          share += Number(s.share_amount);
        }
      }
      let settledOut = 0;
      let settledIn = 0;
      for (const s of db.tables.settlements ?? []) {
        if (s.group_id === g.id && s.status === 'CONFIRMED') {
          if (s.payer_id === viewer) settledOut += Number(s.amount);
          if (s.receiver_id === viewer) settledIn += Number(s.amount);
        }
      }
      const my_net = paid - share + settledOut - settledIn;
      return {
        group_id: g.id,
        name: g.name,
        description: g.description,
        currency: (g.currency as string) ?? 'INR',
        member_count: (db.tables.group_members ?? []).filter((m) => m.group_id === g.id).length,
        my_net,
        role: members.find((m) => m.group_id === g.id)?.role ?? 'member',
        created_at: g.created_at,
        last_activity_at: g.created_at,
      };
    });
    return { data: rows, error: null };
  },
};
