-- Migration: 20260101091400_push_subscriptions.sql
-- Web Push subscriptions table for background and closed-app notifications.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);
create unique index if not exists idx_push_subs_endpoint on public.push_subscriptions(endpoint);

-- Enable Row Level Security
alter table public.push_subscriptions enable row level security;

-- Policies: Users manage their own device subscriptions
create policy "Users can view their own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own push subscriptions"
  on public.push_subscriptions for update
  using (auth.uid() = user_id);

create policy "Users can delete their own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);
