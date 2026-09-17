-- =============================================================================
-- OweMe — 0002 functions & triggers
--
-- Everything that must be true "no matter how you call the API" lives here:
-- legal state transitions, immutable money fields, server-only timestamps,
-- no hard-deletes of unresolved records, share totals that must reconcile,
-- global write switches, and an append-only audit trail.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Grants on helpers (tables themselves are handled in the RLS migration)
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;

-- -----------------------------------------------------------------------------
-- Role / relationship helpers. All SECURITY DEFINER so that policies on other
-- tables can call them without recursive RLS lookups.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admin_users a where a.user_id = p_user);
$$;

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(p_a, p_b)
      and greatest(f.requester_id, f.addressee_id) = greatest(p_a, p_b)
  );
$$;

create or replace function public.is_group_member(p_group uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_user);
$$;

create or replace function public.is_group_owner(p_group uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.group_members m
                 where m.group_id = p_group and m.user_id = p_user and m.role = 'owner');
$$;

create or replace function public.is_expense_participant(p_expense uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.expenses e
                 where e.id = p_expense and (e.payer_id = p_user or e.debtor_id = p_user));
$$;

create or replace function public.is_settlement_party(p_settlement uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.settlements s
                 where s.id = p_settlement and (s.payer_id = p_user or s.receiver_id = p_user));
$$;

create or replace function public.is_group_expense_visible(p_group_expense uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.group_expenses ge
    join public.group_members m on m.group_id = ge.group_id
    where ge.id = p_group_expense and m.user_id = p_user
  );
$$;

-- -----------------------------------------------------------------------------
-- Global switches (admin panel writes these through the service role only).
-- -----------------------------------------------------------------------------
create or replace function public.setting_bool(p_key text, p_default boolean)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select (s.value #>> '{}')::boolean from public.app_settings s where s.key = p_key),
    p_default
  );
$$;

create or replace function public.assert_financial_writes_allowed()
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  -- service role / definer contexts (archival, admin RPCs) are not user writes
  if auth.uid() is null then return; end if;
  if public.is_admin(auth.uid()) then return; end if;
  if public.setting_bool('read_only_mode', false) then
    raise exception 'OweMe is in read-only mode right now. Try again later.'
      using errcode = '55000';
  end if;
end $$;

create or replace function public.assert_expense_creation_allowed()
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return; end if;
  if public.is_admin(auth.uid()) then return; end if;
  perform public.assert_financial_writes_allowed();
  if not public.setting_bool('expense_creation_enabled', true) then
    raise exception 'Adding new expenses is temporarily switched off by an administrator.'
      using errcode = '55000';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Server-owned timestamps: a client can post whatever it likes, the DB ignores
-- it. `now()` inside one statement is the transaction timestamp = server time.
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Delete guards. A financial record is soft-cancelled, never hard-deleted while
-- it is active, disputed or unresolved. The only thing allowed to delete is the
-- archival routine, which sets `app.archival = on` for its transaction.
-- -----------------------------------------------------------------------------
create or replace function public.protect_financial_delete()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_archival boolean := coalesce(current_setting('app.archival', true), '') = 'on';
  v_privileged boolean := auth.uid() is null;
begin
  if v_archival then return old; end if;

  if tg_table_name = 'expenses' and old.status in ('PENDING', 'PAYMENT_MARKED', 'DISPUTED') then
    raise exception 'An unresolved expense cannot be deleted. Cancel it instead (records are kept).'
      using errcode = '55000';
  elsif tg_table_name = 'group_expenses' and old.status = 'PENDING' then
    raise exception 'An unresolved group expense cannot be deleted. Cancel it instead (records are kept).'
      using errcode = '55000';
  elsif tg_table_name = 'settlements' and old.status in ('PENDING', 'DISPUTED') then
    raise exception 'An unresolved settlement cannot be deleted. Cancel it instead (records are kept).'
      using errcode = '55000';
  end if;

  if not v_privileged then
    raise exception 'Financial records are never hard-deleted by users. Cancel or archive instead.'
      using errcode = '42501';
  end if;

  return old;
