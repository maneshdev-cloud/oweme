-- -----------------------------------------------------------------------------
-- Admin Authorized Emails Table & Secure RBAC Management
-- -----------------------------------------------------------------------------

create table if not exists public.admin_authorized_emails (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  role text not null default 'admin', -- 'owner' | 'admin'
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Index for case-insensitive email lookups
create index if not exists admin_authorized_emails_lower_idx
  on public.admin_authorized_emails (lower(email));

-- Seed primary owner administrator
insert into public.admin_authorized_emails (email, role)
values ('maneshjadhavofficial@gmail.com', 'owner')
on conflict (email) do update set role = 'owner';

-- Update public.is_admin helper to verify both admin_users and admin_authorized_emails
create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user_email text;
begin
  if p_user is null then
    return false;
  end if;

  -- 1. Check existing admin_users table
  if exists (select 1 from public.admin_users a where a.user_id = p_user) then
    return true;
  end if;

  -- 2. Check auth.users email against authorized emails
  select lower(email) into v_user_email from auth.users where id = p_user;
  if v_user_email is not null then
    if exists (
      select 1 from public.admin_authorized_emails
      where lower(email) = v_user_email
    ) then
      -- Auto-link into admin_users for fast indexing and foreign key references
      insert into public.admin_users (user_id, note)
      values (p_user, 'authorized admin email')
      on conflict (user_id) do nothing;
      return true;
    end if;
  end if;

  return false;
end;
$$;

-- Enable RLS on admin_authorized_emails
alter table public.admin_authorized_emails enable row level security;

-- Only admins may view the authorized emails list
drop policy if exists admin_authorized_emails_select on public.admin_authorized_emails;
create policy admin_authorized_emails_select on public.admin_authorized_emails
  for select
  using (public.is_admin(auth.uid()));

-- Grants: authenticated users can query if they pass is_admin()
grant select on public.admin_authorized_emails to authenticated;
