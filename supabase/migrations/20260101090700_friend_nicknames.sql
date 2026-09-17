-- =============================================================================
-- OweMe — 0007 friend nicknames & name change notifications
-- 1. Allows users to assign a private nickname / custom contact label to any friend
--    that only they see. This prevents identity confusion if a friend changes their
--    profile display name or username.
-- 2. Automatically notifies connected friends and open-balance counterparties when
--    a user updates their display name or username.
-- =============================================================================

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

-- Update my_friends() to return the private nickname if set by current user
drop function if exists public.my_friends();

create or replace function public.my_friends()
returns table (
  friendship_id uuid,
  friend_id uuid,
  full_name text,
  username text,
  avatar_url text,
  currency text,
  balance numeric,
  since timestamptz,
  nickname text
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
         fr.since,
         fn.nickname
  from fr
  join public.profiles p on p.id = fr.friend_id
  cross join me
  left join public.friend_nicknames fn on fn.user_id = me.uid and fn.friend_id = fr.friend_id
  left join public.my_balances() b on b.counterparty_id = fr.friend_id
  order by coalesce(fn.nickname, p.full_name) asc;
$$;

grant execute on function public.my_friends() to authenticated;

-- =============================================================================
-- Profile name / username update trigger -> notify connected friends & creditors
-- =============================================================================
create or replace function public.notify_from_profile_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old_name text := old.full_name;
  v_old_user text := old.username::text;
  v_new_name text := new.full_name;
  v_new_user text := new.username::text;
  v_title text;
  v_body text;
  v_friend_id uuid;
begin
  if (v_old_name is distinct from v_new_name) or (v_old_user is distinct from v_new_user) then
    v_title := v_old_name || ' changed their name';
    v_body  := v_old_name || ' (@' || v_old_user || ') changed their profile to ' || v_new_name || ' (@' || v_new_user || '). Check your balances.';

    for v_friend_id in
      select distinct other_id from (
        -- friends
        select case when requester_id = new.id then addressee_id else requester_id end as other_id
        from public.friendships
        where status = 'accepted' and (requester_id = new.id or addressee_id = new.id)
        union
        -- open balance counterparties
        select case when payer_id = new.id then debtor_id else payer_id end as other_id
        from public.expenses
        where (payer_id = new.id or debtor_id = new.id) and status in ('PENDING', 'PAYMENT_MARKED', 'DISPUTED')
      ) peers
      where other_id <> new.id
    loop
      perform public.create_notification(
        v_friend_id,
        'admin_announcement',
        v_title,
        v_body,
        '/friends',
        'name_change:' || new.id::text || ':' || now()::text,
        null,
        null,
        new.id,
        null
      );
    end loop;
  end if;

  return new;
end $$;

drop trigger if exists profiles_notify_update_trigger on public.profiles;
create trigger profiles_notify_update_trigger
  after update of full_name, username on public.profiles
  for each row
  execute function public.notify_from_profile_update();
