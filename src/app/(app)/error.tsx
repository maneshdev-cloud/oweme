'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Best-effort structured report; a logging failure never blocks the UI.
    void fetch('/api/admin/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'route_error',
        message: error.message,
        context: { digest: error.digest ?? null, path: typeof window !== 'undefined' ? window.location.pathname : null },
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="py-8">
      <ErrorState onRetry={reset} />
    </div>
  );
}
