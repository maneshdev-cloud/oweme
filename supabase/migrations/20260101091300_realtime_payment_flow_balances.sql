-- Migration: 20260101091300_realtime_payment_flow_balances.sql
-- Real-time payment confirmation flow:
-- When a debtor marks an expense as paid ('PAYMENT_MARKED') or creates a settlement ('PENDING'),
-- the debtor has parted with the money. From the debtor's perspective, the pending "money to give"
-- immediately updates to 0 for that transaction while awaiting creditor confirmation.
-- If the creditor clicks "Received" ('CONFIRMED'), it is permanently settled (balance remains 0).
-- If the creditor clicks "Didn't Receive" ('DISPUTED'), the transaction returns to pending debt,
-- and the debtor's pending balance immediately shows the amount again.

create or replace function public.my_balances()
returns table (counterparty_id uuid, currency text, balance numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select auth.uid() as uid),
  open_expenses as (
    select case when e.payer_id = me.uid then e.debtor_id else e.payer_id end as cp,
           e.currency,
           case
             when e.payer_id = me.uid then e.amount
             when e.debtor_id = me.uid and e.status = 'PAYMENT_MARKED' then 0
             else -e.amount
           end as delta
    from public.expenses e, me
    where (e.payer_id = me.uid or e.debtor_id = me.uid)
      and e.status in ('PENDING', 'PAYMENT_MARKED', 'DISPUTED')
  ),
  direct_settlements as (
    select case when s.payer_id = me.uid then s.receiver_id else s.payer_id end as cp,
           s.currency,
           case
             when s.payer_id = me.uid and s.status in ('CONFIRMED', 'PENDING') then s.amount
             when s.receiver_id = me.uid and s.status = 'CONFIRMED' then -s.amount
             else 0
           end as delta
    from public.settlements s, me
    where s.group_id is null
      and (s.payer_id = me.uid or s.receiver_id = me.uid)
      and (s.status = 'CONFIRMED' or (s.payer_id = me.uid and s.status = 'PENDING'))
  ),
  combined as (
    select * from open_expenses union all select * from direct_settlements
  )
  select cp, currency, sum(delta)::numeric(14,2) as balance
  from combined
  where cp is not null
  group by cp, currency
  having sum(delta) <> 0;
$$;
