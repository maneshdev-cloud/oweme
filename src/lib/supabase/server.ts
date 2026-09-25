import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getSupabaseConfig } from '@/lib/supabase/config';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Runs as the signed-in user, so RLS applies exactly as it does for the
 * browser client — nothing here is allowed to do more than the user could.
 * Memoized per request via React cache() to avoid duplicate cookie parsing.
 */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseConfig();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component render: middleware refreshes the
            // session instead, so this is safe to ignore.
          }
        },
      },
    },
  );
});

/**
 * Service-role client. Bypasses RLS by design — only ever used by admin server
 * actions *after* they have verified the caller's admin claim, and by the
 * archival path. Never import this into a Client Component.
 */
export function createServiceClient() {
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    try {
      // Dynamic fallback for local development if server process started before .env.local was updated
      const fs = require('node:fs');
      const path = require('node:path');
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)$/m);
        if (match && match[1]) {
          key = match[1].trim().replace(/^["']|["']$/g, '');
        }
      }
    } catch {
      // Non-blocking in environments without node fs
    }
  }

  if (!key) return null;
  const { url } = getSupabaseConfig();

  return createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}


/** The signed-in user, or null. Memoized per request to eliminate redundant network auth roundtrips. */
export const getSessionUser = cache(async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The signed-in user, redirected away if there is nobody signed in. */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    const { redirect } = await import('next/navigation');
    redirect('/login?reason=session-expired');
  }
  return user!;
}
