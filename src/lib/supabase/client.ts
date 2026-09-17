'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig } from '@/lib/supabase/config';

/**
 * Browser Supabase client — used for Realtime subscriptions and small client
 * side reads. Authorization still comes from RLS, so a compromised browser
 * client cannot read anybody else's money.
 */
export function createClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createBrowserClient(
    url,
    anonKey,
  );
}

let cached: ReturnType<typeof createClient> | null = null;

/** Shared instance so we never open more than one realtime socket. */
export function getClient() {
  cached ??= createClient();
  return cached;
}
