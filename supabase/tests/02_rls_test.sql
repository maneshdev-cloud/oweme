-- =============================================================================
-- OweMe — row level security isolation tests
--
-- These deliberately play the part of a malicious client: authenticated, with
-- the anon key, asking for rows and ids that do not belong to them.
-- =============================================================================
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\pset pager off

select tests.seed_users();

-- Seed: Manesh <-> Rahul are friends with one live expense; Priya is a stranger.
reset role;
select set_config('request.jwt.claim.sub', '', false);

insert into public.friendships (requester_id, addressee_id, status)
values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'accepted');

insert into public.expenses (id, payer_id, debtor_id, amount, description, category, created_by)
values ('aaaaaaaa-0000-4000-8000-0000000000f1',
        '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
        28.00, 'Printout', 'Printout', '11111111-1111-4111-8111-111111111111');

insert into public.groups (id, name, created_by)
values ('cccccccc-0000-4000-8000-0000000000f1', 'Private group', '11111111-1111-4111-8111-111111111111');

insert into public.settlements (id, payer_id, receiver_id, amount, created_by, status)
values ('bbbbbbbb-0000-4000-8000-0000000000f1',
        '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        28.00, '11111111-1111-4111-8111-111111111111', 'PENDING');

-- -----------------------------------------------------------------------------
select tests.section('a stranger ("Priya") cannot reach any of it');
-- -----------------------------------------------------------------------------
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);

select tests.assert((select count(*) from public.expenses) = 0,
  'expenses: the table reads as empty, not as an error');
select tests.assert(
  (select count(*) from public.expenses where id = 'aaaaaaaa-0000-4000-8000-0000000000f1') = 0,
  'expenses: asking for somebody''s expense by id returns nothing');
select tests.assert((select count(*) from public.friendships) = 0,
  'friendships: nothing visible');
select tests.assert((select count(*) from public.groups) = 0,
  'groups: nothing visible');
select tests.assert((select count(*) from public.group_members) = 0,
  'group_members: nothing visible');
select tests.assert((select count(*) from public.settlements) = 0,
  'settlements: nothing visible');
select tests.assert((select count(*) from public.notifications) = 0,
  'notifications: nothing visible');
select tests.assert((select count(*) from public.profiles) = 1,
  'profiles: only her own row');
select tests.assert(
  (select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 0,
  'profiles: another user''s row is invisible');

select tests.expect_blocked($q$
  update public.expenses set amount = 1 where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'
$q$, 'expenses: a stranger cannot edit somebody else''s expense');
select tests.expect_blocked($q$
  update public.expenses set status = 'CANCELLED' where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'
$q$, 'expenses: a stranger cannot cancel somebody else''s expense');
select tests.expect_blocked($q$
  delete from public.expenses where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'
$q$, 'expenses: a stranger cannot delete somebody else''s expense');
select tests.expect_error($q$
  insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by)
  values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
          999, 'forged', 'Other', '11111111-1111-4111-8111-111111111111')
$q$, 'expenses: she cannot create an expense in somebody else''s name');
select tests.expect_blocked($q$
  update public.group_members set role = 'owner'
   where group_id = 'cccccccc-0000-4000-8000-0000000000f1'
     and user_id = '11111111-1111-4111-8111-111111111111'
$q$, 'group_members: she cannot promote herself in a group she is not in');
select tests.expect_error($q$
  insert into public.group_members (group_id, user_id)
  values ('cccccccc-0000-4000-8000-0000000000f1', '33333333-3333-4333-8333-333333333333')
$q$, 'group_members: she cannot add herself to a private group');
select tests.expect_error($q$
  insert into public.groups (name, created_by) values ('sneaky', '11111111-1111-4111-8111-111111111111')
$q$, 'groups: she cannot create a group owned by somebody else');
select tests.expect_blocked($q$
  update public.settlements set status = 'CONFIRMED' where id = 'bbbbbbbb-0000-4000-8000-0000000000f1'
$q$, 'settlements: she cannot confirm money that is not hers');
select tests.expect_blocked($q$
  update public.profiles set full_name = 'Hacked' where id = '11111111-1111-4111-8111-111111111111'
$q$, 'profiles: she cannot rename somebody else');

-- public_profiles exists so the app can show names without leaking emails
select tests.assert(
  (select count(*) >= 6 from public.public_profiles),
  'public_profiles exposes everyone''s public fields');
