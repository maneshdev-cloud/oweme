-- =============================================================================
-- Migration: 20260101091000_group_admins_and_delete.sql
-- Description: Group admin role, member management, leaving, and group deletion.
-- =============================================================================

-- Add 'admin' role to group_role enum
alter type public.group_role add value if not exists 'admin';

-- -----------------------------------------------------------------------------
-- Foreign key cascade on delete for clean group deletion
-- -----------------------------------------------------------------------------
alter table public.settlements
  drop constraint if exists settlements_group_id_fkey,
  add constraint settlements_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete cascade;

alter table public.group_expenses
  drop constraint if exists group_expenses_group_id_fkey,
  add constraint group_expenses_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete cascade;

-- -----------------------------------------------------------------------------
-- is_group_owner: true if user is 'owner' or 'admin'
-- Admin has all privileges that owner has.
-- -----------------------------------------------------------------------------
create or replace function public.is_group_owner(p_group uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.group_members m
     where m.group_id = p_group and m.user_id = p_user and m.role in ('owner', 'admin')
  );
$$;

-- -----------------------------------------------------------------------------
-- assert_group_has_owner: a group must have at least one owner or admin
-- -----------------------------------------------------------------------------
create or replace function public.assert_group_has_owner()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_group uuid := coalesce(new.group_id, old.group_id);
  v_count int;
begin
  if not exists (select 1 from public.groups g where g.id = v_group) then
    return null; -- group itself was deleted
  end if;

  select count(*) into v_count from public.group_members m where m.group_id = v_group;
  if v_count = 0 then
    return null; -- all members left / group deleted
  end if;

  if not exists (
    select 1 from public.group_members m
     where m.group_id = v_group and m.role in ('owner', 'admin')
  ) then
    raise exception 'A group always needs an owner or admin.' using errcode = '23514';
  end if;
  return null;
end $$;

-- -----------------------------------------------------------------------------
-- enforce_group_member_removal: handles leaving and removal
-- -----------------------------------------------------------------------------
create or replace function public.enforce_group_member_removal()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_others int;
  v_net    numeric;
  v_owners int;
begin
  select count(*) into v_others
    from public.group_members m
   where m.group_id = old.group_id and m.user_id <> old.user_id;

  if v_others = 0 then
    -- When the last member leaves, delete the empty group
    delete from public.settlements where group_id = old.group_id;
    delete from public.group_expenses where group_id = old.group_id;
    delete from public.groups where id = old.group_id;
    return old;
  end if;

  select b.net into v_net from public.group_balances_for(old.group_id) b where b.user_id = old.user_id;

  if coalesce(v_net, 0) <> 0 then
    raise exception 'There is still an open balance of ₹% in this group. Settle it up first.',
      to_char(abs(v_net), 'FM999999999990.00') using errcode = '55000';
  end if;

  if old.role in ('owner', 'admin') then
    select count(*) into v_owners
      from public.group_members m
     where m.group_id = old.group_id and m.user_id <> old.user_id and m.role in ('owner', 'admin');

    if v_owners = 0 then
      raise exception 'Make another member admin or owner before you leave.' using errcode = '55000';
    end if;
  end if;

  return old;
end $$;

-- -----------------------------------------------------------------------------
-- Groups delete policy & delete RPC function
-- -----------------------------------------------------------------------------
drop policy if exists groups_delete_empty on public.groups;
drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner on public.groups
  for delete to authenticated
  using (
    public.is_group_owner(id, auth.uid())
    and coalesce((select sum(abs(b.net)) from public.group_balances_for(id) b), 0) = 0
  );

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_unsettled numeric;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  if not public.is_group_owner(p_group_id, v_uid) then
    raise exception 'Only a group owner or admin can delete this group.' using errcode = '42501';
  end if;

  select coalesce(sum(abs(b.net)), 0) into v_unsettled
    from public.group_balances_for(p_group_id) b;

  if v_unsettled > 0 then
    raise exception 'All group balances must be settled before deleting the group.' using errcode = '55000';
  end if;

  delete from public.settlements where group_id = p_group_id;
  delete from public.group_expenses where group_id = p_group_id;
  delete from public.group_members where group_id = p_group_id;
  delete from public.groups where id = p_group_id;
end $$;

grant execute on function public.delete_group(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Ensure Realtime broadcasts DELETE and UPDATE events for groups
-- -----------------------------------------------------------------------------
alter table public.groups replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groups'
    ) then
      alter publication supabase_realtime add table public.groups;
    end if;
  end if;
end $$;
