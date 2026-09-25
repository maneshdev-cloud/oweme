export type ExpenseStatus = 'PENDING' | 'PAYMENT_MARKED' | 'CONFIRMED' | 'DISPUTED' | 'CANCELLED';
export type SettlementStatus = 'PENDING' | 'CONFIRMED' | 'DISPUTED' | 'CANCELLED';
export type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type GroupRole = 'owner' | 'admin' | 'member';

export type Profile = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  /** Present on your own profile row only. */
  created_at?: string;
};

export type Person = Profile;

export type Expense = {
  id: string;
  payer_id: string;
  debtor_id: string;
  amount: number;
  currency: string;
  description: string;
  category: string;
  status: ExpenseStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  settled_at: string | null;
};

export type ExpenseEvent = {
  id: number;
  expense_id: string;
  actor_id: string | null;
  event_type: string;
  from_status: ExpenseStatus | null;
  to_status: ExpenseStatus | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type FriendRow = {
  friendship_id: string;
  friend_id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  currency: string;
  balance: number;
  since: string;
  nickname?: string | null;
};

export type PendingRequest = {
  friendship_id: string;
  person: Person;
  direction: 'incoming' | 'outgoing';
  created_at: string;
};

export type SearchResult = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  friendship_id: string | null;
  friendship_status: FriendshipStatus | null;
  request_direction: 'incoming' | 'outgoing' | null;
};

export type GroupSummary = {
  group_id: string;
  name: string;
  description: string | null;
  currency: string;
  member_count: number;
  my_net: number;
  role: GroupRole;
  created_at: string;
  last_activity_at: string;
};

export type GroupMemberRow = {
  user_id: string;
  role: GroupRole;
  profile: Person;
  paid: number;
  share: number;
  settled_out: number;
  settled_in: number;
  net: number;
};

export type GroupBalanceRow = {
  user_id: string;
  paid: number;
  share: number;
  settled_out: number;
  settled_in: number;
  net: number;
};

export type GroupExpense = {
  id: string;
  group_id: string;
  paid_by: string;
  amount: number;
  currency: string;
  description: string;
  category: string;
  status: 'PENDING' | 'CANCELLED';
  created_by: string;
  created_at: string;
  cancelled_at: string | null;
  shares: { user_id: string; share_amount: number }[];
  payers?: { user_id: string; paid_amount: number }[];
};

export type Settlement = {
  id: string;
  group_id: string | null;
  payer_id: string;
  receiver_id: string;
  amount: number;
  currency: string;
  status: SettlementStatus;
  created_by: string;
  created_at: string;
  confirmed_at: string | null;
  note: string | null;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  deep_link: string;
  related_expense_id: string | null;
  related_group_id: string | null;
  related_user_id: string | null;
  related_settlement_id: string | null;
  is_read: boolean;
  created_at: string;
};

export type AppSettings = {
  maintenance_mode: boolean;
  registrations_enabled: boolean;
  expense_creation_enabled: boolean;
  read_only_mode: boolean;
  announcement_banner: { message: string; tone: 'info' | 'warning'; dismissible: boolean } | null;
  feature_flags: { push_notifications?: boolean; history_export?: boolean; groups?: boolean };
  retention_days: number;
  archive_purge_days: number;
  archive_notice_days: number;
};

export type DashboardWaitingItem = {
  kind: 'expense' | 'settlement';
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: ExpenseStatus;
  counterparty: Person;
  created_at: string;
};

export type DashboardData = {
  totals: {
    currency: string;
    you_are_owed: number;
    you_owe: number;
    net: number;
    friends_owed: number;
    friends_owe: number;
    groups_owed: number;
    groups_owe: number;
  };
  balances: Array<{ counterparty: Person; currency: string; balance: number }>;
  openExpenses: Array<Expense & { counterparty: Person; youArePayer: boolean }>;
  waitingOnYou: DashboardWaitingItem[];
  needsResponseCount: number;
  recentActivity: Array<Expense & { counterparty: Person; youArePayer: boolean }>;
  suggestions: SearchResult[];
  unreadNotifications: number;
};

export type HistoryFilters = {
  query?: string;
  from?: string;
  to?: string;
  personId?: string;
  groupId?: string;
  status?: 'settled' | 'pending' | 'disputed' | 'cancelled' | 'all';
};

export type HistoryRow = {
  kind: 'expense' | 'group_expense' | 'settlement' | 'archived_expense';
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  direction: 'you_paid' | 'you_owe' | 'you_received' | 'you_paid_out' | 'neutral';
  counterpartyNames: string[];
  groupName?: string | null;
  /** 'live' records are in the database, 'archived' ones come from cold storage. */
  source: 'live' | 'archived';
};

export type HistoryExport = {
  generatedAt: string;
  range: { from: string | null; to: string | null };
  filters: HistoryFilters;
  totals: { owedToYou: number; youOwe: number; settled: number; pending: number; disputed: number };
  rows: HistoryRow[];
};
