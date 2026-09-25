'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/actions/profile';
import { getClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      // 1. Invalidate client-side Supabase session (clears cookies immediately)
      const supabase = getClient();
      await supabase.auth.signOut();
    } catch {
      // Non-blocking
    }

    try {
      // 2. Call server action to clear server-side session and redirect
      await signOut();
    } catch {
      // 3. Fallback: If server action fails (e.g. Next.js HMR rebuild invalidated
      // action hash while the user was on the page), navigate directly.
      window.location.href = '/login?signedOut=1';
    }
  };

  return (
    <Button
      variant="destructive"
      loading={loading}
      disabled={loading}
      onClick={handleSignOut}
    >
      <LogOut className="h-4 w-4" /> Sign out
    </Button>
  );
}
