'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Info, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getClient } from '@/lib/supabase/client';
import { safeNextPath } from '@/lib/supabase/config';

export function SignInButton({ mode = 'sign-in' }: { mode?: 'sign-in' | 'sign-up' }) {
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = params.get('reason');
  const signedOut = params.get('signedOut');
  const next = safeNextPath(params.get('next'));

  async function signIn() {
    setLoading(true);
    setError(null);
    try {
      const supabase = getClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (!oauthError) return;
      setError(
        oauthError.message.includes('provider is not enabled')
          ? 'Google sign-in is not switched on for this project yet. Enable the Google provider in Supabase → Authentication → Providers.'
          : oauthError.message,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Supabase is not configured for this app yet.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {(reason === 'session-expired' || reason === 'supabase-config') && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {reason === 'supabase-config'
            ? 'Supabase is not connected yet. Add the project URL and anon key to .env.local, then restart the app.'
            : 'Your session expired, so we asked you to sign in again. Nothing was lost.'}
        </p>
      )}
      {signedOut && (
        <p role="status" className="rounded-xl bg-secondary px-3 py-2 text-sm text-secondary-foreground">
          Signed out. See you next time.
        </p>
      )}

      <Button onClick={signIn} loading={loading} size="lg" className="w-full">
        <LogIn className="h-4 w-4" /> {mode === 'sign-up' ? 'Create account with Google' : 'Continue with Google'}
      </Button>

      {error && (
        <p role="alert" className="rounded-xl bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
