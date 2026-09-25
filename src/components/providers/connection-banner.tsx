'use client';

import { useEffect, useState, useCallback } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useRealtimeStatus } from '@/components/providers/realtime-provider';

/**
 * Offline & connection banner:
 *  - appears when navigator.onLine is false OR when a fetch/Supabase call fails with a network-level error specifically.
 *  - auto-dismisses when connectivity returns.
 *  - never fires for application errors (RLS errors, validation errors, 4xx/5xx responses).
 *  - persistent banner on mobile and desktop.
 */
export function ConnectionBanner() {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const realtime = useRealtimeStatus();

  const checkConnectivity = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOffline(true);
      return;
    }
    setChecking(true);
    try {
      const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
      if (res) {
        setOffline(false);
      }
    } catch (err: unknown) {
      if (
        err instanceof TypeError ||
        (err instanceof Error &&
          (err.name === 'TypeError' ||
            err.message.toLowerCase().includes('fetch') ||
            err.message.toLowerCase().includes('network')))
      ) {
        setOffline(true);
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!navigator.onLine) {
      setOffline(true);
    }

    const handleOnline = () => {
      setOffline(false);
      void checkConnectivity();
    };

    const handleOffline = () => {
      setOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check every 30 seconds when window is active
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkConnectivity();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkConnectivity]);

  if (offline) {
    return (
      <div
        role="status"
        aria-live="assertive"
        className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-600/30 bg-amber-500/15 px-4 py-2.5 text-sm text-amber-900 backdrop-blur-md dark:bg-amber-950/90 dark:text-amber-200"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <CloudOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-xs sm:text-sm">
            <strong className="font-semibold">You&apos;re offline</strong> — some things may not load until you&apos;re back online.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void checkConnectivity()}
          disabled={checking}
          className="shrink-0 rounded-md border border-amber-600/30 bg-amber-500/20 px-2.5 py-1 text-xs font-medium hover:bg-amber-500/30 active:scale-95 transition-all disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Retry'}
        </button>
      </div>
    );
  }

  if (realtime?.state === 'reconnecting') {
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
