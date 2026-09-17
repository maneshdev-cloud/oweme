-- =============================================================================
-- OweMe — 0001 init schema
-- Track small money between friends. Track -> Notify -> Confirm -> Settle.
--
-- Conventions used throughout:
--   * All money is `numeric(14,2)`. Binary floating point is never used for
--     currency anywhere in this system (DB or app).
--   * All timestamps are server-generated (`now()`), never trusted from clients.
--   * Every financial record is soft-cancelled, never hard-deleted while it is
--     active / disputed / unresolved (enforced by trigger, see 0002).
--   * Currency is a `text` ISO-4217 column with an INR default so V1 is INR-only
--     without the schema hard-coding INR forever.
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive usernames/email
create extension if not exists "pg_trgm";    -- fast friend search

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.friendship_status as enum ('pending', 'accepted', 'declined', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.expense_status as enum
    ('PENDING', 'PAYMENT_MARKED', 'CONFIRMED', 'DISPUTED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.settlement_status as enum
    ('PENDING', 'CONFIRMED', 'DISPUTED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.group_role as enum ('owner', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum (
    'expense_created', 'payment_marked', 'payment_confirmed', 'payment_disputed',
    'expense_cancelled', 'friend_request', 'friend_accepted', 'friend_declined',
    'group_added', 'group_expense_added', 'settlement_created', 'settlement_confirmed',
    'history_expiring', 'admin_announcement'
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text        not null,
  username    citext      not null,
  email       citext      not null,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_full_name_len check (char_length(btrim(full_name)) between 1 and 80),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_username_unique unique (username)
);

create index if not exists profiles_full_name_trgm_idx on public.profiles using gin (full_name gin_trgm_ops);
create index if not exists profiles_username_trgm_idx  on public.profiles using gin ((username::text) gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- admin_users — the admin *role*. Deliberately a separate table (not a boolean
-- on profiles) so a user can never grant themselves admin by updating their own
-- profile row. Rows are inserted by the service role / DBA only.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- friendships
-- -----------------------------------------------------------------------------
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       public.friendship_status not null default 'pending',
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- At most ONE pending-or-accepted row per unordered pair. This is what makes a
-- duplicate friend request in either direction impossible (both at once and in
-- a race), without relying on the frontend.
create unique index if not exists friendships_active_pair_uidx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status in ('pending', 'accepted');

create index if not exists friendships_requester_idx on public.friendships (requester_id, status);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);

-- -----------------------------------------------------------------------------
-- expenses (1:1)
-- -----------------------------------------------------------------------------
create table if not exists public.expenses (
  id                uuid primary key default gen_random_uuid(),
  payer_id          uuid not null references public.profiles (id) on delete restrict,
  debtor_id         uuid not null references public.profiles (id) on delete restrict,
  amount            numeric(14,2) not null,
  currency          text not null default 'INR',
  description       text not null,
  category          text not null default 'Other',
  status            public.expense_status not null default 'PENDING',
  created_by        uuid not null references public.profiles (id) on delete restrict,
  client_request_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  settled_at        timestamptz,
  constraint expenses_amount_positive check (amount > 0),
  constraint expenses_no_self check (payer_id <> debtor_id),
  constraint expenses_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint expenses_description_len check (char_length(btrim(description)) between 1 and 200),
  constraint expenses_category_len check (char_length(btrim(category)) between 1 and 48),
  constraint expenses_created_by_participant check (created_by in (payer_id, debtor_id)),
  constraint expenses_settled_at_consistent check ((status = 'CONFIRMED') = (settled_at is not null)),
  constraint expenses_cancelled_not_settled check (not (status = 'CANCELLED' and settled_at is not null))
);

-- Idempotency for double-submitted "Add expense" forms: the same client-supplied
-- request id can never create two expenses.
create unique index if not exists expenses_idempotency_uidx
  on public.expenses (created_by, client_request_id)
  where client_request_id is not null;

create index if not exists expenses_payer_idx  on public.expenses (payer_id, status, created_at desc);
create index if not exists expenses_debtor_idx on public.expenses (debtor_id, status, created_at desc);
create index if not exists expenses_pair_idx
  on public.expenses (least(payer_id, debtor_id), greatest(payer_id, debtor_id), created_at desc);
create index if not exists expenses_status_created_idx on public.expenses (status, created_at desc);

-- -----------------------------------------------------------------------------
-- expense_events — append-only audit trail / timeline.
-- -----------------------------------------------------------------------------
create table if not exists public.expense_events (
  id          bigserial primary key,
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  event_type  text not null,
  from_status public.expense_status,
  to_status   public.expense_status,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint expense_events_type_check check (event_type in
    ('created', 'updated', 'payment_marked', 'confirmed', 'disputed', 'cancelled', 'note', 'expired_reminder'))
);

create index if not exists expense_events_expense_idx on public.expense_events (expense_id, created_at);

-- -----------------------------------------------------------------------------
-- groups / members
-- -----------------------------------------------------------------------------
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  currency    text not null default 'INR',
  created_by  uuid not null references public.profiles (id) on delete restrict,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint groups_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint groups_description_len check (description is null or char_length(description) <= 300),
  constraint groups_currency_format check (currency ~ '^[A-Z]{3}$')
);

create table if not exists public.group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.group_role not null default 'member',
  created_at timestamptz not null default now(),
  constraint group_members_unique unique (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);

-- -----------------------------------------------------------------------------
-- group expenses + shares
-- -----------------------------------------------------------------------------
create table if not exists public.group_expenses (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups (id) on delete restrict,
  paid_by           uuid not null references public.profiles (id) on delete restrict,
  amount            numeric(14,2) not null,
  currency          text not null default 'INR',
  description       text not null,
  category          text not null default 'Other',
  status            public.expense_status not null default 'PENDING',
  created_by        uuid not null references public.profiles (id) on delete restrict,
  client_request_id uuid,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Group expenses in V1 are either live (PENDING) or soft-cancelled.
  -- The full confirm/dispute machine applies to 1:1 expenses; group balances are
  -- settled through the `settlements` table instead.
  constraint group_expenses_status_check check (status in ('PENDING', 'CANCELLED')),
  constraint group_expenses_amount_positive check (amount > 0),
  constraint group_expenses_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint group_expenses_description_len check (char_length(btrim(description)) between 1 and 200),
  constraint group_expenses_category_len check (char_length(btrim(category)) between 1 and 48),
  constraint group_expenses_cancelled_consistent check ((status = 'CANCELLED') = (cancelled_at is not null))
);

create unique index if not exists group_expenses_idempotency_uidx
  on public.group_expenses (created_by, client_request_id)
  where client_request_id is not null;

create index if not exists group_expenses_group_idx on public.group_expenses (group_id, created_at desc);
create index if not exists group_expenses_paid_by_idx on public.group_expenses (group_id, paid_by);

create table if not exists public.group_expense_shares (
  id               uuid primary key default gen_random_uuid(),
  group_expense_id uuid not null references public.group_expenses (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete restrict,
  share_amount     numeric(14,2) not null,
  created_at       timestamptz not null default now(),
  constraint group_expense_shares_amount_non_negative check (share_amount >= 0),
  constraint group_expense_shares_unique unique (group_expense_id, user_id)
);

create index if not exists group_expense_shares_user_idx on public.group_expense_shares (user_id);

-- -----------------------------------------------------------------------------
-- settlements — "money changed hands outside the app", claimed then confirmed.
--   group_id null  -> settling a 1:1 balance
--   group_id set   -> settling inside a group
-- -----------------------------------------------------------------------------
create table if not exists public.settlements (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid references public.groups (id) on delete restrict,
  payer_id          uuid not null references public.profiles (id) on delete restrict,
  receiver_id       uuid not null references public.profiles (id) on delete restrict,
  amount            numeric(14,2) not null,
  currency          text not null default 'INR',
  status            public.settlement_status not null default 'PENDING',
  created_by        uuid not null references public.profiles (id) on delete restrict,
  client_request_id uuid,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  confirmed_at      timestamptz,
  constraint settlements_amount_positive check (amount > 0),
  constraint settlements_no_self check (payer_id <> receiver_id),
  constraint settlements_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint settlements_created_by_party check (created_by in (payer_id, receiver_id)),
  constraint settlements_confirmed_consistent check ((status = 'CONFIRMED') = (confirmed_at is not null)),
  constraint settlements_note_len check (note is null or char_length(note) <= 200)
);

create unique index if not exists settlements_idempotency_uidx
  on public.settlements (created_by, client_request_id)
  where client_request_id is not null;

create index if not exists settlements_payer_idx on public.settlements (payer_id, status);
create index if not exists settlements_receiver_idx on public.settlements (receiver_id, status);
create index if not exists settlements_group_idx on public.settlements (group_id, status);

-- -----------------------------------------------------------------------------
-- notifications + preferences
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  type                  public.notification_type not null,
  title                 text not null,
  body                  text,
  deep_link             text not null,
  related_expense_id    uuid references public.expenses (id) on delete set null,
  related_group_id      uuid references public.groups (id) on delete set null,
  related_user_id       uuid references public.profiles (id) on delete set null,
  related_settlement_id uuid references public.settlements (id) on delete set null,
  dedupe_key            text,
  is_read               boolean not null default false,
  read_at               timestamptz,
  created_at            timestamptz not null default now(),
  constraint notifications_title_len check (char_length(btrim(title)) between 1 and 140),
  constraint notifications_read_consistent check (is_read = (read_at is not null))
);

-- Duplicate realtime / retried trigger deliveries must not create duplicates.
create unique index if not exists notifications_dedupe_uidx
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

create table if not exists public.notification_preferences (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  browser_push_enabled  boolean not null default false,
  email_enabled         boolean not null default false,
  updated_at            timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- app_settings — global switches (maintenance mode, feature flags, retention).
-- Readable by everyone signed in (the UI needs the banner + flags), writable
-- ONLY through the service role / admin server actions. There is deliberately
-- no insert/update/delete policy for regular users (see RLS migration).
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  ('maintenance_mode',        'false'::jsonb, 'Show maintenance screen to non-admins'),
  ('registrations_enabled',   'true'::jsonb,  'Allow brand-new users to complete sign-up'),
  ('expense_creation_enabled','true'::jsonb,  'Allow creating new expenses / group expenses'),
  ('read_only_mode',          'false'::jsonb, 'Freeze all financial writes (emergency switch)'),
  ('announcement_banner',     'null'::jsonb,  'Site-wide banner: {message, tone, dismissible}'),
  ('feature_flags',           '{"push_notifications": true, "history_export": true, "groups": true}'::jsonb, 'Gradual rollout flags'),
  ('retention_days',          '365'::jsonb,   'Days after which settled records are archived'),
  ('archive_purge_days',      '90'::jsonb,    'Days an archived record is kept before hard delete'),
  ('archive_notice_days',     '30'::jsonb,    'Days of notice before an archived record is purged')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- archived_records — retention/archival store. Supabase Postgres stays the
-- source of truth; this is a cold table, not browser localStorage.
-- -----------------------------------------------------------------------------
create table if not exists public.archived_records (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null,
  original_id           uuid not null,
  participant_ids       uuid[] not null,
  snapshot              jsonb not null,
  archived_at           timestamptz not null default now(),
  purge_after           timestamptz not null,
  expiration_notice_at  timestamptz,
  constraint archived_records_kind_check check (kind in ('expense', 'group_expense', 'settlement')),
  constraint archived_records_unique unique (kind, original_id)
);

create index if not exists archived_records_participant_idx on public.archived_records using gin (participant_ids);
create index if not exists archived_records_purge_idx on public.archived_records (purge_after);

-- -----------------------------------------------------------------------------
-- user_exports — proof that a user has had the opportunity to export history.
-- -----------------------------------------------------------------------------
create table if not exists public.user_exports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  format     text not null,
  filters    jsonb not null default '{}'::jsonb,
  row_count  integer not null default 0,
  created_at timestamptz not null default now(),
  constraint user_exports_format_check check (format in ('csv', 'json'))
);

create index if not exists user_exports_user_idx on public.user_exports (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- admin_audit_log — every admin mutation, append-only, service role only.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id         bigserial primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
