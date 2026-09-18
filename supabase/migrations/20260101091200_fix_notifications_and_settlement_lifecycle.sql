-- =============================================================================
-- OweMe — 0012 Settlement lifecycle, balance updates, and notification cleanup
-- 1. Automatically delete pending confirmation notifications on CONFIRMED, DISPUTED, CANCELLED.
-- 2. Prevent duplicate confirmation notifications for the same payment/settlement.
-- 3. If a receiver records a settlement ("They paid me"), allow immediate CONFIRMED status
--    without generating a confirmation notification for the receiver themselves.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Prevent duplicate active confirmation notifications
-- -----------------------------------------------------------------------------
create or replace function public.create_notification(
  p_user_id       uuid,
  p_type          public.notification_type,
  p_title         text,
  p_body          text,
  p_deep_link     text,
  p_dedupe_key    text,
  p_expense_id    uuid default null,
  p_group_id      uuid default null,
  p_related_user  uuid default null,
  p_settlement_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  -- If an active confirmation notification already exists for this settlement, avoid duplicate
  if p_settlement_id is not null and p_type = 'settlement_created' then
    select id into v_id from public.notifications
    where user_id = p_user_id
      and related_settlement_id = p_settlement_id
      and type = 'settlement_created'
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  -- If an active payment_marked confirmation notification already exists for this expense, avoid duplicate
  if p_expense_id is not null and p_type = 'payment_marked' then
    select id into v_id from public.notifications
    where user_id = p_user_id
      and related_expense_id = p_expense_id
      and type = 'payment_marked'
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
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
-- 2. Settlements -> notification lifecycle + cleanup
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
      -- Receiver recorded it directly -> notify payer it's confirmed
      perform public.create_notification(
        new.payer_id, 'settlement_confirmed',
        v_receiver || ' recorded a payment from you',
        'A payment of ' || v_amount || coalesce(' in ' || v_group, '') || ' was recorded as confirmed. Your balance is updated.',
        v_link, '/settlement/' || new.id::text || '/confirmed', null, new.group_id, new.receiver_id, new.id);
    else
      -- Payer recorded "I paid" -> ask receiver once
      perform public.create_notification(
        new.receiver_id, 'settlement_created',
        'Did you receive ' || v_amount || '?',
        v_payer || ' says they paid you' || coalesce(' in ' || v_group, '') || '. Confirm it to close the balance.',
        v_link, '/settlement/' || new.id::text || '/created', null, new.group_id, new.payer_id, new.id);
    end if;

  elsif new.status is distinct from old.status then
    -- Clean up any pending confirmation notifications on status change
    if new.status in ('CONFIRMED', 'DISPUTED', 'CANCELLED') then
      delete from public.notifications
      where related_settlement_id = new.id
        and type = 'settlement_created';
    end if;

    if new.status = 'CONFIRMED' then
      perform public.create_notification(
        new.payer_id, 'settlement_confirmed',
        v_receiver || ' confirmed your payment',
        'Your ' || v_amount || ' payment' || coalesce(' in ' || v_group, '') || ' is confirmed. Your balance is updated.',
        v_link, '/settlement/' || new.id::text || '/confirmed', null, new.group_id, new.receiver_id, new.id);

    elsif new.status = 'DISPUTED' then
      perform public.create_notification(
        new.payer_id, 'payment_disputed',
        v_receiver || ' declined your payment',
        v_receiver || ' says they did not receive your payment of ' || v_amount || '. The amount remains outstanding.',
        v_link, '/settlement/' || new.id::text || '/disputed', null, new.group_id, new.receiver_id, new.id);

    elsif new.status = 'CANCELLED' then
      perform public.create_notification(
        case when auth.uid() = new.payer_id then new.receiver_id else new.payer_id end,
        'expense_cancelled',
        'A payment claim was withdrawn',
        'The ' || v_amount || ' payment claim' || coalesce(' in ' || v_group, '') || ' was cancelled.',
        v_link, '/settlement/' || new.id::text || '/cancelled', null, new.group_id, auth.uid(), new.id);
    end if;
  end if;

  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Expense timeline -> notification cleanup
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

  -- Clean up any pending payment_marked notifications on state transition
  if new.event_type in ('confirmed', 'disputed', 'cancelled') then
    delete from public.notifications
    where related_expense_id = e.id
      and type = 'payment_marked';
  end if;

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
      v_actor || ' says they did not receive your payment of ' || v_amount || ' for ' || e.description || '. The amount remains outstanding.',
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

-- -----------------------------------------------------------------------------
-- 4. Reload PostgREST schema cache
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';