end $$;

-- expense_events are append-only: no UPDATE, ever.
create or replace function public.forbid_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'expense_events is an append-only audit log' using errcode = '42501';
end $$;

-- -----------------------------------------------------------------------------
-- Equal split. Canonical rule (mirrored exactly in TypeScript, see
-- src/lib/split.ts): work in minor units, floor the division, and hand the
-- leftover paise to the earliest participants by user id so the shares always
-- sum EXACTLY to the total and the ordering is deterministic.
-- -----------------------------------------------------------------------------
create or replace function public.split_equally(p_total numeric, p_user_ids uuid[])
returns table (user_id uuid, share_amount numeric)
language sql immutable as $$
  with ordered as (
    select u.user_id,
           (row_number() over (order by u.user_id))::bigint - 1 as idx
    from (select distinct x as user_id from unnest(p_user_ids) as x) u
  ), n as (
    select greatest(count(*), 1)::bigint as count from ordered
  ), total_minor as (
    select round(p_total * 100)::bigint as total
  )
  select o.user_id,
         ((t.total / n.count) + case when o.idx < (t.total % n.count) then 1 else 0 end)::numeric / 100
  from ordered o, n, total_minor t
  order by o.user_id;
$$;

-- -----------------------------------------------------------------------------
-- create_group_expense — atomic: expense row + shares row(s). Amount, membership
-- and "shares sum to total" are all enforced before anything is written.
-- -----------------------------------------------------------------------------
create or replace function public.create_group_expense(
  p_group_id          uuid,
  p_paid_by           uuid,
  p_amount            numeric,
  p_description       text,
  p_category          text,
  p_participant_ids   uuid[],
  p_client_request_id uuid default null
) returns uuid
-- SECURITY DEFINER because it must write the expense row and its share rows in
-- one transaction; every check it would otherwise get from RLS (caller is a
-- member, payer is a member, all participants are members, amount > 0, shares
-- reconcile) is performed explicitly below.
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid      uuid := auth.uid();
  v_id       uuid;
  v_existing uuid;
  v_clean    uuid[];
  v_count    int;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  perform public.assert_expense_creation_allowed();

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = '22023';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'Amount can have at most 2 decimal places.' using errcode = '22023';
  end if;
  if p_description is null or btrim(p_description) = '' then
    raise exception 'Add a short description.' using errcode = '22023';
  end if;
  if not public.is_group_member(p_group_id, v_uid) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;
  if not public.is_group_member(p_group_id, p_paid_by) then
    raise exception 'The payer is not a member of this group.' using errcode = '42501';
  end if;

  select array_agg(distinct x order by x) into v_clean from unnest(p_participant_ids) x where x is not null;
  v_count := coalesce(array_length(v_clean, 1), 0);
  if v_count = 0 then
    raise exception 'Pick at least one person to split with.' using errcode = '22023';
  end if;
  if v_count <> coalesce(array_length(p_participant_ids, 1), 0) then
    raise exception 'The same person cannot be added twice.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_clean) as m(uid)
             where not public.is_group_member(p_group_id, m.uid)) then
    raise exception 'Everyone in the split must be a member of this group.' using errcode = '42501';
  end if;

  -- Idempotency: a double-submitted form returns the expense that already exists.
  if p_client_request_id is not null then
    select id into v_existing from public.group_expenses
     where created_by = v_uid and client_request_id = p_client_request_id;
    if v_existing is not null then return v_existing; end if;
  end if;

  insert into public.group_expenses
    (group_id, paid_by, amount, currency, description, category, created_by, client_request_id)
  values
    (p_group_id, p_paid_by, p_amount,
     coalesce((select g.currency from public.groups g where g.id = p_group_id), 'INR'),
     btrim(p_description),
     coalesce(nullif(btrim(p_category), ''), 'Other'),
     v_uid, p_client_request_id)
  returning id into v_id;

  insert into public.group_expense_shares (group_expense_id, user_id, share_amount)
  select v_id, s.user_id, s.share_amount from public.split_equally(p_amount, v_clean) s;

  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Shares must sum EXACTLY to the parent expense total, and every share must
