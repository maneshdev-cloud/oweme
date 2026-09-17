-- =============================================================================
-- OweMe — domain / state machine / balance / retention tests
-- Run with:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_domain_test.sql
-- =============================================================================
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\pset pager off
set client_min_messages = notice;

select tests.seed_users();

select tests.section('profiles are created by the auth trigger');
select tests.assert(
  (select count(*) from public.profiles) = 7,
  'every auth user produced a profile');
select tests.assert(
  (select username::text from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'manesh',
  'username is derived from the email local part');
select tests.assert(
  (select avatar_url is not null from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'avatar url comes across from the OAuth metadata');
select tests.assert(
  (select count(*) from public.notification_preferences) = 7,
  'a notification preferences row is created per user');

-- -----------------------------------------------------------------------------
select tests.section('friendships');
-- -----------------------------------------------------------------------------
set role authenticated;
select tests.as_user('11111111-1111-4111-8111-111111111111');

select tests.expect_ok($q$
  insert into public.friendships (requester_id, addressee_id)
  values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
$q$, 'Manesh can send Rahul a friend request');

select tests.expect_error($q$
  insert into public.friendships (requester_id, addressee_id)
  values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
$q$, 'the same request cannot be sent twice');

select tests.expect_error($q$
  insert into public.friendships (requester_id, addressee_id)
  values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111')
$q$, 'the reverse duplicate request is blocked too (one live row per pair)');

select tests.expect_error($q$
  update public.friendships set status = 'accepted'
  where requester_id = '11111111-1111-4111-8111-111111111111'
$q$, 'Manesh cannot accept his own outgoing request');

select tests.expect_error($q$
  insert into public.friendships (requester_id, addressee_id)
  values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111')
$q$, 'you cannot friend yourself');

select tests.as_user('22222222-2222-4222-8222-222222222222');
select tests.expect_ok($q$
  update public.friendships set status = 'accepted'
  where requester_id = '11111111-1111-4111-8111-111111111111'
$q$, 'Rahul can accept the request he received');

-- Manesh and Priya, Sneha also become friends (for later flows)
select tests.as_user('33333333-3333-4333-8333-333333333333');
insert into public.friendships (requester_id, addressee_id)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');
select tests.as_user('11111111-1111-4111-8111-111111111111');
update public.friendships set status = 'accepted'
 where requester_id = '33333333-3333-4333-8333-333333333333';

select tests.as_user('22222222-2222-4222-8222-222222222222');
insert into public.friendships (requester_id, addressee_id)
values ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
select tests.as_user('33333333-3333-4333-8333-333333333333');
update public.friendships set status = 'accepted'
 where requester_id = '22222222-2222-4222-8222-222222222222';

select tests.as_user('44444444-4444-4444-8444-444444444444');
insert into public.friendships (requester_id, addressee_id)
values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111');
select tests.as_user('11111111-1111-4111-8111-111111111111');
update public.friendships set status = 'accepted'
 where requester_id = '44444444-4444-4444-8444-444444444444';

select tests.assert(public.are_friends('11111111-1111-4111-8111-111111111111',
                                       '22222222-2222-4222-8222-222222222222'),
  'are_friends() reports the accepted pair');
select tests.assert(not public.are_friends('33333333-3333-4333-8333-333333333333',
                                           '44444444-4444-4444-8444-444444444444'),
  'strangers are not friends');

-- -----------------------------------------------------------------------------
select tests.section('adding an expense');
-- -----------------------------------------------------------------------------
select tests.as_user('22222222-2222-4222-8222-222222222222');

select tests.expect_error($q$
  insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by)
  values ('22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555',
          50, 'canteen', 'Food', '22222222-2222-4222-8222-222222222222')
$q$, 'Rahul cannot add an expense with a stranger');

select tests.expect_error($q$
  insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by)
  values ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
          50, 'self', 'Food', '22222222-2222-4222-8222-222222222222')
$q$, 'nobody can owe themselves');

select tests.expect_error($q$
  insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by)
  values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
          0, 'zero', 'Food', '22222222-2222-4222-8222-222222222222')
$q$, 'amount must be greater than zero');

select tests.expect_error($q$
  insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by)
  values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
          -10, 'negative', 'Food', '22222222-2222-4222-8222-222222222222')
$q$, 'negative amounts are rejected');

select tests.expect_error($q$
  insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by, status)
  values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
          10, 'pre-settled', 'Food', '22222222-2222-4222-8222-222222222222', 'CONFIRMED')
$q$, 'a new expense cannot be inserted as already settled');

-- Manesh pays ₹28 for Rahul's printout (the product's headline example).
select tests.as_user('11111111-1111-4111-8111-111111111111');
insert into public.expenses (id, payer_id, debtor_id, amount, description, category, created_by, client_request_id)
values ('aaaaaaaa-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        28.00, 'Printout', 'Printout',
        '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001');

select tests.assert(
  (select status = 'PENDING' from public.expenses where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'a new expense starts PENDING');
select tests.assert(
  (select count(*) from public.expense_events
    where expense_id = 'aaaaaaaa-0000-4000-8000-000000000001' and event_type = 'created') = 1,
  'the created event is written to the timeline');
select tests.assert(
  (select settled_at is null from public.expenses where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'settled_at is null while the expense is open');

-- Idempotency: the same client_request_id cannot create a second expense.
select tests.expect_error($q$
  insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by, client_request_id)
  values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
          28.00, 'Printout', 'Printout',
          '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001')
$q$, 'a double-submitted form cannot create a duplicate expense');

select tests.expect_error($q$
  insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by)
  values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
          10, 'not mine to create', 'Food', '33333333-3333-4333-8333-333333333333')
