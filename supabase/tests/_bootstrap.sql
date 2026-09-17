-- =============================================================================
-- Local test bootstrap: emulates the parts of a Supabase project that the
-- migrations depend on (`auth` schema, `auth.uid()`, the anon/authenticated/
-- service_role roles) so the real migrations can be executed and asserted
-- against a plain PostgreSQL instance.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/_bootstrap.sql
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = warning;

-- --- roles -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'postgres';
  end if;
end $$;

-- --- auth schema -------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Supabase's auth.uid(): the `sub` claim of the current request's JWT. Locally
-- we set it with `set local request.jwt.claim.sub = '<uuid>'`.
create or replace function auth.uid()
returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

grant usage on schema auth to public, anon, authenticated, service_role;
grant execute on function auth.uid() to public, anon, authenticated, service_role;
grant execute on function auth.role() to public, anon, authenticated, service_role;
grant select on auth.users to service_role;

-- --- extensions used by Supabase that we may not need locally ----------------
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to service_role;

-- --- migrations --------------------------------------------------------------
\i supabase/migrations/20260101090000_init_schema.sql
\i supabase/migrations/20260101090100_functions_triggers.sql
\i supabase/migrations/20260101090200_rls.sql
\i supabase/migrations/20260101090300_notifications.sql
\i supabase/migrations/20260101090400_views_balances.sql
\i supabase/migrations/20260101090500_admin_retention.sql

\echo '== migrations applied =='