-- belong to a member of the group. Deferred so that the whole set of share rows
-- is validated once at COMMIT time (multi-row insert/update safe).
-- -----------------------------------------------------------------------------
create or replace function public.assert_shares_reconcile()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_expense_id uuid := coalesce(new.group_expense_id, old.group_expense_id);
  v_total      numeric(14,2);
  v_sum        numeric(14,2);
  v_count      int;
  v_status     public.expense_status;
  v_group      uuid;
begin
  select ge.amount, ge.status, ge.group_id into v_total, v_status, v_group
    from public.group_expenses ge where ge.id = v_expense_id;

  if v_total is null then return null; end if; -- parent gone (cascade delete)

  -- A live group expense must always have shares covering the full amount.
  if v_status = 'PENDING' then
    select coalesce(sum(s.share_amount), 0), count(*) into v_sum, v_count
      from public.group_expense_shares s where s.group_expense_id = v_expense_id;

    if v_count = 0 then
      raise exception 'A group expense must be split with at least one person.' using errcode = '23514';
    end if;
    if v_sum <> v_total then
      raise exception 'Group expense shares (%) must add up to the total (%)', v_sum, v_total
        using errcode = '23514';
    end if;
  end if;

  return null;
end $$;

create or replace function public.assert_share_member()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_group uuid;
begin
  select ge.group_id into v_group from public.group_expenses ge where ge.id = new.group_expense_id;
  if v_group is null then return new; end if;
  if not public.is_group_member(v_group, new.user_id) then
    raise exception 'Shares can only be assigned to members of the group.' using errcode = '42501';
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- EXPENSE STATE MACHINE
--
--   PENDING -> PAYMENT_MARKED -> CONFIRMED        (settled)
--   PENDING -> PAYMENT_MARKED -> DISPUTED
--   PENDING -> CANCELLED
--   DISPUTED -> PAYMENT_MARKED                    (debtor re-asserts payment)
--   DISPUTED -> CONFIRMED                         (creditor confirms after talking)
--
-- The DISPUTED -> * edges are deliberate: a disputed record must be resolvable
-- without deleting it, and every step is preserved in the timeline. A disputed
-- record can never be cancelled or returned to PENDING.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_expense_transitions()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor       uuid := auth.uid();
  v_privileged  boolean := auth.uid() is null;
  v_status_changed boolean;
  v_money_changed  boolean;