$q$, 'created_by must be the signed-in user');

select tests.section('the notification was created server-side');
reset role;
select tests.assert(
  (select count(*) from public.notifications
    where user_id = '22222222-2222-4222-8222-222222222222' and type = 'expense_created') = 1,
  'Rahul has an expense_created notification waiting');
select tests.assert(
  (select body like '%₹28.00%' from public.notifications
    where user_id = '22222222-2222-4222-8222-222222222222' and type = 'expense_created'),
  'the notification body carries the amount');
select tests.assert(
  (select deep_link = '/expenses/aaaaaaaa-0000-4000-8000-000000000001' from public.notifications
    where user_id = '22222222-2222-4222-8222-222222222222' and type = 'expense_created'),
  'the notification deep-links to the expense');

-- -----------------------------------------------------------------------------
select tests.section('payment state machine');
-- -----------------------------------------------------------------------------
select tests.as_user('22222222-2222-4222-8222-222222222222');
select tests.expect_error($q$
  update public.expenses set status = 'CONFIRMED' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'the debtor cannot jump straight to CONFIRMED');

select tests.as_user('11111111-1111-4111-8111-111111111111');
select tests.expect_error($q$
  update public.expenses set status = 'PAYMENT_MARKED' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'the creditor cannot mark their own expense as paid');

select tests.expect_error($q$
  update public.expenses set status = 'DISPUTED' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'PENDING cannot jump to DISPUTED');

select tests.as_user('22222222-2222-4222-8222-222222222222');
select tests.expect_ok($q$
  update public.expenses set status = 'PAYMENT_MARKED' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'the debtor marks it as paid');

reset role;
select tests.assert(
  (select count(*) from public.notifications
    where user_id = '11111111-1111-4111-8111-111111111111' and type = 'payment_marked') = 1,
  'the creditor is asked "Did you receive this payment?"');
set role authenticated;
select tests.as_user('22222222-2222-4222-8222-222222222222');

-- Re-sending the same status (double tap / retry) is an idempotent no-op: no
-- second event, no second notification, and it can never move the record back.
select tests.expect_ok($q$
  update public.expenses set status = 'PAYMENT_MARKED' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 're-sending "marked as paid" is a harmless no-op');
reset role;
select tests.assert(
  (select count(*) from public.expense_events
    where expense_id = 'aaaaaaaa-0000-4000-8000-000000000001' and event_type = 'payment_marked') = 1,
  'the no-op did not duplicate the timeline event');
select tests.assert(
  (select count(*) from public.notifications
    where related_expense_id = 'aaaaaaaa-0000-4000-8000-000000000001' and type = 'payment_marked') = 1,
  'the no-op did not re-notify the creditor');
set role authenticated;
select tests.as_user('22222222-2222-4222-8222-222222222222');
select tests.expect_error($q$
  update public.expenses set status = 'PENDING' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'a marked payment cannot be pushed back to PENDING');

select tests.as_user('33333333-3333-4333-8333-333333333333');
select tests.expect_blocked($q$
  update public.expenses set status = 'CONFIRMED' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'a bystander cannot even see, let alone confirm, somebody else''s expense');
