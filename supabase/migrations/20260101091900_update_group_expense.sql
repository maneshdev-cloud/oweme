-- =============================================================================
-- Migration: 20260101091900_update_group_expense.sql
-- Description: Group expense editing RPC allowing group owner/creator to update
-- amount, description, category, payers, and shares with automatic balance recalculation.
-- =============================================================================

create or replace function public.assert_group_expense_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_privileged boolean := auth.uid() is null or coalesce(current_setting('app.archival', true), '') = 'on';
  v_owner uuid;
begin
  select g.created_by into v_owner from public.groups g where g.id = old.group_id;

  new.created_at        := old.created_at;
  new.created_by        := old.created_by;
  new.client_request_id := old.client_request_id;
  new.group_id          := old.group_id;
  new.currency          := old.currency;
  new.updated_at        := now();

  if new.status is distinct from old.status then
    if not (old.status = 'PENDING' and new.status = 'CANCELLED') then
      raise exception 'A group expense can only be cancelled (was %).', old.status using errcode = '55000';
    end if;
    if not v_privileged and v_actor not in (old.created_by, old.paid_by, v_owner) then
      raise exception 'Only the person who added it, who paid, or the group owner can cancel this.'
        using errcode = '42501';
    end if;
    new.cancelled_at := now();
  else
    new.cancelled_at := old.cancelled_at;
    if old.status <> 'PENDING' then
      raise exception 'This group expense can no longer be edited.' using errcode = '55000';
    end if;
    -- Owner, creator, or privileged can update amount, description, category, and paid_by
    if not v_privileged and v_actor not in (old.created_by, v_owner) then
      raise exception 'Only the group owner or the person who added it can edit it.' using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

create or replace function public.update_group_expense_v2(
  p_expense_id        uuid,
  p_amount            numeric,
  p_description       text,
  p_category          text,
  p_payers            jsonb,
  p_shares            jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid         uuid := auth.uid();
  v_group_id    uuid;
  v_owner       uuid;
  v_creator     uuid;
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

  select ge.group_id, ge.created_by, g.created_by
    into v_group_id, v_creator, v_owner
    from public.group_expenses ge
    join public.groups g on g.id = ge.group_id
   where ge.id = p_expense_id and ge.status = 'PENDING';

  if v_group_id is null then
    raise exception 'Group expense not found or no longer editable.' using errcode = '22023';
  end if;

  -- Only group owner (or creator) can edit
  if not (public.is_group_owner(v_group_id, v_uid) or v_uid = v_creator) then
    raise exception 'Only the group owner can edit group expenses.' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = '22023';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'Amount can have at most 2 decimal places.' using errcode = '22023';
  end if;
  if p_description is null or btrim(p_description) = '' then
    raise exception 'Add a short description.' using errcode = '22023';
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
    if not public.is_group_member(v_group_id, v_p_uid) then
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
    if not public.is_group_member(v_group_id, v_s_uid) then
      raise exception 'Every share recipient must be a member of this group.' using errcode = '42501';
    end if;
    if v_s_amt is null or v_s_amt < 0 then
      raise exception 'Share amount cannot be negative.' using errcode = '22023';
    end if;
    v_share_total := v_share_total + v_s_amt;
  end loop;

  if round(v_share_total, 2) <> p_amount then
    raise exception 'Shares (%) must add up to total amount (%).', v_share_total, p_amount using errcode = '22023';
  end if;

  -- Update parent expense
  update public.group_expenses
     set amount = p_amount,
         description = btrim(p_description),
         category = coalesce(nullif(btrim(p_category), ''), 'Other'),
         paid_by = v_first_payer,
         updated_at = now()
   where id = p_expense_id;

  -- Replace payers
  delete from public.group_expense_payers where group_expense_id = p_expense_id;
  for v_payer in select * from jsonb_array_elements(p_payers) loop
    insert into public.group_expense_payers (group_expense_id, user_id, paid_amount)
    values (p_expense_id, (v_payer->>'user_id')::uuid, (v_payer->>'amount')::numeric);
  end loop;

  -- Replace shares
  delete from public.group_expense_shares where group_expense_id = p_expense_id;
  for v_share in select * from jsonb_array_elements(p_shares) loop
    insert into public.group_expense_shares (group_expense_id, user_id, share_amount)
    values (p_expense_id, (v_share->>'user_id')::uuid, (v_share->>'amount')::numeric);
  end loop;

end $$;

grant execute on function public.update_group_expense_v2(uuid, numeric, text, text, jsonb, jsonb) to authenticated;