begin
  -- server-owned timestamps
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    -- A brand-new expense is always PENDING. Inserting a pre-settled row is
    -- rejected loudly rather than silently rewritten.
    if new.status <> 'PENDING' then
      raise exception 'A new expense always starts as PENDING (got %).', new.status using errcode = '55000';
    end if;
    if new.settled_at is not null then
      raise exception 'settled_at is set by the server when a payment is confirmed.' using errcode = '55000';
    end if;
    new.settled_at := null;
    perform public.assert_expense_creation_allowed();
    if not v_privileged and not public.are_friends(new.payer_id, new.debtor_id) then
      raise exception 'You can only add expenses with an accepted friend.' using errcode = '42501';
    end if;
    if not v_privileged and new.created_by <> v_actor then
      raise exception 'created_by must be the signed-in user.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE -------------------------------------------------------------------
  new.created_at        := old.created_at;
  new.created_by        := old.created_by;
  new.client_request_id := old.client_request_id;

  v_status_changed := new.status is distinct from old.status;
  v_money_changed  := new.amount is distinct from old.amount
                      or new.currency is distinct from old.currency
                      or new.payer_id is distinct from old.payer_id
                      or new.debtor_id is distinct from old.debtor_id
                      or new.description is distinct from old.description
                      or new.category is distinct from old.category;

  if v_money_changed then
    if old.status <> 'PENDING' then
      raise exception 'A % expense can no longer be edited.', old.status using errcode = '55000';
    end if;
    if not v_privileged and v_actor <> old.created_by then
      raise exception 'Only the person who added this expense can edit it.' using errcode = '42501';
    end if;
    if new.payer_id = new.debtor_id then
      raise exception 'Payer and debtor must be different people.' using errcode = '23514';
    end if;
    if not v_privileged and not public.are_friends(new.payer_id, new.debtor_id) then
      raise exception 'Both people must still be friends.' using errcode = '42501';
    end if;
  end if;

  if v_status_changed then
    if not v_privileged then
      if not (
        (old.status = 'PENDING'        and new.status = 'PAYMENT_MARKED' and v_actor = old.debtor_id) or
        (old.status = 'PENDING'        and new.status = 'CANCELLED'      and v_actor in (old.created_by, old.payer_id)) or
        (old.status = 'PAYMENT_MARKED' and new.status = 'CONFIRMED'      and v_actor = old.payer_id) or
        (old.status = 'PAYMENT_MARKED' and new.status = 'DISPUTED'       and v_actor = old.payer_id) or
        (old.status = 'DISPUTED'       and new.status = 'PAYMENT_MARKED' and v_actor = old.debtor_id) or
        (old.status = 'DISPUTED'       and new.status = 'CONFIRMED'      and v_actor = old.payer_id)
      ) then
        raise exception 'That status change is not allowed (% -> %).', old.status, new.status
          using errcode = '55000';
      end if;
    else
      -- Even the service role may not invent transitions.
      if not (
        (old.status = 'PENDING'        and new.status in ('PAYMENT_MARKED', 'CANCELLED')) or
        (old.status = 'PAYMENT_MARKED' and new.status in ('CONFIRMED', 'DISPUTED', 'CANCELLED')) or
        (old.status = 'DISPUTED'       and new.status in ('PAYMENT_MARKED', 'CONFIRMED')) or
        (old.status = 'CONFIRMED'      and new.status = 'CONFIRMED') or
        (old.status = 'CANCELLED'      and new.status = 'CANCELLED')
      ) then
        raise exception 'Illegal expense transition (% -> %).', old.status, new.status
          using errcode = '55000';
      end if;
    end if;

    if new.status = 'CONFIRMED' then
      new.settled_at := now();
    else
      new.settled_at := null;
    end if;
  else
    new.settled_at := old.settled_at;
  end if;

  return new;
end $$;