reset role;
select tests.assert(
  (select status = 'PAYMENT_MARKED' from public.expenses where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'the bystander attack changed nothing');
set role authenticated;
select tests.as_user('33333333-3333-4333-8333-333333333333');

select tests.as_user('11111111-1111-4111-8111-111111111111');
select tests.expect_ok($q$
  update public.expenses set status = 'DISPUTED' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'the creditor disputes it instead');

reset role;
select tests.assert(
  (select count(*) from public.notifications
    where user_id = '22222222-2222-4222-8222-222222222222' and type = 'payment_disputed') = 1,
  'the debtor is told about the dispute');
select tests.assert(
  (select status = 'DISPUTED' and settled_at is null from public.expenses
    where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'a disputed expense is not auto-resolved and stays unsettled');
set role authenticated;
select tests.as_user('11111111-1111-4111-8111-111111111111');

select tests.expect_error($q$
  update public.expenses set status = 'CANCELLED' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'a disputed expense cannot be cancelled away');

select tests.expect_blocked($q$
  delete from public.expenses where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'a user cannot delete an unresolved expense (no delete policy at all)');

select tests.as_user('22222222-2222-4222-8222-222222222222');
select tests.expect_ok($q$
  update public.expenses set status = 'PAYMENT_MARKED' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'the debtor can re-assert payment after a dispute');

select tests.as_user('11111111-1111-4111-8111-111111111111');
select tests.expect_ok($q$
  update public.expenses set status = 'CONFIRMED' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'the creditor confirms once the money actually arrived');

select tests.assert(
  (select settled_at is not null from public.expenses where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'confirming stamps settled_at with server time');
select tests.assert(
  (select count(*) from public.expense_events where expense_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 5,
  'every transition and only every transition is on the timeline (created, marked, disputed, marked, confirmed)');
select tests.assert(
  (select string_agg(event_type, '>' order by id) from public.expense_events
    where expense_id = 'aaaaaaaa-0000-4000-8000-000000000001')
  = 'created>payment_marked>disputed>payment_marked>confirmed',
  'the timeline reads back in order');

select tests.expect_error($q$
  update public.expenses set status = 'PAYMENT_MARKED' where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'a confirmed expense cannot be un-settled');
select tests.expect_error($q$
  update public.expenses set amount = 280 where id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'money on a settled expense cannot be edited');
select tests.expect_error($q$
  update public.expense_events set event_type = 'poked' where expense_id = 'aaaaaaaa-0000-4000-8000-000000000001'
$q$, 'the audit log cannot be rewritten');

-- A cancelled expense (the third legal path)
select tests.as_user('22222222-2222-4222-8222-222222222222');
insert into public.expenses (id, payer_id, debtor_id, amount, description, category, created_by)
values ('aaaaaaaa-0000-4000-8000-000000000002',
        '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
        75, 'Chai for the batch', 'Food', '22222222-2222-4222-8222-222222222222');
select tests.expect_ok($q$
  update public.expenses set status = 'CANCELLED' where id = 'aaaaaaaa-0000-4000-8000-000000000002'
$q$, 'an open expense can be cancelled (soft)');
select tests.assert(
  (select count(*) from public.expenses where id = 'aaaaaaaa-0000-4000-8000-000000000002') = 1,
  'the cancelled record still exists — it was not deleted');
select tests.assert(
  (select count(*) from public.expense_events
    where expense_id = 'aaaaaaaa-0000-4000-8000-000000000002' and event_type = 'cancelled') = 1,
  'cancelling is recorded on the timeline');

-- A privileged caller still cannot delete an unresolved record.
reset role;
select tests.expect_error($q$
  delete from public.expenses where id = 'aaaaaaaa-0000-4000-8000-000000000002'
$q$, 'even the service role cannot delete a soft-cancelled record outside archival');

-- -----------------------------------------------------------------------------
select tests.section('balances and exact zero-sum settlement');
-- -----------------------------------------------------------------------------
-- Manesh paid 28 for Rahul, and that is now CONFIRMED -> nothing outstanding.
reset role;
select tests.assert(
  (select count(*) from public.my_balances() b
    where b.counterparty_id = '22222222-2222-4222-8222-222222222222') = 0,
  'a confirmed expense leaves no open balance');

set role authenticated;
select tests.as_user('11111111-1111-4111-8111-111111111111');
insert into public.expenses (id, payer_id, debtor_id, amount, description, category, created_by)
values ('aaaaaaaa-0000-4000-8000-000000000010',
        '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
        120.50, 'Project printouts', 'Project', '11111111-1111-4111-8111-111111111111');

select tests.assert(
  (select balance = 120.50 from public.balance_with('22222222-2222-4222-8222-222222222222')),
  'Manesh is owed ₹120.50 by Rahul');
select tests.as_user('22222222-2222-4222-8222-222222222222');
select tests.assert(
  (select balance = -120.50 from public.balance_with('11111111-1111-4111-8111-111111111111')),
  'and Rahul sees the same number as "you owe"');
select tests.assert(
  (select you_owe = 120.50 and you_are_owed = 0 from public.my_totals()),
  'totals add up on Rahul''s side');

-- Rahul hands over cash and claims it in-app; Manesh confirms.
insert into public.settlements (id, payer_id, receiver_id, amount, created_by, client_request_id)
values ('bbbbbbbb-0000-4000-8000-000000000001',
        '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        120.50, '22222222-2222-4222-8222-222222222222', 'dddddddd-0000-4000-8000-000000000003');
select tests.assert(
  (select status = 'PENDING' from public.settlements where id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  'a payment claim starts PENDING');
select tests.as_user('11111111-1111-4111-8111-111111111111');
select tests.assert(
  (select count(*) from public.notifications
    where user_id = '11111111-1111-4111-8111-111111111111' and type = 'settlement_created') = 1,
  'the receiver is asked whether the money arrived');
select tests.assert(
  (select balance = 120.50 from public.balance_with('22222222-2222-4222-8222-222222222222')),
  'an unconfirmed claim does not move the balance yet (Manesh is still owed ₹120.50)');

select tests.as_user('22222222-2222-4222-8222-222222222222');
select tests.expect_error($q$
  update public.settlements set status = 'CONFIRMED'
   where id = 'bbbbbbbb-0000-4000-8000-000000000001'
$q$, 'the payer cannot confirm their own payment');

select tests.as_user('11111111-1111-4111-8111-111111111111');
update public.settlements set status = 'CONFIRMED' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
select tests.assert(
  (select count(*) from public.my_balances() b
    where b.counterparty_id = '22222222-2222-4222-8222-222222222222') = 0,
  'confirming the settlement clears the balance exactly');

-- Two friends, several expenses both ways, netting to a single figure.
select tests.as_user('11111111-1111-4111-8111-111111111111');
insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by) values
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444',
   33.33, 'Tickets', 'Ticket', '11111111-1111-4111-8111-111111111111'),
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444',
   16.67, 'Stationery', 'Stationery', '11111111-1111-4111-8111-111111111111');
select tests.as_user('44444444-4444-4444-8444-444444444444');
insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by)
values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
        10.00, 'Auto fare', 'Travel', '44444444-4444-4444-8444-444444444444');
select tests.as_user('11111111-1111-4111-8111-111111111111');
select tests.assert(
  (select balance = 40.00 from public.balance_with('44444444-4444-4444-8444-444444444444')),
  '50.00 owed to Manesh minus 10.00 he owes nets to ₹40.00 (no floating point drift)');

-- Exact decimal arithmetic, not binary floats: 0.1 + 0.2 must be 0.30.
select tests.as_user('33333333-3333-4333-8333-333333333333');
select tests.expect_error($q$
  insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by)
  values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
          0.001, 'sub-paise', 'Other', '33333333-3333-4333-8333-333333333333')
$q$, 'amounts smaller than a paise are rejected (numeric(14,2) rounds and re-checks)');

reset role;

-- -----------------------------------------------------------------------------
select tests.section('groups, splits and the reconciliation rule');
-- -----------------------------------------------------------------------------
set role authenticated;
select tests.as_user('11111111-1111-4111-8111-111111111111');
insert into public.groups (id, name, description, created_by)
values ('cccccccc-0000-4000-8000-000000000001', 'CS Project', 'Final year project', '11111111-1111-4111-8111-111111111111');

