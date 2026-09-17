-- =============================================================================
-- OweMe — 0006 payment declined notification wording
-- Updates payment declined / disputed notification message to instruct
-- the payer to talk to the receiver or complete payment.
-- =============================================================================

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