-- Append-only timeline: every state change (and every edit) writes an event.
create or replace function public.log_expense_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_type  text;
  v_meta  jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.expense_events (expense_id, actor_id, event_type, to_status, metadata)
    values (new.id, coalesce(v_actor, new.created_by), 'created', new.status,
            jsonb_build_object('amount', new.amount, 'currency', new.currency,
                               'payer_id', new.payer_id, 'debtor_id', new.debtor_id,
                               'description', new.description, 'category', new.category));
    return new;
  end if;

  if new.status is distinct from old.status then
    v_type := case new.status
                when 'PAYMENT_MARKED' then 'payment_marked'
                when 'CONFIRMED'      then 'confirmed'
                when 'DISPUTED'       then 'disputed'
                when 'CANCELLED'      then 'cancelled'
                else 'updated'
              end;
  elsif (new.amount, new.description, new.category, new.payer_id, new.debtor_id)
        is distinct from (old.amount, old.description, old.category, old.payer_id, old.debtor_id) then
    v_type := 'updated';
    v_meta := jsonb_build_object(
      'before', jsonb_build_object('amount', old.amount, 'description', old.description, 'category', old.category),
      'after',  jsonb_build_object('amount', new.amount, 'description', new.description, 'category', new.category));
  else
    return new; -- nothing worth recording
  end if;

  insert into public.expense_events (expense_id, actor_id, event_type, from_status, to_status, metadata)
  values (new.id, v_actor, v_type, old.status, new.status, v_meta);

  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Friendships: who may do what, and which transitions are legal.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_friendship_rules()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_privileged boolean := auth.uid() is null;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.status := 'pending';
    new.responded_at := null;
    if not v_privileged and new.requester_id <> v_actor then
      raise exception 'You can only send requests as yourself.' using errcode = '42501';
    end if;
    if not v_privileged and public.setting_bool('read_only_mode', false) then
      raise exception 'OweMe is in read-only mode right now.' using errcode = '55000';
    end if;
    return new;
  end if;

  new.created_at   := old.created_at;
  new.requester_id := old.requester_id;
  new.addressee_id := old.addressee_id;
  new.updated_at   := now();

  if new.status is distinct from old.status then
    if old.status not in ('pending', 'accepted') then
      raise exception 'This request was already % .', old.status using errcode = '55000';
    end if;
    if not v_privileged then
      if old.status = 'pending' and new.status = 'accepted' and v_actor <> old.addressee_id then
        raise exception 'Only the person who received the request can accept it.' using errcode = '42501';
      end if;
      if old.status = 'pending' and new.status = 'declined' and v_actor <> old.addressee_id then
        raise exception 'Only the person who received the request can decline it.' using errcode = '42501';
      end if;
      if old.status = 'pending' and new.status = 'cancelled' and v_actor <> old.requester_id then
        raise exception 'Only the person who sent the request can withdraw it.' using errcode = '42501';
      end if;
      if old.status = 'accepted' and new.status = 'cancelled' and v_actor not in (old.requester_id, old.addressee_id) then
        raise exception 'Only a friend can remove this friendship.' using errcode = '42501';
      end if;
    end if;
    new.responded_at := now();
  end if;

  return new;
end $$;

-- A brand-new group always makes its creator the owner.
create or replace function public.add_group_creator_as_owner()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (group_id, user_id) do nothing;
  return new;
end $$;

-- You can only pull an accepted friend into a group (V1 has no stranger invites).
create or replace function public.enforce_group_member_rules()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_privileged boolean := auth.uid() is null;
  v_creator uuid;
begin
  if v_privileged then return new; end if;

  select g.created_by into v_creator from public.groups g where g.id = new.group_id;

  if new.user_id = v_creator then
    return new; -- the owner is auto-added by trigger
  end if;

  if not public.is_group_member(new.group_id, v_actor) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;
  if not public.are_friends(v_actor, new.user_id) then
    raise exception 'You can only add people you are friends with.' using errcode = '42501';
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Settlements: only the payer can claim "I paid", and only the receiver can
-- confirm it. A receiver may also record money they already received in cash.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_settlement_rules()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_privileged boolean := auth.uid() is null;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    perform public.assert_financial_writes_allowed();
    if not v_privileged then
      if new.created_by <> v_actor then
        raise exception 'created_by must be the signed-in user.' using errcode = '42501';
      end if;
      if new.status = 'CONFIRMED' then
        if v_actor <> new.receiver_id then
          raise exception 'Only the person receiving the money can confirm it right away.'
            using errcode = '42501';
        end if;
        new.confirmed_at := now();
      else
        new.status := 'PENDING';
        new.confirmed_at := null;
      end if;
    end if;
    return new;
  end if;

  new.created_at   := old.created_at;
  new.created_by   := old.created_by;
  new.payer_id     := old.payer_id;
  new.receiver_id  := old.receiver_id;
  new.group_id     := old.group_id;
  new.amount       := old.amount;
  new.currency     := old.currency;
  new.client_request_id := old.client_request_id;
  new.updated_at   := now();

  if new.status is distinct from old.status then
    if not v_privileged then
      if not (
        (old.status = 'PENDING' and new.status = 'CONFIRMED' and v_actor = old.receiver_id) or
        (old.status = 'PENDING' and new.status = 'DISPUTED'  and v_actor = old.receiver_id) or
        (old.status = 'PENDING' and new.status = 'CANCELLED' and v_actor in (old.payer_id, old.receiver_id)) or
        (old.status = 'DISPUTED' and new.status = 'CONFIRMED' and v_actor = old.receiver_id)
      ) then
        raise exception 'That settlement change is not allowed (% -> %).', old.status, new.status
          using errcode = '55000';
      end if;
    end if;

    if new.status = 'CONFIRMED' then
      new.confirmed_at := now();
    else
      new.confirmed_at := null;
    end if;
  else
    new.confirmed_at := old.confirmed_at;
  end if;

  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Notifications/self-service rows keep server timestamps too.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_notification_rules()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.is_read := false;
    new.read_at := null;
    return new;
  end if;
  -- Only the read flag may change, and only by the owner.
  new.user_id      := old.user_id;
  new.type         := old.type;
  new.title        := old.title;
  new.body         := old.body;
  new.deep_link    := old.deep_link;
  new.dedupe_key   := old.dedupe_key;
  new.created_at   := old.created_at;
  new.related_expense_id    := old.related_expense_id;
  new.related_group_id      := old.related_group_id;
  new.related_user_id       := old.related_user_id;
  new.related_settlement_id := old.related_settlement_id;
  if new.is_read and not old.is_read then
    new.read_at := now();
  elsif not new.is_read then
    new.read_at := null;
  else
    new.read_at := old.read_at;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- New auth.users row (Google sign-in) -> profile row. Falls back to a unique
