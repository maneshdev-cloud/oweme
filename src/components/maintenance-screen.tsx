import { Wrench } from 'lucide-react';
import { Brand } from '@/components/brand';

/**
 * Shown to non-admins while maintenance mode is on. The database is still the
 * authority (writes are refused server-side); this is just the human-facing
 * version of that.
 */
export function MaintenanceScreen() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Brand />
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
        <Wrench className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">OweMe is getting a quick service</h1>
      <p className="text-sm text-muted-foreground">
        Nothing is lost — your balances are exactly as you left them. Try again in a few minutes.
      </p>
    </main>
  );
}
