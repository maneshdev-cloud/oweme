'use client';

import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useRealtimeStatus } from '@/components/providers/realtime-provider';

/**
 * Two different things, deliberately kept apart:
 *  - offline: the device has no connection at all, so adding an expense is
 *    refused up front rather than queued and silently failed.
 *  - reconnecting: we are online but the realtime socket dropped, so updates
 *    may be a moment behind.
 */
export function ConnectionBanner() {
  const [online, setOnline] = useState(true);
  const { state } = useRealtimeStatus();

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!online) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300"
      >
        <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
        <p>
          <strong className="font-semibold">You&apos;re offline.</strong> You can look around, but adding or
          confirming expenses needs a connection — nothing is queued up in the background.
        </p>
      </div>
    );
  }

  if (state === 'reconnecting') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-b bg-muted px-4 py-1.5 text-xs text-muted-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Reconnecting to live updates…
      </div>
    );
  }

  return null;
}
