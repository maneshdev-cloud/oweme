-- =============================================================================
-- OweMe — 0005 public views, search, balances, realtime
--
-- All cross-user reads go through a *public column* view or a guarded RPC, so
-- the profiles table itself stays "own row only" under RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- public_profiles: id + display fields only. Never email.
-- -----------------------------------------------------------------------------
create or replace view public.public_profiles as
  select p.id, p.full_name, p.username::text as username, p.avatar_url
  from public.profiles p;

comment on view public.public_profiles is
  'Public directory fields (no email). Readable by any signed-in user.';

revoke all on public.public_profiles from anon, public;
grant select on public.public_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- People search (debounced from the client). Public fields only, friends first.
-- -----------------------------------------------------------------------------
create or replace function public.search_people(p_query text, p_limit integer default 20)
returns table (
  id uuid,
  full_name text,
  username text,
  avatar_url text,
  friendship_id uuid,
  friendship_status public.friendship_status,
  request_direction text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_q   text := btrim(coalesce(p_query, ''));
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 then
    return;
  end if;

  return query
  select p.id,
         p.full_name,
         p.username::text,
         p.avatar_url,
         f.id,
         f.status,
         case when f.requester_id = v_uid then 'outgoing'
              when f.addressee_id = v_uid then 'incoming'
              else null end
  from public.profiles p
  left join public.friendships f
    on f.status in ('pending', 'accepted')
   and least(f.requester_id, f.addressee_id) = least(v_uid, p.id)
   and greatest(f.requester_id, f.addressee_id) = greatest(v_uid, p.id)
  where p.id <> v_uid
    and (
      p.username::text ilike '%' || v_q || '%'
      or p.full_name ilike '%' || v_q || '%'
    )
  order by
    (f.status = 'accepted') desc nulls last,
    (p.username::text ilike v_q || '%') desc,
    p.full_name asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end $$;

-- -----------------------------------------------------------------------------
-- 1:1 balances.
--
-- Sign convention everywhere in OweMe:
--   balance > 0  -> this person is OWED money ("You're owed")
--   balance < 0  -> this person OWES money   ("You owe")
--
-- Only live money counts: PENDING / PAYMENT_MARKED / DISPUTED expenses are
-- open, CONFIRMED ones are settled, CANCELLED ones never happened. Confirmed
-- 1:1 settlements reduce what the payer owed.
-- -----------------------------------------------------------------------------
create or replace function public.my_balances()
returns table (counterparty_id uuid, currency text, balance numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select auth.uid() as uid),
  open_expenses as (
    select case when e.payer_id = me.uid then e.debtor_id else e.payer_id end as cp,
           e.currency,
           case when e.payer_id = me.uid then e.amount else -e.amount end as delta
    from public.expenses e, me
    where (e.payer_id = me.uid or e.debtor_id = me.uid)
      and e.status in ('PENDING', 'PAYMENT_MARKED', 'DISPUTED')
  ),
  direct_settlements as (
    select case when s.payer_id = me.uid then s.receiver_id else s.payer_id end as cp,
           s.currency,
           case when s.payer_id = me.uid then s.amount else -s.amount end as delta
    from public.settlements s, me
    where s.group_id is null
      and (s.payer_id = me.uid or s.receiver_id = me.uid)
      and s.status = 'CONFIRMED'
  ),
  combined as (
    select * from open_expenses union all select * from direct_settlements
  )
  select cp, currency, sum(delta)::numeric(14,2) as balance
  from combined
  where cp is not null
  group by cp, currency
  having sum(delta) <> 0;
$$;

create or replace function public.balance_with(p_other uuid)
returns table (currency text, balance numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.currency, b.balance from public.my_balances() b where b.counterparty_id = p_other;
$$;

-- Total you owe / are owed, across everyone (INR dashboard header).
create or replace function public.my_totals()
returns table (currency text, you_are_owed numeric, you_owe numeric, net numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.currency,
         coalesce(sum(case when b.balance > 0 then b.balance else 0 end), 0)::numeric(14,2),
         coalesce(sum(case when b.balance < 0 then -b.balance else 0 end), 0)::numeric(14,2),
         coalesce(sum(b.balance), 0)::numeric(14,2)
  from public.my_balances() b
  group by b.currency;
$$;

-- Friends + their live balance, ready for the Friends screen.
create or replace function public.my_friends()
returns table (
  friendship_id uuid,
  friend_id uuid,
  full_name text,
  username text,
  avatar_url text,
  currency text,
  balance numeric,
  since timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select auth.uid() as uid),
  fr as (
    select f.id, case when f.requester_id = me.uid then f.addressee_id else f.requester_id end as friend_id,
           coalesce(f.responded_at, f.created_at) as since
    from public.friendships f, me
    where f.status = 'accepted' and (f.requester_id = me.uid or f.addressee_id = me.uid)
  )
  select fr.id, fr.friend_id, p.full_name, p.username::text, p.avatar_url,
         coalesce(b.currency, 'INR') as currency,
         coalesce(b.balance, 0)::numeric(14,2) as balance,
         fr.since
  from fr
  join public.profiles p on p.id = fr.friend_id
  left join public.my_balances() b on b.counterparty_id = fr.friend_id
  order by p.full_name asc;
$$;

-- -----------------------------------------------------------------------------
-- Group balances: paid, share, settled in/out and the resulting net.
-- Guarded: only members (or admins) can read a group's numbers.
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
  paid_by_user as (
    select l.paid_by as uid, sum(l.amount) as amt from live l group by l.paid_by
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

-- Group list screen.
create or replace function public.my_group_summaries()
returns table (
  group_id uuid,
  name text,
  description text,
  currency text,
  member_count integer,
  my_net numeric,
  role public.group_role,
  created_at timestamptz,
  last_activity_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select g.id, g.name, g.description, g.currency,
         (select count(*)::int from public.group_members m2 where m2.group_id = g.id),
         coalesce((select b.net from public.group_balances_for(g.id) b where b.user_id = auth.uid()), 0)::numeric(14,2),
         m.role,
         g.created_at,
         greatest(
           coalesce((select max(ge.created_at) from public.group_expenses ge where ge.group_id = g.id), g.created_at),
           coalesce((select max(s.created_at) from public.settlements s where s.group_id = g.id), g.created_at)
         ) as last_activity_at
  from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = auth.uid()
  where g.archived_at is null
  order by last_activity_at desc;
$$;

-- -----------------------------------------------------------------------------
-- Leaving / removing a member: never silently strand an open balance, and never
-- leave a group ownerless.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_group_member_removal()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_privileged boolean := auth.uid() is null;
  v_others int;
  v_net numeric;
begin
  if v_privileged then return old; end if;

  select count(*) into v_others
    from public.group_members m
   where m.group_id = old.group_id and m.user_id <> old.user_id;

  if v_others = 0 then
    return old; -- last person out; the group is archived by the app
  end if;

  if public.is_group_owner(old.group_id, old.user_id) then
    raise exception 'Hand the group over to someone else before you leave it.' using errcode = '55000';
  end if;

  select b.net into v_net from public.group_balances_for(old.group_id) b where b.user_id = old.user_id;

  if coalesce(v_net, 0) <> 0 then
    raise exception 'There is still an open balance of ₹% in this group. Settle it up first.',
      to_char(abs(v_net), 'FM999999999990.00') using errcode = '55000';
  end if;

  return old;
end $$;

create or replace function public.assert_group_has_owner()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_group uuid := coalesce(new.group_id, old.group_id);
begin
  if not exists (select 1 from public.groups g where g.id = v_group) then
    return null; -- group itself is gone
  end if;
  if not exists (select 1 from public.group_members m where m.group_id = v_group and m.role = 'owner') then
    raise exception 'A group always needs an owner.' using errcode = '23514';
  end if;
  return null;
end $$;

drop trigger if exists group_members_bd on public.group_members;
create trigger group_members_bd before delete on public.group_members
  for each row execute function public.enforce_group_member_removal();

drop trigger if exists group_members_owner_guard on public.group_members;
create constraint trigger group_members_owner_guard
  after insert or update or delete on public.group_members
  deferrable initially deferred
  for each row execute function public.assert_group_has_owner();

-- -----------------------------------------------------------------------------
-- Realtime: every table a client subscribes to must be in the publication.
-- (On a hosted Supabase project this is what `alter publication` below does;
--  the DO block also works on a plain Postgres used for tests.)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'expenses', 'expense_events', 'friendships', 'notifications',
    'groups', 'group_members', 'group_expenses', 'group_expense_shares',
    'settlements', 'app_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Realtime DELETE payloads need the old row to be identifiable.
alter table public.expenses            replica identity full;
alter table public.group_expenses      replica identity full;
alter table public.settlements         replica identity full;
alter table public.group_members       replica identity full;
alter table public.group_expense_shares replica identity full;

-- -----------------------------------------------------------------------------
-- Grants for the RPCs the client calls directly.
-- -----------------------------------------------------------------------------
grant execute on function
  public.search_people(text, integer),
  public.my_balances(),
  public.balance_with(uuid),
  public.my_totals(),
  public.my_friends(),
  public.group_balances_for(uuid),
  public.my_group_summaries(),
  public.split_equally(numeric, uuid[]),
  public.create_group_expense(uuid, uuid, numeric, text, text, uuid[], uuid),
  public.is_admin(uuid),
  public.are_friends(uuid, uuid),
  public.is_group_member(uuid, uuid),
  public.is_group_owner(uuid, uuid),
  public.is_expense_participant(uuid, uuid),
  public.is_settlement_party(uuid, uuid),
  public.is_group_expense_visible(uuid, uuid)
to authenticated;

revoke execute on function
  public.setting_bool(text, boolean),
  public.enforce_group_member_removal(),
  public.assert_group_has_owner(),
  public.group_balances_for(uuid)
from public, anon;

grant execute on function public.group_balances_for(uuid) to authenticated;
grant execute on function public.setting_bool(text, boolean) to authenticated;
