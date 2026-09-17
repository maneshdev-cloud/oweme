'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { claimFirstAdmin } from '@/lib/actions/admin';

/**
 * Bootstrap only: the database function refuses to hand out admin once any
 * admin exists, so this screen cannot be used to promote yourself later.
 * Every subsequent grant is a manual `insert into admin_users` (see README).
 */
export function ClaimAdminCard() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" aria-hidden /> No admin yet
        </CardTitle>
        <CardDescription>
          This deployment has no administrator. If that should be you — and you can see this screen because you’re
          signed in — claim it once. After that, this button will refuse to do anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          loading={pending}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await claimFirstAdmin();
              if (!result.ok) {
                setError(result.error);
                toast.error(result.error);
                return;
              }
              if (!result.data.claimed) {
                setError('An administrator already exists. Ask them to grant you the role.');
                return;
              }
              toast.success('You’re the admin now.');
              router.refresh();
            })
          }
        >
          Claim admin access
        </Button>
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
