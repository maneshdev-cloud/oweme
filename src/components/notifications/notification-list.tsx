'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BellOff, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { NotificationItem, type NotificationView } from '@/components/notifications/notification-item';
import { markAllNotificationsRead } from '@/lib/actions/notifications';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
] as const;

export function NotificationList({ notifications }: { notifications: NotificationView[] }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationView[]>(notifications);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all');
  const [pending, startTransition] = useTransition();
  const clearedOnVisit = useRef(false);

  useEffect(() => {
    setItems(notifications);
  }, [notifications]);

  const unread = items.filter((notification) => !notification.is_read);
  const visible = useMemo(
    () => (filter === 'unread' ? unread : items),
    [filter, items, unread],
  );

  const handleDismiss = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  useEffect(() => {
    if (unread.length > 0 && !clearedOnVisit.current) {
      clearedOnVisit.current = true;
      markAllNotificationsRead().then(() => {
        router.refresh();
      });
    }
  }, [unread.length, router]);

  function markAll() {
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
      toast.success(result.data.cleared > 0 ? `Cleared ${result.data.cleared}.` : 'Nothing left to clear.');
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="Nothing yet"
        description="Friend requests, expenses, payment confirmations and disputes all land here — even if your phone was off when they happened."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full bg-secondary p-0.5" role="tablist" aria-label="Filter notifications">
          {FILTERS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="tab"
              aria-selected={filter === entry.value}
              onClick={() => setFilter(entry.value)}
              className={
                filter === entry.value
                  ? 'rounded-full bg-background px-3 py-1 text-xs font-medium shadow-sm'
                  : 'rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground'
              }
            >
              {entry.label}
              {entry.value === 'unread' && unread.length > 0 && ` · ${unread.length}`}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={markAll} loading={pending} disabled={pending || unread.length === 0}>
          <CheckCheck className="h-4 w-4" /> Mark all read
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          You’re all caught up.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} onDismiss={handleDismiss} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default NotificationList;