select tests.assert(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'public_profiles' and column_name = 'email') = 0,
  'public_profiles has no email column at all');

-- Search is *meant* to find new people (that is how you add a friend), but it
-- may only ever expose the public fields, never the email or the auth row.
select tests.assert(
  (select count(*) = 1 from public.search_people('manesh')),
  'search finds people she is not yet connected to');
select tests.assert(
  (select username = 'manesh' from public.search_people('manesh')),
  'and returns only public fields');
select tests.expect_blocked($q$
  select tests.assert(true, 'noop') from public.profiles p where p.username = 'manesh'
$q$, 'while she still cannot open the underlying profile row');

-- -----------------------------------------------------------------------------
select tests.section('a participant ("Rahul") sees his own side and nothing else');
-- -----------------------------------------------------------------------------
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

select tests.assert((select count(*) from public.expenses) = 1, 'he sees the one expense he is part of');
select tests.assert((select count(*) from public.profiles) = 1, 'profiles: still only his own row');
select tests.assert(
  (select count(*) from public.search_people('manesh')) = 1,
  'search does find the friend he is looking for');
select tests.assert(
  (select username = 'manesh' and full_name = 'Manesh Patil' from public.search_people('manesh')),
  'and returns public fields only');
select tests.assert(
  (select balance = -28.00 from public.balance_with('11111111-1111-4111-8111-111111111111')),
  'his balance with Manesh is visible to him');

-- Rahul is the debtor: he may mark it paid, but not confirm it himself.
select tests.expect_ok($q$
  update public.expenses set status = 'PAYMENT_MARKED' where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'
$q$, 'the debtor can mark it paid');
select tests.expect_error($q$
  update public.expenses set status = 'CONFIRMED' where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'
$q$, 'but he cannot confirm his own payment');

-- Priya still cannot see it after the status change.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
select tests.assert(
  (select count(*) from public.expenses where id = 'aaaaaaaa-0000-4000-8000-0000000000f1') = 0,
  'a stranger still cannot see the expense after it changes state');

-- -----------------------------------------------------------------------------
select tests.section('the anon role gets nothing at all');
-- -----------------------------------------------------------------------------
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select tests.expect_error($q$ select count(*) from public.expenses $q$,
  'anon cannot read expenses');
select tests.expect_error($q$ select count(*) from public.notifications $q$,
  'anon cannot read notifications');
select tests.expect_error($q$ select count(*) from public.profiles $q$,
  'anon cannot read profiles');
select tests.expect_error($q$ select count(*) from public.public_profiles $q$,
  'anon cannot even read the public directory view');
select tests.expect_error($q$ select public.create_group_expense(
    'cccccccc-0000-4000-8000-0000000000f1', '11111111-1111-4111-8111-111111111111',
    10, 'x', 'Other', array['11111111-1111-4111-8111-111111111111']::uuid[]) $q$,
  'anon cannot call the group-expense RPC');
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- -----------------------------------------------------------------------------
select tests.section('archived history stays private to its participants');
-- -----------------------------------------------------------------------------
insert into public.archived_records (kind, original_id, participant_ids, snapshot, purge_after)
values ('expense', 'aaaaaaaa-0000-4000-8000-0000000000e1',
        array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[],
        '{"expense":{"amount":10}}'::jsonb, now() + interval '90 days');

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select tests.assert((select count(*) from public.archived_records) = 1,
  'a participant can read their archived history');
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
select tests.assert((select count(*) from public.archived_records) = 0,
  'a stranger cannot read archived history that is not theirs');
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select tests.expect_error($q$
  insert into public.archived_records (kind, original_id, participant_ids, snapshot, purge_after)
  values ('expense', gen_random_uuid(),
          array['11111111-1111-4111-8111-111111111111']::uuid[], '{}'::jsonb, now())
$q$, 'nobody can write to the archive from a client');

-- -----------------------------------------------------------------------------
select tests.section('notifications cannot be forged or read sideways');
-- -----------------------------------------------------------------------------
select tests.expect_error($q$
  insert into public.notifications (user_id, type, title, deep_link)
  values ('22222222-2222-4222-8222-222222222222', 'expense_created', 'fake', '/x')
$q$, 'Manesh cannot push a notification onto Rahul');
reset role;
select set_config('request.jwt.claim.sub', '', false);

\echo ''
\echo '✅  rls tests passed'
