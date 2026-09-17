set client_min_messages = warning;
-- =============================================================================
-- OweMe — test helpers (test database only, never shipped to production)
-- =============================================================================
create schema if not exists tests;

create or replace function tests.assert(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then
    raise notice '  ok    %', p_label;
  else
    raise exception 'FAILED: %', p_label;
  end if;
end $$;

create or replace function tests.section(p_label text)
returns void language plpgsql as $$
begin
  raise notice '';
  raise notice '── % ', p_label;
end $$;

-- Runs a statement that MUST be rejected. Deliberately NOT security definer, so
-- the statement executes with the caller's privileges (RLS included).
create or replace function tests.expect_error(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice '  ok    % → blocked [%]', p_label, left(replace(sqlerrm, E'\n', ' '), 90);
    return;
  end;
  raise exception 'FAILED: % → was ALLOWED, should have been blocked', p_label;
end $$;

-- Runs a statement that MUST be blocked. Accepts either an error (trigger /
-- constraint / policy rejection) or "touched zero rows" (RLS silently filtered
-- the row away, which is how row-level security blocks UPDATE/DELETE).
create or replace function tests.expect_blocked(p_sql text, p_label text)
returns void language plpgsql as $$
declare v_rows bigint;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
  exception when others then
    raise notice '  ok    % → blocked [%]', p_label, left(replace(sqlerrm, E'\n', ' '), 90);
    return;
  end;
  if v_rows = 0 then
    raise notice '  ok    % → 0 rows touched (row-level security filtered them)', p_label;
  else
    raise exception 'FAILED: % → % row(s) were affected, should have been blocked', p_label, v_rows;
  end if;
end $$;

-- Runs a statement that MUST succeed.
create or replace function tests.expect_ok(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise notice '  ok    %', p_label;
  exception when others then
    raise exception 'FAILED: % → unexpectedly blocked [%]', p_label, sqlerrm;
  end;
end $$;

-- Deferred constraint triggers (share reconciliation, "a group always has an
-- owner") fire at COMMIT, which is outside a caller's exception handler. This
-- helper forces them immediate so the rejection is observable here.
create or replace function tests.expect_error_at_commit(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  begin
    set constraints all immediate;
    execute p_sql;
  exception when others then
    set constraints all deferred;
    raise notice '  ok    % → blocked [%]', p_label, left(replace(sqlerrm, E'\n', ' '), 90);
    return;
  end;
  set constraints all deferred;
  raise exception 'FAILED: % → was ALLOWED, should have been blocked', p_label;
end $$;

grant usage on schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Fixed ids so the tests can talk about people by name.
create or replace function tests.seed_users()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    ('11111111-1111-4111-8111-111111111111', 'manesh@example.com', '{"full_name":"Manesh Patil","avatar_url":"https://example.com/m.png"}'),
    ('22222222-2222-4222-8222-222222222222', 'rahul@example.com',  '{"full_name":"Rahul Sharma"}'),
    ('33333333-3333-4333-8333-333333333333', 'priya@example.com',  '{"full_name":"Priya Nair"}'),
    ('44444444-4444-4444-8444-444444444444', 'sneha@example.com',  '{"full_name":"Sneha Rao"}'),
    -- a genuine stranger: friends with nobody, in no groups
    ('55555555-5555-4555-8555-555555555555', 'vikram@example.com', '{"full_name":"Vikram Iyer"}'),
    -- an isolated pair used by the retention tests
    ('66666666-6666-4666-8666-666666666666', 'anita@example.com',  '{"full_name":"Anita Deshmukh"}'),
    ('77777777-7777-4777-8777-777777777777', 'karan@example.com',  '{"full_name":"Karan Bhatt"}')
  on conflict (id) do nothing;
end $$;

grant execute on function tests.seed_users() to anon, authenticated, service_role;

-- `as_user(uuid)` — become a signed-in user for the rest of the session.
create or replace function tests.as_user(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, false);
$$;

grant execute on function tests.as_user(uuid) to anon, authenticated, service_role;