select tests.assert(
  (select count(*) from public.group_members
    where group_id = 'cccccccc-0000-4000-8000-000000000001'
      and user_id = '11111111-1111-4111-8111-111111111111' and role = 'owner') = 1,
  'the creator is automatically the owner');

select tests.expect_ok($q$
  insert into public.group_members (group_id, user_id) values
    ('cccccccc-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222'),
    ('cccccccc-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333')
$q$, 'friends can be added to the group');

select tests.expect_error($q$
  insert into public.group_members (group_id, user_id)
  values ('cccccccc-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555')
$q$, 'a stranger cannot be pulled into a group (friends only in V1)');

reset role;

-- split_equally: sums exactly, deterministic, deterministic remainder
select tests.section('split_equally()');
select tests.assert(
  (select sum(share_amount) = 100.00 from public.split_equally(100.00,
     array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
           '33333333-3333-4333-8333-333333333333']::uuid[])),
  '₹100 split three ways still adds up to ₹100.00');
select tests.assert(
  (select count(*) = 3 from public.split_equally(100.00,
     array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
           '33333333-3333-4333-8333-333333333333']::uuid[])),
  'every participant gets a share line');
select tests.assert(
  (select share_amount = 33.34 from public.split_equally(100.00,
     array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
           '33333333-3333-4333-8333-333333333333']::uuid[])
     where user_id = '11111111-1111-4111-8111-111111111111'),
  'the odd paisa goes to the lowest user id, deterministically');
select tests.assert(
  (select sum(share_amount) = 0.05 from public.split_equally(0.05,
     array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
           '33333333-3333-4333-8333-333333333333']::uuid[])),
  'even ₹0.05 splits without inventing or losing a paisa');
select tests.assert(
  (select sum(share_amount) = 99.99 from public.split_equally(99.99,
     array['11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444']::uuid[])),
  'two-way splits are exact too');
select tests.assert(
  (select bool_and(share_amount >= 0) from public.split_equally(0.02,
     array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
           '33333333-3333-4333-8333-333333333333']::uuid[])),
  'no negative shares when the total is tiny');

set role authenticated;
select tests.as_user('11111111-1111-4111-8111-111111111111');

select tests.expect_error($q$
  select public.create_group_expense(
    'cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
    0, 'zero cost', 'Other',
    array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[])
$q$, 'a group expense of ₹0 is rejected');

select tests.expect_error($q$
  select public.create_group_expense(
    'cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
    100, 'stranger share', 'Other',
    array['11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555']::uuid[])
$q$, 'a non-member cannot be given a share in a group expense');

select tests.expect_error($q$
  select public.create_group_expense(
    'cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
    100, 'double share', 'Other',
    array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
          '22222222-2222-4222-8222-222222222222']::uuid[])
$q$, 'the same person cannot appear twice in one split');

