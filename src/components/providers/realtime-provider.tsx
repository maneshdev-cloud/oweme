'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getClient } from '@/lib/supabase/client';

/**
 * One realtime channel per signed-in session.
 *
 * Every financial table is subscribed with a wildcard listener; Supabase filters
 * the stream through RLS, so this client only ever receives rows it is allowed
 * to read. A change triggers `router.refresh()`, which re-runs the Server
 * Component for the current route — no polling anywhere in the app, and no
 * manual refresh for the user.
 *
 * Duplicate deliveries are collapsed into a single refresh by the debounce, and
 * the channel is torn down on unmount so a hot-reload or navigation never
 * leaves a duplicate subscription behind.
 */
const REALTIME_TABLES = [
  'expenses',
  'expense_events',
  'friendships',
  'notifications',
  'groups',
  'group_members',
  'group_expenses',
  'group_expense_shares',
  'group_expense_payers',
  'settlements',
  'app_settings',
] as const;

type RealtimeState = 'connecting' | 'live' | 'reconnecting';

const RealtimeContext = createContext<{ state: RealtimeState; lastEventAt: number | null }>({
  state: 'connecting',
  lastEventAt: null,
});

export function useRealtimeStatus() {
  return useContext(RealtimeContext);
}

export function RealtimeProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const router = useRouter();
  const supabase = useMemo(() => getClient(), []);
  const [state, setState] = useState<RealtimeState>('connecting');
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refreshSoon = (payload?: { table?: string; eventType?: string; old?: Record<string, unknown> }) => {
      setLastEventAt(Date.now());
      if (timer.current) clearTimeout(timer.current);

      timer.current = setTimeout(() => {
        if (typeof window !== 'undefined') {
          const currentPath = window.location.pathname;
          if (
            (payload?.table === 'groups' && payload?.eventType === 'DELETE' && payload.old?.id && currentPath.includes(String(payload.old.id))) ||
            (payload?.table === 'group_members' && payload?.eventType === 'DELETE' && payload.old?.user_id === userId && payload.old?.group_id && currentPath.includes(String(payload.old.group_id)))
          ) {
            window.location.href = '/groups';
            return;
          }
        }
        router.refresh();
      }, 60);
    };

    const channel = supabase.channel(`oweme:${userId}`);

    for (const table of REALTIME_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        refreshSoon(payload as { table?: string; eventType?: string; old?: Record<string, unknown> });
      });
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') setState('live');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setState('reconnecting');
      else setState('connecting');
    });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, router]);

  const value = useMemo(() => ({ state, lastEventAt }), [state, lastEventAt]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