-- generated username if the Google name is unusable.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name     text;
  v_username text;
  v_suffix   int := 0;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(new.email, '@', 1),
    'Student'
  );

  v_username := lower(regexp_replace(split_part(coalesce(new.email, 'student'), '@', 1), '[^a-z0-9_]', '', 'g'));
  if char_length(v_username) < 3 then
    v_username := 'student' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  v_username := substr(v_username, 1, 20);

  while exists (select 1 from public.profiles p where p.username = v_username) loop
    v_suffix := v_suffix + 1;
    v_username := substr(v_username, 1, 18) || v_suffix::text;
  end loop;

  insert into public.profiles (id, full_name, username, email, avatar_url)
  values (new.id, left(v_name, 80), v_username, coalesce(new.email, v_username || '@oweme.local'),
          new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Group expenses: server timestamps, forced PENDING, membership required,
-- cancellation is the only status a user can move to.
-- -----------------------------------------------------------------------------
create or replace function public.assert_group_expense_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_privileged boolean := auth.uid() is null;
begin
  new.created_at   := now();
  new.updated_at   := now();
  new.status       := 'PENDING';
  new.cancelled_at := null;

  perform public.assert_expense_creation_allowed();

  if not v_privileged then
    if new.created_by <> v_actor then
      raise exception 'created_by must be the signed-in user.' using errcode = '42501';
    end if;
    if not public.is_group_member(new.group_id, v_actor) then
      raise exception 'You are not a member of this group.' using errcode = '42501';
    end if;
  end if;

  if not public.is_group_member(new.group_id, new.paid_by) then
    raise exception 'The payer must be a member of the group.' using errcode = '42501';
  end if;

  new.currency := coalesce((select g.currency from public.groups g where g.id = new.group_id), new.currency);
  return new;
end $$;

create or replace function public.assert_group_expense_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_privileged boolean := auth.uid() is null;
begin
  new.created_at        := old.created_at;
  new.created_by        := old.created_by;
  new.client_request_id := old.client_request_id;
  new.group_id          := old.group_id;
  new.paid_by           := old.paid_by;
  new.amount            := old.amount;
  new.currency          := old.currency;
  new.updated_at        := now();

  if new.status is distinct from old.status then
    if not (old.status = 'PENDING' and new.status = 'CANCELLED') then
      raise exception 'A group expense can only be cancelled (was %).', old.status using errcode = '55000';
    end if;
    if not v_privileged and v_actor not in (old.created_by, old.paid_by, (select g.created_by from public.groups g where g.id = old.group_id)) then
      raise exception 'Only the person who added it, who paid, or the group owner can cancel this.'
        using errcode = '42501';
    end if;
    if new.description = old.description then
      -- no-op description guard: nothing further
      null;
    end if;
    new.cancelled_at := now();
  else
    new.cancelled_at := old.cancelled_at;
    if new.description is distinct from old.description or new.category is distinct from old.category then
      if old.status <> 'PENDING' then
        raise exception 'This group expense can no longer be edited.' using errcode = '55000';
      end if;
      if not v_privileged and v_actor <> old.created_by then
        raise exception 'Only the person who added it can edit it.' using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Attach triggers
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists friendships_bi on public.friendships;
create trigger friendships_bi before insert on public.friendships
  for each row execute function public.enforce_friendship_rules();
drop trigger if exists friendships_bu on public.friendships;
create trigger friendships_bu before update on public.friendships
  for each row execute function public.enforce_friendship_rules();

drop trigger if exists expenses_bi on public.expenses;
create trigger expenses_bi before insert on public.expenses
  for each row execute function public.enforce_expense_transitions();
drop trigger if exists expenses_bu on public.expenses;
create trigger expenses_bu before update on public.expenses
  for each row execute function public.enforce_expense_transitions();
drop trigger if exists expenses_bd on public.expenses;
create trigger expenses_bd before delete on public.expenses
  for each row execute function public.protect_financial_delete();

drop trigger if exists expenses_ai on public.expenses;
create trigger expenses_ai after insert on public.expenses
  for each row execute function public.log_expense_event();
drop trigger if exists expenses_au on public.expenses;
create trigger expenses_au after update on public.expenses
  for each row execute function public.log_expense_event();

drop trigger if exists expense_events_no_update on public.expense_events;
create trigger expense_events_no_update before update on public.expense_events
  for each row execute function public.forbid_event_mutation();

drop trigger if exists groups_ai on public.groups;
create trigger groups_ai after insert on public.groups
  for each row execute function public.add_group_creator_as_owner();
drop trigger if exists groups_touch on public.groups;
create trigger groups_touch before update on public.groups
  for each row execute function public.touch_updated_at();

drop trigger if exists group_members_bi on public.group_members;
create trigger group_members_bi before insert on public.group_members
  for each row execute function public.enforce_group_member_rules();

drop trigger if exists group_expenses_bi on public.group_expenses;
create trigger group_expenses_bi before insert on public.group_expenses
  for each row execute function public.assert_group_expense_insert();
drop trigger if exists group_expenses_bu on public.group_expenses;
create trigger group_expenses_bu before update on public.group_expenses
  for each row execute function public.assert_group_expense_update();
drop trigger if exists group_expenses_bd on public.group_expenses;
create trigger group_expenses_bd before delete on public.group_expenses
  for each row execute function public.protect_financial_delete();

drop trigger if exists group_expense_shares_bi on public.group_expense_shares;
create trigger group_expense_shares_bi before insert on public.group_expense_shares
  for each row execute function public.assert_share_member();
drop trigger if exists group_expense_shares_reconcile_ai on public.group_expense_shares;
create constraint trigger group_expense_shares_reconcile_ai
  after insert or update or delete on public.group_expense_shares
  deferrable initially deferred
  for each row execute function public.assert_shares_reconcile();

drop trigger if exists settlements_bi on public.settlements;
create trigger settlements_bi before insert on public.settlements
  for each row execute function public.enforce_settlement_rules();
drop trigger if exists settlements_bu on public.settlements;
create trigger settlements_bu before update on public.settlements
  for each row execute function public.enforce_settlement_rules();
drop trigger if exists settlements_bd on public.settlements;
create trigger settlements_bd before delete on public.settlements
  for each row execute function public.protect_financial_delete();

drop trigger if exists notifications_bi on public.notifications;
create trigger notifications_bi before insert on public.notifications
  for each row execute function public.enforce_notification_rules();
drop trigger if exists notifications_bu on public.notifications;
create trigger notifications_bu before update on public.notifications
  for each row execute function public.enforce_notification_rules();

drop trigger if exists notification_preferences_touch on public.notification_preferences;
create trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function public.touch_updated_at();