select tests.expect_ok($q$
  select public.create_group_expense(
    'cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
    300.00, 'Printout bundle', 'Printout',
    array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333']::uuid[])
$q$, 'Manesh can add a ₹300 group expense split three ways');

select tests.assert(
  (select sum(s.share_amount) = 300.00 from public.group_expense_shares s
     join public.group_expenses ge on ge.id = s.group_expense_id
    where ge.group_id = 'cccccccc-0000-4000-8000-000000000001'),
  'shares reconcile exactly to the ₹300 total');

-- Idempotency of the RPC
select tests.as_user('11111111-1111-4111-8111-111111111111');
select tests.expect_ok($q$
  select public.create_group_expense(
    'cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
    50.00, 'Snacks', 'Food',
    array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[],
    'dddddddd-0000-4000-8000-000000000002')
$q$, 'a group expense can be submitted with an idempotency key');
select tests.assert(
  (select count(*) from public.group_expenses
    where group_id = 'cccccccc-0000-4000-8000-000000000001' and description = 'Snacks') = 1,
  'exactly one group expense was written for that submission');
select tests.assert(
  (select public.create_group_expense(
     'cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
     50.00, 'Snacks', 'Food',
     array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[],
     'dddddddd-0000-4000-8000-000000000002')
   = (select id from public.group_expenses
       where group_id = 'cccccccc-0000-4000-8000-000000000001' and description = 'Snacks')),
  'a double-submitted group expense returns the first one instead of duplicating it');
select tests.assert(
  (select count(*) from public.group_expenses
    where group_id = 'cccccccc-0000-4000-8000-000000000001' and description = 'Snacks') = 1,
  'still exactly one row after the retry');

-- Direct share tampering is caught by the deferred reconciliation trigger.
select tests.expect_error_at_commit($q$
  insert into public.group_expense_shares (group_expense_id, user_id, share_amount)
  select id, '33333333-3333-4333-8333-333333333333', 10.00
    from public.group_expenses
   where description = 'Snacks' and group_id = 'cccccccc-0000-4000-8000-000000000001'
$q$, 'a share row that breaks the total is rejected');

-- Group balances
reset role;
select tests.assert(
  (select net = 225.00 from public.group_balances_for('cccccccc-0000-4000-8000-000000000001')
    where user_id = '11111111-1111-4111-8111-111111111111'),
  'Manesh is owed ₹225 (he paid 300 + 50, his own share of that is 100 + 25)');
select tests.assert(
  (select sum(net) = 0 from public.group_balances_for('cccccccc-0000-4000-8000-000000000001')),
  'group balances always sum to exactly zero');
select tests.assert(
  (select net = -125.00 from public.group_balances_for('cccccccc-0000-4000-8000-000000000001')
    where user_id = '22222222-2222-4222-8222-222222222222'),
  'Rahul owes ₹125 in the group (100 + 25 from the two-way split)');
select tests.assert(
  (select net = -100.00 from public.group_balances_for('cccccccc-0000-4000-8000-000000000001')
    where user_id = '33333333-3333-4333-8333-333333333333'),
  'Priya owes ₹100 in the group');
select tests.assert(
  (select my_net = 225.00 and member_count = 3 and role = 'owner' from public.my_group_summaries()),
  'the group summary reports the member count, my net and my role');

-- Leaving a group with an open balance
set role authenticated;
select tests.as_user('22222222-2222-4222-8222-222222222222');
select tests.expect_error($q$
  delete from public.group_members
   where group_id = 'cccccccc-0000-4000-8000-000000000001'
     and user_id = '22222222-2222-4222-8222-222222222222'
$q$, 'Rahul cannot quietly leave the group while he owes ₹125');

-- Settle inside the group, then he can leave.
select tests.as_user('22222222-2222-4222-8222-222222222222');
insert into public.settlements (id, group_id, payer_id, receiver_id, amount, created_by)
values ('bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001',
        '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        125.00, '22222222-2222-4222-8222-222222222222');

reset role;
select tests.assert(
  (select net = -125.00 from public.group_balances_for('cccccccc-0000-4000-8000-000000000001')
    where user_id = '22222222-2222-4222-8222-222222222222'),
  'an unconfirmed group payment claim does not change the balance');

set role authenticated;
select tests.as_user('11111111-1111-4111-8111-111111111111');
update public.settlements set status = 'CONFIRMED' where id = 'bbbbbbbb-0000-4000-8000-000000000002';

reset role;
select tests.assert(
  (select net = 0 from public.group_balances_for('cccccccc-0000-4000-8000-000000000001')
    where user_id = '22222222-2222-4222-8222-222222222222'),
  'confirming the group payment settles Rahul to exactly zero');
select tests.assert(
  (select sum(net) = 0 from public.group_balances_for('cccccccc-0000-4000-8000-000000000001')),
  'the group still sums to zero after a settlement');

set role authenticated;
select tests.as_user('22222222-2222-4222-8222-222222222222');
select tests.expect_ok($q$
  delete from public.group_members
   where group_id = 'cccccccc-0000-4000-8000-000000000001'
     and user_id = '22222222-2222-4222-8222-222222222222'
$q$, 'with a zero balance Rahul can leave the group');

select tests.as_user('11111111-1111-4111-8111-111111111111');
select tests.expect_error($q$
  delete from public.group_members
   where group_id = 'cccccccc-0000-4000-8000-000000000001'
     and user_id = '11111111-1111-4111-8111-111111111111'
$q$, 'the owner cannot leave without handing the group over');

-- Ownership hand-over keeps a group ownerful.
select tests.expect_ok($q$
  update public.group_members set role = 'owner'
   where group_id = 'cccccccc-0000-4000-8000-000000000001'
     and user_id = '33333333-3333-4333-8333-333333333333'
$q$, 'the owner can promote someone else');
select tests.expect_ok($q$
  update public.group_members set role = 'member'
   where group_id = 'cccccccc-0000-4000-8000-000000000001'
     and user_id = '11111111-1111-4111-8111-111111111111'
$q$, 'and step down afterwards');
-- a plain member cannot promote themselves back up
select tests.expect_blocked($q$
  update public.group_members set role = 'owner'
   where group_id = 'cccccccc-0000-4000-8000-000000000001'
     and user_id = '11111111-1111-4111-8111-111111111111'
$q$, 'only the owner can change roles');

select tests.as_user('33333333-3333-4333-8333-333333333333');
select tests.expect_error_at_commit($q$
  update public.group_members set role = 'member'
   where group_id = 'cccccccc-0000-4000-8000-000000000001'
     and user_id = '33333333-3333-4333-8333-333333333333'
$q$, 'a group can never end up ownerless (the last owner cannot demote themselves)');

reset role;

-- -----------------------------------------------------------------------------
select tests.section('notifications: server-created, deduped, own-only');
-- -----------------------------------------------------------------------------
reset role;
select tests.assert(
  (select count(*) from public.notifications
    where user_id = '33333333-3333-4333-8333-333333333333' and type = 'group_expense_added') = 2,
  'each group expense notified the other members exactly once');

reset role;
select tests.assert(
  (select public.create_notification(
     '22222222-2222-4222-8222-222222222222', 'expense_created',
     'dup test', 'dup test', '/x', 'dedupe-key-1')) is not null,
  'create_notification returns an id the first time');
select tests.assert(
  (select public.create_notification(
     '22222222-2222-4222-8222-222222222222', 'expense_created',
     'dup test', 'dup test', '/x', 'dedupe-key-1')) is null,
  'duplicate trigger/realtime delivery is dropped by the dedupe key');

set role authenticated;
select tests.as_user('22222222-2222-4222-8222-222222222222');
select tests.assert(
  (select count(*) from public.notifications) > 0, 'Rahul can read his own notifications');
select tests.assert(
  (select count(*) from public.notifications
    where user_id = '11111111-1111-4111-8111-111111111111') = 0,
  'and Rahul cannot see Manesh''s notifications');
select tests.assert(
  (select count(*) from public.notifications
    where user_id <> '22222222-2222-4222-8222-222222222222') = 0,
  'and cannot see anybody else''s');

select tests.expect_error($q$
  insert into public.notifications (user_id, type, title, deep_link)
  values ('22222222-2222-4222-8222-222222222222', 'expense_created', 'fake', '/x')
$q$, 'a user cannot fabricate a notification, even for themselves');

select tests.expect_error($q$
  insert into public.notifications (user_id, type, title, deep_link)
  values ('33333333-3333-4333-8333-333333333333', 'expense_created', 'phish', '/x')
$q$, 'a user cannot push a notification to somebody else');

select tests.assert(
  (select public.unread_notification_count() > 0), 'the unread badge counts real rows');
select tests.expect_ok($q$ select public.mark_all_notifications_read() $q$,
  'mark-all-read runs');
select tests.assert(
  (select public.unread_notification_count() = 0), 'and clears the badge');

select tests.expect_ok($q$ update public.notifications set body = 'tampered' $q$,
  'a client ''rewriting'' a notification body is accepted as a no-op');
reset role;
select tests.assert(
  (select count(*) from public.notifications where body = 'tampered') = 0,
  'but the delivered notification text is untouched — the trigger pins it');
set role authenticated;
select tests.as_user('22222222-2222-4222-8222-222222222222');

-- -----------------------------------------------------------------------------
select tests.section('global switches (read-only mode, expense creation off)');
-- -----------------------------------------------------------------------------
reset role;
update public.app_settings set value = 'true'::jsonb where key = 'read_only_mode';

set role authenticated;
select tests.as_user('11111111-1111-4111-8111-111111111111');
select tests.expect_error($q$
  insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by)
  values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
          5, 'during maintenance', 'Food', '11111111-1111-4111-8111-111111111111')
$q$, 'read-only mode freezes new expenses');

