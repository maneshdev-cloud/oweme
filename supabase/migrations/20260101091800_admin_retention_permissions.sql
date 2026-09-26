-- =============================================================================
-- OweMe — 0018 Admin retention execution permissions & security definer check
-- Grants authenticated administrators permission to invoke archive_settled_records()
-- and ensures service_role, pg_cron, and admin sessions can all execute it safely.
-- =============================================================================

create or replace function public.archive_settled_records()
returns table (archived_count int, notice_count int, purged_count int)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_retention   int := greatest(coalesce((select (value #>> '{}')::int from public.app_settings where key = 'retention_days'), 365), 1);
  v_purge_days  int := greatest(coalesce((select (value #>> '{}')::int from public.app_settings where key = 'archive_purge_days'), 90), 1);
  v_notice_days int := greatest(coalesce((select (value #>> '{}')::int from public.app_settings where key = 'archive_notice_days'), 30), 1);
  v_cutoff      timestamptz := now() - make_interval(days => v_retention);
  v_purge_after timestamptz := now() + make_interval(days => v_purge_days);
  r             record;
  v_participants uuid[];
  v_uid         uuid;
  v_notice_id   uuid;
  v_snapshot    jsonb;
  v_archived    int := 0;
  v_notices     int := 0;
  v_purged      int := 0;
begin
  -- Check permission: allow service_role, postgres/cron (auth.role() is null), or authenticated admin
  if auth.role() is not null and auth.role() <> 'service_role' and not public.is_admin(auth.uid()) then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  -- Archival is the one code path allowed to hard-delete financial rows.
  perform set_config('app.archival', 'on', true);

  -- 1:1 expenses -------------------------------------------------------------
  -- Safe by construction: only CONFIRMED and CANCELLED expenses are eligible,
  -- and neither is part of any live balance (see public.my_balances(), which
  -- counts only PENDING / PAYMENT_MARKED / DISPUTED). Archiving one therefore
  -- cannot move anybody's numbers, whatever else the pair still has open.
  for r in
    select e.*
      from public.expenses e
     where e.status in ('CONFIRMED', 'CANCELLED')
       and e.updated_at < v_cutoff
       and not exists (select 1 from public.archived_records a
                        where a.kind = 'expense' and a.original_id = e.id)
     order by e.updated_at
     limit 500
  loop
    v_participants := array[r.payer_id, r.debtor_id];
    v_snapshot := jsonb_build_object(
      'expense', to_jsonb(r),
      'events', coalesce((select jsonb_agg(to_jsonb(ev) order by ev.created_at)
                            from public.expense_events ev where ev.expense_id = r.id), '[]'::jsonb)
    );

    insert into public.archived_records
      (kind, original_id, participant_ids, snapshot, purge_after, expiration_notice_at)
    values ('expense', r.id, v_participants, v_snapshot, v_purge_after, now())
    on conflict (kind, original_id) do nothing;

    delete from public.expenses where id = r.id;  -- cascades its expense_events
    v_archived := v_archived + 1;

    -- Tell both people, with the exact date the archived copy can go.
    v_notice_id := public.create_notification(
      r.payer_id, 'history_expiring',
      'An old expense was archived',
      public.archival_notice_body(
        'Your ' || to_char(r.amount, 'FM₹999999999990.00') || ' "' || r.description || '" record',
        v_purge_after),
      '/history', '/archive/expense/' || r.id::text || '/' || r.payer_id::text, null, null, r.debtor_id);
    if v_notice_id is not null then v_notices := v_notices + 1; end if;

    v_notice_id := public.create_notification(
      r.debtor_id, 'history_expiring',
      'An old expense was archived',
      public.archival_notice_body(
        'Your ' || to_char(r.amount, 'FM₹999999999990.00') || ' "' || r.description || '" record',
        v_purge_after),
      '/history', '/archive/expense/' || r.id::text || '/' || r.debtor_id::text, null, null, r.payer_id);
    if v_notice_id is not null then v_notices := v_notices + 1; end if;
  end loop;

  -- Group expenses -----------------------------------------------------------
  -- Same reasoning: only CANCELLED group expenses are eligible, and a cancelled
  -- expense contributes nothing to group_balances_for().
  for r in
    select ge.*
      from public.group_expenses ge
     where ge.status = 'CANCELLED'
       and ge.updated_at < v_cutoff
       and not exists (select 1 from public.archived_records a
                        where a.kind = 'group_expense' and a.original_id = ge.id)
     order by ge.updated_at
     limit 500
  loop
    select array_agg(distinct m.user_id) into v_participants
      from public.group_members m where m.group_id = r.group_id;

    v_snapshot := jsonb_build_object(
      'group_expense', to_jsonb(r),
      'shares', coalesce((select jsonb_agg(to_jsonb(s) order by s.user_id)
                            from public.group_expense_shares s where s.group_expense_id = r.id), '[]'::jsonb),
      'group_name', (select g.name from public.groups g where g.id = r.group_id)
    );

    insert into public.archived_records
      (kind, original_id, participant_ids, snapshot, purge_after, expiration_notice_at)
    values ('group_expense', r.id, coalesce(v_participants, '{}'::uuid[]), v_snapshot, v_purge_after, now())
    on conflict (kind, original_id) do nothing;

    delete from public.group_expenses where id = r.id;
    v_archived := v_archived + 1;

    -- Everybody who was in the group gets told.
    foreach v_uid in array coalesce(v_participants, '{}'::uuid[]) loop
      v_notice_id := public.create_notification(
        v_uid, 'history_expiring',
        'An old group expense was archived',
        public.archival_notice_body(
          'Your share of ' || to_char(r.amount, 'FM₹999999999990.00') || ' "' || r.description ||
          '" in ' || coalesce((select g.name from public.groups g where g.id = r.group_id), 'your group'),
          v_purge_after),
        '/history', '/archive/group-expense/' || r.id::text || '/' || v_uid::text, null, r.group_id, null, null);
      if v_notice_id is not null then v_notices := v_notices + 1; end if;
    end loop;
  end loop;

  -- Settlements --------------------------------------------------------------
  -- A CONFIRMED settlement *does* feed live balances, so this one only moves
  -- once the pair (or group) has nothing open left to offset it with.
  for r in
    select s.*
      from public.settlements s
     where s.status in ('CONFIRMED', 'CANCELLED')
       and s.updated_at < v_cutoff
       and case when s.group_id is null
                then public.pair_is_quiet(s.payer_id, s.receiver_id)
                else public.group_is_quiet(s.group_id) end
       and not exists (select 1 from public.archived_records a
                        where a.kind = 'settlement' and a.original_id = s.id)
     order by s.updated_at
     limit 500
  loop
    v_participants := array[r.payer_id, r.receiver_id];
    v_snapshot := jsonb_build_object('settlement', to_jsonb(r));

    insert into public.archived_records
      (kind, original_id, participant_ids, snapshot, purge_after, expiration_notice_at)
    values ('settlement', r.id, v_participants, v_snapshot, v_purge_after, now())
    on conflict (kind, original_id) do nothing;

    delete from public.settlements where id = r.id;
    v_archived := v_archived + 1;

    -- Same rule as everywhere else: a payment record is somebody's money history.
    foreach v_uid in array array[r.payer_id, r.receiver_id] loop
      v_notice_id := public.create_notification(
        v_uid, 'history_expiring',
        'An old payment record was archived',
        public.archival_notice_body(
          'Your ' || to_char(r.amount, 'FM₹999999999990.00') || ' settle-up with ' ||
          public.display_name(case when v_uid = r.payer_id then r.receiver_id else r.payer_id end),
          v_purge_after),
        '/history', '/archive/settlement/' || r.id::text || '/' || v_uid::text,
        null, r.group_id, case when v_uid = r.payer_id then r.receiver_id else r.payer_id end, null);
      if v_notice_id is not null then v_notices := v_notices + 1; end if;
    end loop;
  end loop;

  -- Purge pass
  for r in
    select a.*
      from public.archived_records a
     where a.purge_after < now()
       and a.expiration_notice_at is not null
       and now() > a.expiration_notice_at + make_interval(days => v_notice_days)
       and (
         not exists (
           select 1 from unnest(a.participant_ids) as p(uid)
            where not exists (
              select 1 from public.user_exports ux
               where ux.user_id = p.uid and ux.created_at >= a.expiration_notice_at
            )
         )
         or now() > a.expiration_notice_at + make_interval(days => v_notice_days * 2)
       )
  loop
    delete from public.archived_records where id = r.id;
    v_purged := v_purged + 1;
  end loop;

  return query select v_archived, v_notices, v_purged;
end $$;

-- Explicitly grant execute to authenticated and service_role
grant execute on function public.archive_settled_records() to authenticated;
grant execute on function public.archive_settled_records() to service_role;
revoke execute on function public.archive_settled_records() from anon;
