import { Wrench } from 'lucide-react';
import { Brand } from '@/components/brand';
import { SignOutButton } from '@/components/profile/sign-out-button';

/**
 * Rendered server-side for non-admin users whenever maintenance mode is active.
 * Bypassed entirely for verified administrators.
 */
export function MaintenanceScreen() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <Brand />
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <Wrench className="h-8 w-8 animate-pulse" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          OWEME is currently under maintenance.
        </h1>
        <p className="text-sm text-muted-foreground">
          Please try again after some time.
        </p>
      </div>
      <div className="pt-4">
        <SignOutButton />
      </div>
    </main>
  );
}
