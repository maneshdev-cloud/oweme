-- =============================================================================
-- OweMe — 0011 RLS fixes, amount bounds, and schema reload
-- 1. Fix RLS policies on settlements and expenses:
--    - Creditor/receiver can insert and confirm settlements.
--    - Debtor can mark expense paid (UPDATE) and creditor can confirm/dispute.
-- 2. Ensure friend_nicknames table exists and PostgREST schema cache is reloaded.
-- 3. Enforce hard amount range: minimum ₹0.10, maximum ₹5,000.00.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Settlements RLS policies
-- -----------------------------------------------------------------------------
drop policy if exists settlements_select_party on public.settlements;
create policy settlements_select_party on public.settlements
  for select to authenticated
  using (
    payer_id = auth.uid()
    or receiver_id = auth.uid()
    or (group_id is not null and public.is_group_member(group_id, auth.uid()))
    or public.is_admin()
  );

drop policy if exists settlements_insert_party on public.settlements;
create policy settlements_insert_party on public.settlements
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (payer_id = auth.uid() or receiver_id = auth.uid())
    and (group_id is null or public.is_group_member(group_id, auth.uid()))
  );

drop policy if exists settlements_update_party on public.settlements;
create policy settlements_update_party on public.settlements
  for update to authenticated
  using (payer_id = auth.uid() or receiver_id = auth.uid())
  with check (payer_id = auth.uid() or receiver_id = auth.uid());

grant select, insert, update on public.settlements to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Expenses RLS policies
-- -----------------------------------------------------------------------------
drop policy if exists expenses_select_participant on public.expenses;
create policy expenses_select_participant on public.expenses
  for select to authenticated
  using (payer_id = auth.uid() or debtor_id = auth.uid() or public.is_admin());

drop policy if exists expenses_insert_participant on public.expenses;
create policy expenses_insert_participant on public.expenses
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (payer_id = auth.uid() or debtor_id = auth.uid())
  );

drop policy if exists expenses_update_participant on public.expenses;
create policy expenses_update_participant on public.expenses
  for update to authenticated
  using (payer_id = auth.uid() or debtor_id = auth.uid())
  with check (payer_id = auth.uid() or debtor_id = auth.uid());

grant select, insert, update on public.expenses to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Ensure friend_nicknames table exists & permissions are granted
-- -----------------------------------------------------------------------------
create table if not exists public.friend_nicknames (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  friend_id  uuid not null references public.profiles (id) on delete cascade,
  nickname   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friend_nicknames_len check (char_length(btrim(nickname)) between 1 and 60),
  constraint friend_nicknames_no_self check (user_id <> friend_id)
);

create index if not exists friend_nicknames_user_idx on public.friend_nicknames (user_id);
alter table public.friend_nicknames enable row level security;

drop policy if exists "users manage their own friend nicknames" on public.friend_nicknames;
create policy "users manage their own friend nicknames"
  on public.friend_nicknames
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.friend_nicknames to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Amount Range Bounds: ₹0.10 min, ₹5,000.00 max
-- -----------------------------------------------------------------------------
alter table public.expenses drop constraint if exists expenses_amount_range;
alter table public.expenses add constraint expenses_amount_range
  check (amount >= 0.10 and amount <= 5000.00);

alter table public.group_expenses drop constraint if exists group_expenses_amount_range;
alter table public.group_expenses add constraint group_expenses_amount_range
  check (amount >= 0.10 and amount <= 5000.00);

alter table public.settlements drop constraint if exists settlements_amount_range;
alter table public.settlements add constraint settlements_amount_range
  check (amount >= 0.10 and amount <= 5000.00);

-- -----------------------------------------------------------------------------
-- 5. Reload PostgREST schema cache
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';
