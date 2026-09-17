-- =============================================================================
-- OweMe — 0004 notifications
--
-- Notifications are real rows written by DATABASE TRIGGERS, i.e. in the same
-- transaction as the action that caused them. If the action commits, the
-- notification exists — even if the recipient's phone was offline or their tab
-- was closed. Realtime then pushes them to whoever is connected.
--
-- Dedupe keys make duplicate delivery (retries, double-fired triggers,
-- realtime reconnects) idempotent.
-- =============================================================================

create or replace function public.display_name(p_user uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.username::text, 'Someone')
  from public.profiles p where p.id = p_user;
$$;

create or replace function public.create_notification(
  p_user_id     uuid,
  p_type        public.notification_type,
  p_title       text,
  p_body        text,
  p_deep_link   text,
  p_dedupe_key  text,
  p_expense_id  uuid default null,
  p_group_id    uuid default null,
  p_related_user uuid default null,
  p_settlement_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (
    user_id, type, title, body, deep_link, dedupe_key,
    related_expense_id, related_group_id, related_user_id, related_settlement_id
  ) values (
    p_user_id, p_type, left(p_title, 140), left(p_body, 400), p_deep_link, p_dedupe_key,
    p_expense_id, p_group_id, p_related_user, p_settlement_id
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;

  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Expense timeline -> notifications
-- -----------------------------------------------------------------------------
create or replace function public.notify_from_expense_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e          public.expenses;
  v_actor    text;
  v_amount   text;
  v_link     text;
begin
  select * into e from public.expenses where id = new.expense_id;
  if e.id is null then return new; end if;

  v_actor  := public.display_name(coalesce(new.actor_id, e.created_by));
  v_amount := '₹' || to_char(e.amount, 'FM999999999990.00');
  v_link   := '/expenses/' || e.id::text;

  if new.event_type = 'created' then
    if e.debtor_id <> e.created_by then
      perform public.create_notification(
        e.debtor_id, 'expense_created',
        v_actor || ' added an expense',
        'You owe ' || v_amount || ' for ' || e.description || '.',
        v_link, '/expense/' || e.id::text || '/created', e.id, null, e.payer_id);
    else
      perform public.create_notification(
        e.payer_id, 'expense_created',
        v_actor || ' logged an expense you paid',
        v_actor || ' owes you ' || v_amount || ' for ' || e.description || '.',
        v_link, '/expense/' || e.id::text || '/created', e.id, null, e.debtor_id);
    end if;

  elsif new.event_type = 'payment_marked' then
    perform public.create_notification(
      e.payer_id, 'payment_marked',
      'Did you receive this payment?',
      v_actor || ' says they paid you ' || v_amount || ' for ' || e.description || '. Confirm or dispute it.',
      v_link, '/expense/' || e.id::text || '/mark:' || new.id::text, e.id, null, e.debtor_id);

  elsif new.event_type = 'confirmed' then
    perform public.create_notification(
      e.debtor_id, 'payment_confirmed',
      'Payment confirmed',
      v_actor || ' confirmed receiving ' || v_amount || '. You''re settled up.',
      v_link, '/expense/' || e.id::text || '/confirmed:' || new.id::text, e.id, null, e.payer_id);

  elsif new.event_type = 'disputed' then
    perform public.create_notification(
      e.debtor_id, 'payment_disputed',
      v_actor || ' declined your payment',
      v_actor || ' declined your payment of ' || v_amount || ' for ' || e.description || '. Talk to ' || v_actor || ' or complete the payment.',
      v_link, '/expense/' || e.id::text || '/disputed:' || new.id::text, e.id, null, e.payer_id);

  elsif new.event_type = 'cancelled' then
    perform public.create_notification(
      case when coalesce(new.actor_id, e.created_by) = e.payer_id then e.debtor_id else e.payer_id end,
      'expense_cancelled',
      'An expense was cancelled',
      v_actor || ' cancelled the ' || v_amount || ' expense for ' || e.description || '.',
      v_link, '/expense/' || e.id::text || '/cancelled:' || new.id::text, e.id, null, new.actor_id);
  end if;

  return new;
end $$;

drop trigger if exists expense_events_notify on public.expense_events;
create trigger expense_events_notify after insert on public.expense_events
  for each row execute function public.notify_from_expense_event();

-- -----------------------------------------------------------------------------
-- Friendships -> notifications
-- -----------------------------------------------------------------------------
create or replace function public.notify_from_friendship()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_requester text := public.display_name(new.requester_id);
begin
  if tg_op = 'INSERT' then
    perform public.create_notification(
      new.addressee_id, 'friend_request',
      v_requester || ' sent you a friend request',
      'Accept or decline this request. You can track expenses together once accepted.',
      '/friends', '/friend/' || new.id::text || '/request', null, null, new.requester_id);

  elsif new.status is distinct from old.status and new.status = 'accepted' then
    perform public.create_notification(
      new.requester_id, 'friend_accepted',
      'Your friend request was accepted',
      public.display_name(new.addressee_id) || ' accepted your request. You are now friends.',
      '/friends', '/friend/' || new.id::text || '/accepted', null, null, new.addressee_id);

  elsif new.status is distinct from old.status and new.status = 'declined' then
    perform public.create_notification(
      new.requester_id, 'friend_declined',
      'Your friend request was declined',
      public.display_name(new.addressee_id) || ' declined your request.',
      '/friends', '/friend/' || new.id::text || '/declined', null, null, new.addressee_id);
  end if;

  return new;
end $$;

drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify after insert or update on public.friendships
  for each row execute function public.notify_from_friendship();

-- -----------------------------------------------------------------------------
-- Group membership -> notifications
-- -----------------------------------------------------------------------------
create or replace function public.notify_group_member_added()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_group  public.groups;
  v_actor  text;
begin
  select * into v_group from public.groups where id = new.group_id;
  if v_group.id is null then return new; end if;
  if new.user_id = v_group.created_by then return new; end if;  -- owner, no self-notify

  v_actor := public.display_name(auth.uid());

  perform public.create_notification(
    new.user_id, 'group_added',
    v_actor || ' added you to ' || v_group.name,
    'You''ll see shared expenses for this group here.',
    '/groups/' || new.group_id::text, '/group-member/' || new.group_id::text || ':' || new.user_id::text,
    null, new.group_id, auth.uid());

  return new;
end $$;

drop trigger if exists group_members_notify on public.group_members;
create trigger group_members_notify after insert on public.group_members
  for each row execute function public.notify_group_member_added();

-- -----------------------------------------------------------------------------
-- Group expense -> notify every other member
-- -----------------------------------------------------------------------------
create or replace function public.notify_group_expense_added()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_group  public.groups;
  v_actor  text;
  v_amount text;
  m        record;
begin
  select * into v_group from public.groups where id = new.group_id;
  if v_group.id is null then return new; end if;

  v_actor  := public.display_name(new.created_by);
  v_amount := '₹' || to_char(new.amount, 'FM999999999990.00');

  for m in select user_id from public.group_members
            where group_id = new.group_id and user_id <> new.created_by loop
    perform public.create_notification(
      m.user_id, 'group_expense_added',
      v_actor || ' added an expense in ' || v_group.name,
      v_amount || ' for ' || new.description || ' — paid by ' || public.display_name(new.paid_by) || '.',
      '/groups/' || new.group_id::text, '/group-expense/' || new.id::text || ':' || m.user_id::text,
      null, new.group_id, new.created_by);
  end loop;

  return new;
end $$;

drop trigger if exists group_expenses_notify on public.group_expenses;
create trigger group_expenses_notify after insert on public.group_expenses
  for each row execute function public.notify_group_expense_added();

-- -----------------------------------------------------------------------------
-- Settlements -> notifications
-- -----------------------------------------------------------------------------
create or replace function public.notify_from_settlement()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_payer    text := public.display_name(new.payer_id);
  v_receiver text := public.display_name(new.receiver_id);
  v_amount   text := '₹' || to_char(new.amount, 'FM999999999990.00');
  v_link     text := '/settlements/' || new.id::text;
  v_group    text;
begin
  if new.group_id is not null then
    select g.name into v_group from public.groups g where g.id = new.group_id;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'CONFIRMED' then
      perform public.create_notification(
        new.payer_id, 'settlement_confirmed',
        v_receiver || ' confirmed your payment',
        'Your ' || v_amount || ' payment' || coalesce(' in ' || v_group, '') || ' is confirmed. Nothing owed there.',
        v_link, '/settlement/' || new.id::text || '/confirmed', null, new.group_id, new.receiver_id, new.id);
    else
      perform public.create_notification(
        new.receiver_id, 'settlement_created',
        'Did you receive ' || v_amount || '?',
        v_payer || ' says they paid you' || coalesce(' in ' || v_group, '') || '. Confirm it to close the balance.',
        v_link, '/settlement/' || new.id::text || '/created', null, new.group_id, new.payer_id, new.id);
    end if;

  elsif new.status is distinct from old.status then
    if new.status = 'CONFIRMED' then
      perform public.create_notification(
        new.payer_id, 'settlement_confirmed',
        v_receiver || ' confirmed your payment',
        'Your ' || v_amount || ' payment' || coalesce(' in ' || v_group, '') || ' is confirmed.',
        v_link, '/settlement/' || new.id::text || '/confirmed', null, new.group_id, new.receiver_id, new.id);

    elsif new.status = 'DISPUTED' then
      perform public.create_notification(
        new.payer_id, 'payment_disputed',
        v_receiver || ' declined your payment',
        v_receiver || ' declined your payment of ' || v_amount || '. Talk to ' || v_receiver || ' or complete the payment.',
        v_link, '/settlement/' || new.id::text || '/disputed', null, new.group_id, new.receiver_id, new.id);

    elsif new.status = 'CANCELLED' then
      perform public.create_notification(
        case when auth.uid() = new.payer_id then new.receiver_id else new.payer_id end,
        'expense_cancelled',
        'A payment claim was withdrawn',
        'The ' || v_amount || ' payment claim' || coalesce(' in ' || v_group, '') || ' is no longer active.',
        v_link, '/settlement/' || new.id::text || '/cancelled', null, new.group_id, auth.uid(), new.id);
    end if;
  end if;

  return new;
end $$;

drop trigger if exists settlements_notify on public.settlements;
create trigger settlements_notify after insert or update on public.settlements
  for each row execute function public.notify_from_settlement();

-- -----------------------------------------------------------------------------
-- Unread badge without a round trip per screen.
-- -----------------------------------------------------------------------------
create or replace function public.unread_notification_count()
returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from public.notifications n
  where n.user_id = auth.uid() and not n.is_read;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count int;
begin
  update public.notifications n
     set is_read = true
   where n.user_id = auth.uid() and not n.is_read;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function
  public.notify_from_expense_event(),
  public.notify_from_friendship(),
  public.notify_group_member_added(),
  public.notify_group_expense_added(),
  public.notify_from_settlement(),
  public.create_notification(uuid, public.notification_type, text, text, text, text, uuid, uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
