'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Every screen that can fail has a real error state with a retry — never a
 * blank page. `error.tsx` boundaries render this.
 */
export function ErrorState({
  title = 'That didn’t load',
  description = 'Something went wrong on the way to the server. Your data is safe — nothing was changed.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border p-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-negative/10 text-negative">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
}
