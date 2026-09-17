-- =============================================================================
-- Migration: 20260101090900_group_expense_payers.sql
-- Description: Multi-payer support for group expenses with real-time sync
-- and dynamic balance calculation.
-- =============================================================================

create table if not exists public.group_expense_payers (
  id               uuid primary key default gen_random_uuid(),
  group_expense_id uuid not null references public.group_expenses (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete restrict,
  paid_amount      numeric(14,2) not null,
  created_at       timestamptz not null default now(),
  constraint group_expense_payers_amount_positive check (paid_amount > 0),
  constraint group_expense_payers_unique unique (group_expense_id, user_id)
);

create index if not exists idx_group_expense_payers_expense on public.group_expense_payers (group_expense_id);
create index if not exists idx_group_expense_payers_user on public.group_expense_payers (user_id);

-- -----------------------------------------------------------------------------
-- Reconcile trigger: when payers exist, their sum must equal the expense total.
-- -----------------------------------------------------------------------------
create or replace function public.assert_group_expense_payers_reconcile()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_expense_id uuid := coalesce(new.group_expense_id, old.group_expense_id);
  v_total      numeric(14,2);
  v_sum        numeric(14,2);
  v_count      int;
  v_status     public.expense_status;
begin
  select ge.amount, ge.status into v_total, v_status
    from public.group_expenses ge where ge.id = v_expense_id;

  if v_total is null then return null; end if;

  if v_status = 'PENDING' then
    select coalesce(sum(p.paid_amount), 0), count(*) into v_sum, v_count
      from public.group_expense_payers p where p.group_expense_id = v_expense_id;

    if v_count > 0 and v_sum <> v_total then
      raise exception 'Group expense payers (%) must add up to the total (%)', v_sum, v_total
        using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_assert_group_expense_payers_reconcile on public.group_expense_payers;
create constraint trigger trg_assert_group_expense_payers_reconcile
  after insert or update or delete on public.group_expense_payers
  deferrable initially deferred
  for each row execute function public.assert_group_expense_payers_reconcile();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.group_expense_payers enable row level security;

drop policy if exists group_expense_payers_select_member on public.group_expense_payers;
create policy group_expense_payers_select_member on public.group_expense_payers
  for select to authenticated
  using (public.is_group_expense_visible(group_expense_id, auth.uid()) or public.is_admin());

drop policy if exists group_expense_payers_insert_member on public.group_expense_payers;
create policy group_expense_payers_insert_member on public.group_expense_payers
  for insert to authenticated
  with check (public.is_group_expense_visible(group_expense_id, auth.uid()));

drop policy if exists group_expense_payers_update_member on public.group_expense_payers;
create policy group_expense_payers_update_member on public.group_expense_payers
  for update to authenticated
  using (public.is_group_expense_visible(group_expense_id, auth.uid()))
  with check (public.is_group_expense_visible(group_expense_id, auth.uid()));

drop policy if exists group_expense_payers_delete_member on public.group_expense_payers;
create policy group_expense_payers_delete_member on public.group_expense_payers
  for delete to authenticated
  using (public.is_group_expense_visible(group_expense_id, auth.uid()));

grant select, insert, update, delete on public.group_expense_payers to authenticated;

-- -----------------------------------------------------------------------------
-- Dynamic group balance calculation with multi-payer support
-- -----------------------------------------------------------------------------
create or replace function public.group_balances_for(p_group uuid)
returns table (
  user_id uuid,
  paid numeric,
  share numeric,
  settled_out numeric,
  settled_in numeric,
  net numeric
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.is_group_member(p_group, auth.uid()) and not public.is_admin() then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;

  return query
  with members as (
    select m.user_id from public.group_members m where m.group_id = p_group
  ),
  live as (
    select id, paid_by, amount from public.group_expenses
     where group_id = p_group and status = 'PENDING'
  ),
  all_payments as (
    select gep.user_id as uid, gep.paid_amount as amt
      from public.group_expense_payers gep
      join live l on l.id = gep.group_expense_id
    union all
    select l.paid_by as uid, l.amount as amt
      from live l
     where not exists (
       select 1 from public.group_expense_payers gep
        where gep.group_expense_id = l.id
     )
  ),
  paid_by_user as (
    select ap.uid, sum(ap.amt) as amt from all_payments ap group by ap.uid
  ),
  share_by_user as (
    select s.user_id as uid, sum(s.share_amount) as amt
      from public.group_expense_shares s
      join live l on l.id = s.group_expense_id
     group by s.user_id
  ),
  out_by_user as (
    select s.payer_id as uid, sum(s.amount) as amt from public.settlements s
     where s.group_id = p_group and s.status = 'CONFIRMED' group by s.payer_id
  ),
  in_by_user as (
    select s.receiver_id as uid, sum(s.amount) as amt from public.settlements s
     where s.group_id = p_group and s.status = 'CONFIRMED' group by s.receiver_id
  )
  select m.user_id,
         coalesce(po.amt, 0)::numeric(14,2),
         coalesce(sh.amt, 0)::numeric(14,2),
         coalesce(ob.amt, 0)::numeric(14,2),
         coalesce(ib.amt, 0)::numeric(14,2),
         (coalesce(po.amt, 0) - coalesce(sh.amt, 0) + coalesce(ob.amt, 0) - coalesce(ib.amt, 0))::numeric(14,2)
  from members m
  left join paid_by_user po on po.uid = m.user_id
  left join share_by_user sh on sh.uid = m.user_id
  left join out_by_user ob on ob.uid = m.user_id
  left join in_by_user ib on ib.uid = m.user_id;
end $$;

-- -----------------------------------------------------------------------------
-- Atomic multi-payer and custom/equal share creator
-- -----------------------------------------------------------------------------
create or replace function public.create_group_expense_v2(
  p_group_id          uuid,
  p_amount            numeric,
  p_description       text,
  p_category          text,
  p_payers            jsonb,
  p_shares            jsonb,
  p_client_request_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid         uuid := auth.uid();
  v_id          uuid;
  v_existing    uuid;
  v_first_payer uuid;
  v_payer_total numeric := 0;
  v_share_total numeric := 0;
  v_payer       jsonb;
  v_share       jsonb;
  v_p_uid       uuid;
  v_p_amt       numeric;
  v_s_uid       uuid;
  v_s_amt       numeric;
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

  if jsonb_array_length(p_payers) = 0 then
    raise exception 'At least one payer is required.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_shares) = 0 then
    raise exception 'At least one share is required.' using errcode = '22023';
  end if;

  -- Validate payers
  for v_payer in select * from jsonb_array_elements(p_payers) loop
    v_p_uid := (v_payer->>'user_id')::uuid;
    v_p_amt := (v_payer->>'amount')::numeric;
    if not public.is_group_member(p_group_id, v_p_uid) then
      raise exception 'Every payer must be a member of this group.' using errcode = '42501';
    end if;
    if v_p_amt is null or v_p_amt <= 0 then
      raise exception 'Payer amount must be positive.' using errcode = '22023';
    end if;
    if v_first_payer is null then
      v_first_payer := v_p_uid;
    end if;
    v_payer_total := v_payer_total + v_p_amt;
  end loop;

  if round(v_payer_total, 2) <> p_amount then
    raise exception 'Payer amounts (%) must equal total amount (%).', v_payer_total, p_amount using errcode = '22023';
  end if;

  -- Validate shares
  for v_share in select * from jsonb_array_elements(p_shares) loop
    v_s_uid := (v_share->>'user_id')::uuid;
    v_s_amt := (v_share->>'amount')::numeric;
    if not public.is_group_member(p_group_id, v_s_uid) then
      raise exception 'Every share recipient must be a member of this group.' using errcode = '42501';
    end if;
    if v_s_amt is null or v_s_amt <= 0 then
      raise exception 'Share amount must be positive.' using errcode = '22023';
    end if;
    v_share_total := v_share_total + v_s_amt;
  end loop;

  if round(v_share_total, 2) <> p_amount then
    raise exception 'Share amounts (%) must equal total amount (%).', v_share_total, p_amount using errcode = '22023';
  end if;

  -- Idempotency check
  if p_client_request_id is not null then
    select id into v_existing from public.group_expenses
     where created_by = v_uid and client_request_id = p_client_request_id;
    if v_existing is not null then return v_existing; end if;
  end if;

  insert into public.group_expenses
    (group_id, paid_by, amount, currency, description, category, created_by, client_request_id)
  values
    (p_group_id, v_first_payer, p_amount,
     coalesce((select g.currency from public.groups g where g.id = p_group_id), 'INR'),
     btrim(p_description),
     coalesce(nullif(btrim(p_category), ''), 'Other'),
     v_uid, p_client_request_id)
  returning id into v_id;

  -- Insert payers
  for v_payer in select * from jsonb_array_elements(p_payers) loop
    insert into public.group_expense_payers (group_expense_id, user_id, paid_amount)
    values (v_id, (v_payer->>'user_id')::uuid, (v_payer->>'amount')::numeric);
  end loop;

  -- Insert shares
  for v_share in select * from jsonb_array_elements(p_shares) loop
    insert into public.group_expense_shares (group_expense_id, user_id, share_amount)
    values (v_id, (v_share->>'user_id')::uuid, (v_share->>'amount')::numeric);
  end loop;

  return v_id;
end $$;

grant execute on function public.create_group_expense_v2(uuid, numeric, text, text, jsonb, jsonb, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Update legacy create_group_expense to also record into group_expense_payers
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

  insert into public.group_expense_payers (group_expense_id, user_id, paid_amount)
  values (v_id, p_paid_by, p_amount);

  insert into public.group_expense_shares (group_expense_id, user_id, share_amount)
  select v_id, s.user_id, s.share_amount from public.split_equally(p_amount, v_clean) s;

  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Real-time publication
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.group_expense_payers;
  end if;
exception
  when duplicate_object then null;
end $$;