reset role;
update public.app_settings set value = 'false'::jsonb where key = 'read_only_mode';
update public.app_settings set value = 'false'::jsonb where key = 'expense_creation_enabled';
set role authenticated;
select tests.expect_error($q$
  insert into public.expenses (payer_id, debtor_id, amount, description, category, created_by)
  values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
          5, 'feature off', 'Food', '11111111-1111-4111-8111-111111111111')
$q$, 'the expense-creation flag is enforced in the database, not just the UI');
reset role;
update public.app_settings set value = 'true'::jsonb where key = 'expense_creation_enabled';

-- -----------------------------------------------------------------------------
select tests.section('retention, archival and export-before-purge');
-- -----------------------------------------------------------------------------
-- An isolated pair (Anita & Karan): one fully settled expense, and one that is
-- still open. Only the settled one may ever be archived.
reset role;
select set_config('request.jwt.claim.sub', '', false);   -- back to a privileged context

insert into public.friendships (requester_id, addressee_id)
values ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777');
update public.friendships set status = 'accepted'
 where requester_id = '66666666-6666-4666-8666-666666666666';

insert into public.expenses (id, payer_id, debtor_id, amount, description, category, created_by)
values ('aaaaaaaa-0000-4000-8000-0000000000a1',
        '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        500.00, 'Semester fee split', 'Project', '66666666-6666-4666-8666-666666666666'),
       ('aaaaaaaa-0000-4000-8000-0000000000a2',
        '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        200.00, 'Still pending', 'Food', '66666666-6666-4666-8666-666666666666');

update public.expenses set status = 'PAYMENT_MARKED' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1';
update public.expenses set status = 'CONFIRMED'      where id = 'aaaaaaaa-0000-4000-8000-0000000000a1';

set role authenticated;
select tests.as_user('66666666-6666-4666-8666-666666666666');
insert into public.user_exports (user_id, format, row_count)
values ('66666666-6666-4666-8666-666666666666', 'csv', 12);
reset role;

-- Age the settled record past the retention window; the open one too, so the
-- only thing protecting it is the "never archive live money" rule.
-- (updated_at is server-owned, so the test has to step outside the trigger to
--  simulate the passage of a year — the same trick the migration's own
--  retention job relies on with real time.)
alter table public.expenses disable trigger expenses_bu;
update public.expenses set updated_at = now() - interval '400 days'
 where id in ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a2');
alter table public.expenses enable trigger expenses_bu;
select tests.assert(
  (select updated_at < now() - interval '300 days' from public.expenses
    where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  'the settled record is now a year old');

select tests.assert(
  (select not public.pair_is_quiet('66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777')
     from public.expenses where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'),
  'a pair with an open expense is not "quiet"');
select tests.assert(
  (select public.pair_is_quiet('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333')),
  'a pair with nothing outstanding is quiet');

select public.archive_settled_records();

select tests.assert(
  (select count(*) from public.archived_records where kind = 'expense'
     and original_id = 'aaaaaaaa-0000-4000-8000-0000000000a1') = 1,
  'the old settled expense was archived with a full snapshot');
select tests.assert(
  (select snapshot ? 'expense' and jsonb_array_length(snapshot->'events') > 0
     from public.archived_records where original_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  'the snapshot keeps the expense and its whole timeline');
select tests.assert(
  (select count(*) from public.expenses where id = 'aaaaaaaa-0000-4000-8000-0000000000a1') = 0,
  'and the live row is gone');
select tests.assert(
  (select count(*) from public.notifications
    where type = 'history_expiring' and user_id in
      ('66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777')) = 2,
  'both participants were told, with the exact date the archive copy can go');
select tests.assert(
  (select purge_after > now() from public.archived_records
     where original_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  'the archive copy has a future purge date, not an instant delete');
select tests.assert(
  (select count(*) from public.expenses where id = 'aaaaaaaa-0000-4000-8000-0000000000a2') = 1,
  'the still-open expense was left alone even though it is older than the retention window');
select tests.assert(
  (select count(*) from public.archived_records where kind = 'expense'
     and original_id = 'aaaaaaaa-0000-4000-8000-0000000000a2') = 0,
  'and it was not archived either — live money is never archived');

-- A confirmed settlement DOES move balances, so it is held back while the pair
-- still has an open expense to offset it against.
insert into public.settlements (id, payer_id, receiver_id, amount, status, created_by)
values ('bbbbbbbb-0000-4000-8000-0000000000a5',
        '77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666',
        50.00, 'CONFIRMED', '66666666-6666-4666-8666-666666666666');
alter table public.settlements disable trigger settlements_bu;
update public.settlements set updated_at = now() - interval '400 days'
 where id = 'bbbbbbbb-0000-4000-8000-0000000000a5';
alter table public.settlements enable trigger settlements_bu;
select public.archive_settled_records();
select tests.assert(
  (select count(*) from public.archived_records where kind = 'settlement'
     and original_id = 'bbbbbbbb-0000-4000-8000-0000000000a5') = 0,
  'a settled payment between a pair that still has open money is not archived');
select tests.assert(
  (select count(*) from public.settlements where id = 'bbbbbbbb-0000-4000-8000-0000000000a5') = 1,
  'it stays live so the balance keeps adding up');
select tests.assert(
  (select count(*) from public.expenses where id = 'aaaaaaaa-0000-4000-8000-000000000002') = 1,
  'the cancelled ₹75 chai expense is untouched (it is still recent)');

-- The purge contract, condition by condition. It is stricter than "an export
-- releases it": purge_after must have passed, the notice window must have
-- passed, and then EITHER everyone has exported since the notice OR twice the
-- notice window has gone by. (With default settings purge_after is the binding
-- date; the export path only bites when archive_purge_days < archive_notice_days.)

-- (a) purge_after passed, notice window passed, everyone exported since notice
--     -> purged. The 100-day-old notice is deliberately past twice the window
--     too, so the assertion below is about the date, not about the export.
update public.archived_records
   set expiration_notice_at = now() - interval '100 days',
       purge_after = now() - interval '10 days'
 where original_id = 'aaaaaaaa-0000-4000-8000-0000000000a1';

select public.archive_settled_records();

select tests.assert(
  (select count(*) from public.archived_records
     where original_id = 'aaaaaaaa-0000-4000-8000-0000000000a1') = 0,
  'past purge_after and past the notice window, the archive copy is purged');

-- (b) not everybody exported, and the notice window has passed but not doubled
--     -> still held, so nobody loses a record while they might still want it.
insert into public.archived_records (kind, original_id, participant_ids, snapshot, purge_after, expiration_notice_at)
values ('settlement', 'bbbbbbbb-0000-4000-8000-0000000000ff',
        array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[],
        '{}'::jsonb, now() - interval '1 day', now() - interval '40 days');
select public.archive_settled_records();
select tests.assert(
  (select count(*) from public.archived_records
     where original_id = 'bbbbbbbb-0000-4000-8000-0000000000ff') = 1,
  'between one and two notice windows, a record nobody downloaded is held');
select tests.assert(
  (select count(*) from public.archived_records
     where original_id = 'bbbbbbbb-0000-4000-8000-0000000000ff') = 1
  and not exists (
    select 1 from public.user_exports
     where user_id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')
       and created_at >= (select expiration_notice_at from public.archived_records
                           where original_id = 'bbbbbbbb-0000-4000-8000-0000000000ff')),
  'and that grace is exactly because neither of them has downloaded since the notice');

-- (c) nobody exported and twice the notice window has gone -> purged anyway.
--     One user who never downloads must not pin a row to the database forever.
update public.archived_records
   set expiration_notice_at = now() - interval '70 days'
 where original_id = 'bbbbbbbb-0000-4000-8000-0000000000ff';
select public.archive_settled_records();
select tests.assert(
  (select count(*) from public.archived_records
     where original_id = 'bbbbbbbb-0000-4000-8000-0000000000ff') = 0,
  'twice the notice window with no download, and the record goes anyway');

-- (d) an export does not skip the notice window. purge_after has passed and
--     BOTH participants downloaded after the notice — the record is still held,
--     because the notice window the admin configured is a floor, not a target.
insert into public.archived_records (kind, original_id, participant_ids, snapshot, purge_after, expiration_notice_at)
values ('expense', 'aaaaaaaa-0000-4000-8000-0000000000ff',
        array['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[],
        '{}'::jsonb, now() - interval '5 days', now() - interval '2 days');

set role authenticated;
select tests.as_user('11111111-1111-4111-8111-111111111111');
insert into public.user_exports (user_id, format, row_count)
values ('11111111-1111-4111-8111-111111111111', 'csv', 3);
select tests.as_user('22222222-2222-4222-8222-222222222222');
insert into public.user_exports (user_id, format, row_count)
values ('22222222-2222-4222-8222-222222222222', 'csv', 3);
reset role;

select tests.assert(
  (select count(*) from user_exports where created_at > now() - interval '1 minute') >= 2,
  'both participants have downloaded since the notice was sent');

select public.archive_settled_records();
select tests.assert(
  (select count(*) from public.archived_records
     where original_id = 'aaaaaaaa-0000-4000-8000-0000000000ff') = 1,
  'even with both downloads in, an export never shortens the notice window');

-- A group expense and a settle-up record must warn people too. Before this was
-- fixed, only 1:1 expenses sent anything — a group's chips-and-cabs history
-- could be archived and purged with nobody ever told, which is precisely the
-- "nothing is silently dropped" rule this app is built around.
reset role;

-- Two friends the rest of the suite leaves alone: Sneha and Vikram. The request
-- has to be sent by Sneha herself — the trigger insists on it.
set role authenticated;
select tests.as_user('44444444-4444-4444-8444-444444444444');
insert into public.friendships (requester_id, addressee_id)
values ('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555');
select tests.as_user('55555555-5555-4555-8555-555555555555');   -- Vikram accepts it
update public.friendships set status = 'accepted', responded_at = now()
 where requester_id = '44444444-4444-4444-8444-444444444444'
   and addressee_id = '55555555-5555-4555-8555-555555555555';

set role authenticated;
select tests.as_user('44444444-4444-4444-8444-444444444444');

insert into public.groups (id, name, created_by)
values ('cccccccc-0000-4000-8000-0000000000f1', 'Silent-drop check', '44444444-4444-4444-8444-444444444444');
insert into public.group_members (group_id, user_id, role)
values ('cccccccc-0000-4000-8000-0000000000f1', '55555555-5555-4555-8555-555555555555', 'member')
on conflict (group_id, user_id) do nothing;

select public.create_group_expense(
  'cccccccc-0000-4000-8000-0000000000f1', '44444444-4444-4444-8444-444444444444',
  90.00, 'Props for the fest', 'Other',
  array['44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555']::uuid[]);

update public.group_expenses
   set status = 'CANCELLED', cancelled_at = now()
 where group_id = 'cccccccc-0000-4000-8000-0000000000f1';
reset role;

alter table public.group_expenses disable trigger group_expenses_bu;
update public.group_expenses set updated_at = now() - interval '400 days'
 where group_id = 'cccccccc-0000-4000-8000-0000000000f1';
alter table public.group_expenses enable trigger group_expenses_bu;

-- A settled payment between the same (quiet) pair: Vikram says he paid, Sneha
-- confirms it landed. Only the receiver can confirm, same as in the app.
set role authenticated;
select tests.as_user('55555555-5555-4555-8555-555555555555');
insert into public.settlements (id, payer_id, receiver_id, amount, created_by)
values ('bbbbbbbb-0000-4000-8000-0000000000f2',
        '55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444',
        75.00, '55555555-5555-4555-8555-555555555555');
select tests.as_user('44444444-4444-4444-8444-444444444444');
update public.settlements set status = 'CONFIRMED', confirmed_at = now()
 where id = 'bbbbbbbb-0000-4000-8000-0000000000f2';
reset role;

alter table public.settlements disable trigger settlements_bu;
update public.settlements set updated_at = now() - interval '400 days'
 where id = 'bbbbbbbb-0000-4000-8000-0000000000f2';
alter table public.settlements enable trigger settlements_bu;

select public.archive_settled_records();

select tests.assert(
  (select count(*) from public.archived_records
    where kind = 'group_expense'
      and snapshot -> 'group_expense' ->> 'group_id' = 'cccccccc-0000-4000-8000-0000000000f1') = 1,
  'a cancelled group expense past the window is archived');
select tests.assert(
  (select count(*) from public.notifications
    where type = 'history_expiring'
      and related_group_id = 'cccccccc-0000-4000-8000-0000000000f1') = 2,
  'and every member of the group is warned, not just whoever paid');
select tests.assert(
  (select count(*) from public.archived_records
    where kind = 'settlement' and original_id = 'bbbbbbbb-0000-4000-8000-0000000000f2') = 1,
  'a settled payment between a quiet pair is archived');
select tests.assert(
  (select count(*) from public.notifications
    where type = 'history_expiring'
      and dedupe_key like '/archive/settlement/bbbbbbbb-0000-4000-8000-0000000000f2/%') = 2,
  'and both sides of the payment are warned');
select tests.assert(
  (select coalesce(bool_and(related_settlement_id is null and related_user_id is not null), false)
     from public.notifications
    where type = 'history_expiring'
      and dedupe_key like '/archive/settlement/bbbbbbbb-0000-4000-8000-0000000000f2/%'),
  'the settlement notice names the counterparty without a dangling foreign key');

-- The notice text itself has to describe that contract honestly. It says
-- "on or after <date>, whether or not you download" — never "export or lose it".
select tests.assert(
  (select body like '%on or after%whether or not you download%'
     from public.notifications
    where type = 'history_expiring'
      and user_id = '66666666-6666-4666-8666-666666666666'
    order by created_at limit 1),
  'the archival notice promises "on or after <date>, whether or not you download"');

-- Admin read path
set role authenticated;
select tests.as_user('11111111-1111-4111-8111-111111111111');
select tests.expect_error($q$ select public.admin_stats() $q$,
  'a normal user cannot read admin stats');
reset role;
insert into public.admin_users (user_id) values ('11111111-1111-4111-8111-111111111111') on conflict do nothing;
set role authenticated;
select tests.as_user('11111111-1111-4111-8111-111111111111');
select tests.assert((select public.is_admin()), 'the admin claim is recognised');
select tests.assert(
  (select (public.admin_stats() -> 'users' ->> 'total')::int = 7),
  'admin stats report the user count');
select tests.assert(
  (select (public.admin_stats() -> 'health' ->> 'errors_24h')::int = 0),
  'admin stats report the error count from structured logs');
select tests.assert(
  (select (public.admin_stats() -> 'retention' ->> 'archived_records')::int >= 1),
  'admin stats report the retention backlog');
select tests.expect_blocked($q$
  update public.app_settings set value = 'true'::jsonb where key = 'read_only_mode'
$q$, 'even an admin session cannot write a global setting directly from the client');
reset role;
select tests.assert(
  (select count(*) from public.admin_audit_log) = 0,
  'no admin mutation was recorded, because none was allowed');
delete from public.admin_users where user_id = '11111111-1111-4111-8111-111111111111';
select set_config('request.jwt.claim.sub', '', false);

-- -----------------------------------------------------------------------------
select tests.section('realtime publication');
-- -----------------------------------------------------------------------------
select tests.assert(
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('expenses','expense_events','friendships','notifications',
                        'groups','group_members','group_expenses','group_expense_shares',
                        'settlements','app_settings')) = 10,
  'every table the clients subscribe to is in the realtime publication');

\echo ''
\echo '✅  domain tests passed'
