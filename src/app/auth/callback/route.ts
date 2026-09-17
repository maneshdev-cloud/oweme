import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/supabase/config';
import { log } from '@/lib/logger';

/**
 * OAuth callback. Exchanges the code for a session, then sends the user where
 * they were going. If the exchange fails (expired code, provider hiccup) the
 * user lands back on /login with a readable reason rather than a stack trace.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));
  const errorDescription = url.searchParams.get('error_description');

  if (errorDescription) {
    await log.warn('oauth_callback_error', errorDescription);
    return NextResponse.redirect(new URL(`/login?reason=${encodeURIComponent(errorDescription)}`, url.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?reason=missing-code', url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    await log.warn('oauth_exchange_failed', error.message);
    return NextResponse.redirect(new URL('/login?reason=session-expired', url.origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await log.info('user_signed_in', 'Google sign-in completed', {}, user?.id ?? null);

  // The profile row is created by a database trigger on auth.users; if the
  // account predates the migration we make sure it exists before the app loads.
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (!profile) {
      await supabase.from('profiles').insert({
        id: user.id,
        full_name: (user.user_metadata?.full_name as string) ?? user.email?.split('@')[0] ?? 'Student',
        username: (user.email?.split('@')[0] ?? `student${user.id.slice(0, 6)}`).toLowerCase().replace(/[^a-z0-9_]/g, ''),
        email: user.email ?? '',
        avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
      });
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
