-- =============================================================================
-- OweMe — 0006 admin, retention & archival (Phase 2)
--
-- Retention rules, in one sentence: a record is only ever archived once its
-- removal can no longer change anybody's live balance, and it is only purged
-- after its participants have had a clear opportunity to download it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Structured server-side logs (no secrets/tokens are ever written here).
-- -----------------------------------------------------------------------------
create table if not exists public.server_logs (
  id         bigserial primary key,
  level      text not null,
  event      text not null,
  message    text,
  context    jsonb not null default '{}'::jsonb,
  user_id    uuid,
  request_id text,
  created_at timestamptz not null default now(),
  constraint server_logs_level_check check (level in ('debug', 'info', 'warn', 'error')),
  constraint server_logs_event_len check (char_length(event) between 1 and 80)
);

create index if not exists server_logs_created_idx on public.server_logs (created_at desc);
create index if not exists server_logs_level_idx on public.server_logs (level, created_at desc);

alter table public.server_logs enable row level security;

drop policy if exists server_logs_select_admin on public.server_logs;
create policy server_logs_select_admin on public.server_logs
  for select to authenticated
  using (public.is_admin());
-- writes: service role only (server actions). No insert policy on purpose.

grant select on public.server_logs to authenticated;

-- -----------------------------------------------------------------------------
-- Quiet-pair / quiet-group checks: safe prerequisites for archiving.
-- -----------------------------------------------------------------------------
create or replace function public.pair_is_quiet(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (
    select 1 from public.expenses e
     where e.status in ('PENDING', 'PAYMENT_MARKED', 'DISPUTED')
       and least(e.payer_id, e.debtor_id) = least(p_a, p_b)
       and greatest(e.payer_id, e.debtor_id) = greatest(p_a, p_b)
  ) and not exists (
    select 1 from public.settlements s
     where s.group_id is null and s.status in ('PENDING', 'DISPUTED')
       and least(s.payer_id, s.receiver_id) = least(p_a, p_b)
       and greatest(s.payer_id, s.receiver_id) = greatest(p_a, p_b)
  );
$$;

create or replace function public.group_is_quiet(p_group uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (
    select 1 from public.group_expenses ge
     where ge.group_id = p_group and ge.status = 'PENDING'
  ) and not exists (
    select 1 from public.settlements s
     where s.group_id = p_group and s.status in ('PENDING', 'DISPUTED')
  );
$$;

-- -----------------------------------------------------------------------------
-- archive_settled_records()
--   Moves resolved, quiet, past-retention records into archived_records and
--   tells the affected people that a copy is on its way out (with the exact
--   purge date). Never touches active / pending / disputed records.
-- -----------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- The one sentence every archival notice uses, so the promise made to a user can
-- never drift from what the purge loop actually does.
--
-- What the purge loop enforces (see the bottom of this file):
--   • the row's `purge_after` must have passed, AND
--   • the notice window must have passed, AND
--   • either every participant has downloaded their history since the notice,
--     or twice the notice window has passed regardless.
--
-- Deletion is therefore always *on or after* `purge_after` — an export can only
-- ever bring it forward, never hold it back — which is exactly what this text
-- promises. Nothing here claims an export is required to keep something alive.
-- -----------------------------------------------------------------------------
create or replace function public.archival_notice_body(p_subject text, p_purge_after timestamptz)
returns text language sql stable as $$
  select format(
    '%s was moved to the archive. Download your history to keep your own copy — '
    || 'the archived copy is cleared automatically on or after %s, whether or not you download.',
    p_subject, to_char(p_purge_after, 'DD Mon YYYY'));
$$;

create or replace function public.archive_settled_records()
returns table (archived_count int, notice_count int, purged_count int)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_retention   int := greatest(coalesce((select (value #>> '{}')::int from public.app_settings where key = 'retention_days'), 365), 1);
  v_purge_days  int := greatest(coalesce((select (value #>> '{}')::int from public.app_settings where key = 'archive_purge_days'), 90), 1);
  v_notice_days int := greatest(coalesce((select (value #>> '{}')::int from public.app_settings where key = 'archive_notice_days'), 30), 1);
  v_cutoff      timestamptz := now() - make_interval(days => v_retention);
  v_purge_after timestamptz := now() + make_interval(days => v_purge_days);
  r             record;
  v_participants uuid[];
  v_uid         uuid;
  v_notice_id   uuid;
  v_snapshot    jsonb;
  v_archived    int := 0;
  v_notices     int := 0;
  v_purged      int := 0;
begin
  -- Archival is the one code path allowed to hard-delete financial rows.
  perform set_config('app.archival', 'on', true);

  -- 1:1 expenses -------------------------------------------------------------
  -- Safe by construction: only CONFIRMED and CANCELLED expenses are eligible,
  -- and neither is part of any live balance (see public.my_balances(), which
  -- counts only PENDING / PAYMENT_MARKED / DISPUTED). Archiving one therefore
  -- cannot move anybody's numbers, whatever else the pair still has open.
  for r in
    select e.*
      from public.expenses e
     where e.status in ('CONFIRMED', 'CANCELLED')
       and e.updated_at < v_cutoff
       and not exists (select 1 from public.archived_records a
                        where a.kind = 'expense' and a.original_id = e.id)
     order by e.updated_at
     limit 500
  loop
    v_participants := array[r.payer_id, r.debtor_id];
    v_snapshot := jsonb_build_object(
      'expense', to_jsonb(r),
      'events', coalesce((select jsonb_agg(to_jsonb(ev) order by ev.created_at)
                            from public.expense_events ev where ev.expense_id = r.id), '[]'::jsonb)
    );

    insert into public.archived_records
      (kind, original_id, participant_ids, snapshot, purge_after, expiration_notice_at)
    values ('expense', r.id, v_participants, v_snapshot, v_purge_after, now())
    on conflict (kind, original_id) do nothing;

    delete from public.expenses where id = r.id;  -- cascades its expense_events
    v_archived := v_archived + 1;

    -- Tell both people, with the exact date the archived copy can go.
    v_notice_id := public.create_notification(
      r.payer_id, 'history_expiring',
      'An old expense was archived',
      public.archival_notice_body(
        'Your ' || to_char(r.amount, 'FM₹999999999990.00') || ' "' || r.description || '" record',
        v_purge_after),
      '/history', '/archive/expense/' || r.id::text || '/' || r.payer_id::text, null, null, r.debtor_id);
    if v_notice_id is not null then v_notices := v_notices + 1; end if;

    v_notice_id := public.create_notification(
      r.debtor_id, 'history_expiring',
      'An old expense was archived',
      public.archival_notice_body(
        'Your ' || to_char(r.amount, 'FM₹999999999990.00') || ' "' || r.description || '" record',
        v_purge_after),
      '/history', '/archive/expense/' || r.id::text || '/' || r.debtor_id::text, null, null, r.payer_id);
    if v_notice_id is not null then v_notices := v_notices + 1; end if;
  end loop;

  -- Group expenses -----------------------------------------------------------
  -- Same reasoning: only CANCELLED group expenses are eligible, and a cancelled
  -- expense contributes nothing to group_balances_for().
  for r in
    select ge.*
      from public.group_expenses ge
     where ge.status = 'CANCELLED'
       and ge.updated_at < v_cutoff
       and not exists (select 1 from public.archived_records a
                        where a.kind = 'group_expense' and a.original_id = ge.id)
     order by ge.updated_at
     limit 500
  loop
    select array_agg(distinct m.user_id) into v_participants
      from public.group_members m where m.group_id = r.group_id;

    v_snapshot := jsonb_build_object(
      'group_expense', to_jsonb(r),
      'shares', coalesce((select jsonb_agg(to_jsonb(s) order by s.user_id)
                            from public.group_expense_shares s where s.group_expense_id = r.id), '[]'::jsonb),
      'group_name', (select g.name from public.groups g where g.id = r.group_id)
    );

    insert into public.archived_records
      (kind, original_id, participant_ids, snapshot, purge_after, expiration_notice_at)
    values ('group_expense', r.id, coalesce(v_participants, '{}'::uuid[]), v_snapshot, v_purge_after, now())
    on conflict (kind, original_id) do nothing;

    delete from public.group_expenses where id = r.id;
    v_archived := v_archived + 1;

    -- Everybody who was in the group gets told. Without this a group expense
    -- could be archived (and later purged) without a single person being
    -- warned, which is the one thing notifications are supposed to prevent.
    foreach v_uid in array coalesce(v_participants, '{}'::uuid[]) loop
      v_notice_id := public.create_notification(
        v_uid, 'history_expiring',
        'An old group expense was archived',
        public.archival_notice_body(
          'Your share of ' || to_char(r.amount, 'FM₹999999999990.00') || ' "' || r.description ||
          '" in ' || coalesce((select g.name from public.groups g where g.id = r.group_id), 'your group'),
          v_purge_after),
        '/history', '/archive/group-expense/' || r.id::text || '/' || v_uid::text, null, r.group_id, null, null);
      if v_notice_id is not null then v_notices := v_notices + 1; end if;
    end loop;
  end loop;

  -- Settlements --------------------------------------------------------------
  -- A CONFIRMED settlement *does* feed live balances, so this one only moves
  -- once the pair (or group) has nothing open left to offset it with.
  for r in
    select s.*
      from public.settlements s
     where s.status in ('CONFIRMED', 'CANCELLED')
       and s.updated_at < v_cutoff
       and case when s.group_id is null
                then public.pair_is_quiet(s.payer_id, s.receiver_id)
                else public.group_is_quiet(s.group_id) end
       and not exists (select 1 from public.archived_records a
                        where a.kind = 'settlement' and a.original_id = s.id)
     order by s.updated_at
     limit 500
  loop
    v_participants := array[r.payer_id, r.receiver_id];
    v_snapshot := jsonb_build_object('settlement', to_jsonb(r));

    insert into public.archived_records
      (kind, original_id, participant_ids, snapshot, purge_after, expiration_notice_at)
    values ('settlement', r.id, v_participants, v_snapshot, v_purge_after, now())
    on conflict (kind, original_id) do nothing;

    delete from public.settlements where id = r.id;
    v_archived := v_archived + 1;

    -- Same rule as everywhere else: a payment record is somebody's money
    -- history, so it cannot quietly disappear.
    foreach v_uid in array array[r.payer_id, r.receiver_id] loop
      v_notice_id := public.create_notification(
        v_uid, 'history_expiring',
        'An old payment record was archived',
        public.archival_notice_body(
          'Your ' || to_char(r.amount, 'FM₹999999999990.00') || ' settle-up with ' ||
          public.display_name(case when v_uid = r.payer_id then r.receiver_id else r.payer_id end),
          v_purge_after),
        '/history', '/archive/settlement/' || r.id::text || '/' || v_uid::text,
        -- No related_settlement_id / related_expense_id here on purpose: those
        -- columns are foreign keys to the *live* tables, and the row this notice
        -- is about was deleted two statements ago. The dedupe key and the deep
        -- link still point at the record for anyone reading the log.
        null, r.group_id, case when v_uid = r.payer_id then r.receiver_id else r.payer_id end, null);
      if v_notice_id is not null then v_notices := v_notices + 1; end if;
    end loop;
  end loop;

  -- Purge. Three things must hold:
  --   • the record's own purge_after date has passed (it is never deleted before
  --     the "keep archived for N days" window the admin configured),
  --   • the notice window has passed since we told people, and
  --   • either everyone has downloaded their history since that notice (so
  --     nobody still needs us to hold it), or twice the notice window has gone
  --     by — because one person who never downloads must not be able to pin a
  --     row to the database forever.
  --
  -- Note the practical consequence: with the shipped defaults (keep archived 90
  -- days, notice 30 days) purge_after is always the binding date, so the export
  -- path only brings a purge forward when archive_purge_days < archive_notice_days.
  -- The user-facing wording reflects that: "on or after <date>", never
  -- "only if you export".
  for r in
    select a.*
      from public.archived_records a
     where a.purge_after < now()
       and a.expiration_notice_at is not null
       and now() > a.expiration_notice_at + make_interval(days => v_notice_days)
       and (
         not exists (
           select 1 from unnest(a.participant_ids) as p(uid)
            where not exists (
              select 1 from public.user_exports ux
               where ux.user_id = p.uid and ux.created_at >= a.expiration_notice_at
            )
         )
         or now() > a.expiration_notice_at + make_interval(days => v_notice_days * 2)
       )
  loop
    delete from public.archived_records where id = r.id;
    v_purged := v_purged + 1;
  end loop;

  return query select v_archived, v_notices, v_purged;
end $$;

create or replace function public.purge_old_server_logs(p_keep_days int default 30)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_deleted int;
begin
  delete from public.server_logs where created_at < now() - make_interval(days => greatest(p_keep_days, 1));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

-- -----------------------------------------------------------------------------
-- Admin: read-only stats. Mutations (settings, feature flags, shutdown) are
-- NOT exposed here — they go through server actions holding the service role,
-- after checking the caller's admin claim. A client can never write a global
-- setting directly, not even with an "admin" session.
-- -----------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'active_7d', (select count(distinct actor_id) from public.expense_events where created_at > now() - interval '7 days')
    ),
    'expenses', jsonb_build_object(
      'total', (select count(*) from public.expenses),
      'open', (select count(*) from public.expenses where status in ('PENDING', 'PAYMENT_MARKED', 'DISPUTED')),
      'settled', (select count(*) from public.expenses where status = 'CONFIRMED'),
      'disputed', (select count(*) from public.expenses where status = 'DISPUTED'),
      'last_7d', (select count(*) from public.expenses where created_at > now() - interval '7 days'),
      'open_value', (select coalesce(sum(amount), 0) from public.expenses where status in ('PENDING', 'PAYMENT_MARKED', 'DISPUTED'))
    ),
    'groups', jsonb_build_object(
      'total', (select count(*) from public.groups),
      'active_30d', (select count(distinct group_id) from public.group_expenses where created_at > now() - interval '30 days'),
      'members', (select count(*) from public.group_members)
    ),
    'notifications', jsonb_build_object(
      'total', (select count(*) from public.notifications),
      'unread', (select count(*) from public.notifications where not is_read),
      'last_7d', (select count(*) from public.notifications where created_at > now() - interval '7 days')
    ),
    'retention', jsonb_build_object(
      'archived_records', (select count(*) from public.archived_records),
      'pending_purge', (select count(*) from public.archived_records where purge_after < now()),
      'oldest_archived_at', (select min(archived_at) from public.archived_records)
    ),
    'health', jsonb_build_object(
      'errors_24h', (select count(*) from public.server_logs where level = 'error' and created_at > now() - interval '24 hours'),
      'warnings_24h', (select count(*) from public.server_logs where level = 'warn' and created_at > now() - interval '24 hours'),
      'last_error', (select jsonb_build_object('event', event, 'message', message, 'at', created_at)
                       from public.server_logs where level = 'error' order by created_at desc limit 1)
    ),
    'storage', jsonb_build_object(
      'database_bytes', pg_database_size(current_database()),
      'largest_tables', (
        select coalesce(jsonb_agg(t), '[]'::jsonb) from (
          select relname as table, pg_total_relation_size(c.oid) as bytes
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r'
           order by pg_total_relation_size(c.oid) desc
           limit 8
        ) t
      )
    ),
    'settings', (select jsonb_object_agg(key, value) from public.app_settings)
  ) into v_result;

  return v_result;
end $$;

-- -----------------------------------------------------------------------------
-- First-admin bootstrap: only works while no admin exists at all, so a fresh
-- deployment can be unlocked from the UI once. Every later grant is a manual
-- `insert into admin_users` (documented in the README).
-- -----------------------------------------------------------------------------
create or replace function public.claim_admin_if_none_exists()
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(918273645);
  if exists (select 1 from public.admin_users) then
    return false;
  end if;
  insert into public.admin_users (user_id, note) values (v_uid, 'first admin claim');
  insert into public.admin_audit_log (actor_id, action, payload)
  values (v_uid, 'bootstrap_admin', jsonb_build_object('at', now()));
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Admin audit trail helper (used by server actions through the service role).
-- -----------------------------------------------------------------------------
create or replace function public.log_admin_action(p_actor uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.admin_audit_log (actor_id, action, payload) values (p_actor, p_action, p_payload);
$$;

-- -----------------------------------------------------------------------------
-- Scheduled jobs. pg_cron is available on Supabase's free tier; if the
-- extension is not present the migration still succeeds and the README
-- explains the Edge Function alternative (supabase/functions/archive-records).
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable — use the archive-records Edge Function instead.';
    return;
  end;

  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'oweme_archive_settled') then
    perform cron.unschedule('oweme_archive_settled');
  end if;
  perform cron.schedule('oweme_archive_settled', '15 3 * * *', $cron$select public.archive_settled_records();$cron$);

  if exists (select 1 from cron.job where jobname = 'oweme_purge_logs') then
    perform cron.unschedule('oweme_purge_logs');
  end if;
  perform cron.schedule('oweme_purge_logs', '45 3 * * *', $cron$select public.purge_old_server_logs(30);$cron$);

  raise notice 'pg_cron jobs scheduled: oweme_archive_settled, oweme_purge_logs';
exception when others then
  raise notice 'Could not schedule pg_cron jobs (%). Use the Edge Function alternative.', sqlerrm;
end $$;

revoke execute on function
  public.archival_notice_body(text, timestamptz),
  public.archive_settled_records(),
  public.purge_old_server_logs(integer),
  public.log_admin_action(uuid, text, jsonb),
  public.pair_is_quiet(uuid, uuid),
  public.group_is_quiet(uuid)
from public, anon, authenticated;

grant execute on function public.admin_stats() to authenticated;
grant execute on function public.claim_admin_if_none_exists() to authenticated;
