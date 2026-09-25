'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  BadgeCheck,
  BellRing,
  Check,
  CircleSlash,
  HandCoins,
  Megaphone,
  Receipt,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dismissNotification, markNotificationRead } from '@/lib/actions/notifications';
import { respondToFriendRequestFromNotification } from '@/lib/actions/friends';
import { respondToPaymentFromNotification } from '@/lib/actions/expenses';
import { cn, timeAgo } from '@/lib/utils';

const ICONS: Record<string, typeof BellRing> = {
  expense_created: Receipt,
  payment_marked: HandCoins,
  payment_confirmed: BadgeCheck,
  payment_disputed: ShieldAlert,
  expense_cancelled: CircleSlash,
  friend_request: UserPlus,
  friend_accepted: UserCheck,
  friend_declined: CircleSlash,
  group_added: UsersRound,
  group_expense_added: Receipt,
  settlement_created: HandCoins,
  settlement_confirmed: BadgeCheck,
  history_expiring: BellRing,
  admin_announcement: Megaphone,
};

const TONES: Record<string, string> = {
  payment_confirmed: 'text-positive',
  settlement_confirmed: 'text-positive',
  friend_accepted: 'text-positive',
  payment_disputed: 'text-negative',
  friend_declined: 'text-muted-foreground',
  history_expiring: 'text-amber-600 dark:text-amber-400',
  admin_announcement: 'text-primary',
};

export type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  deep_link: string;
  is_read: boolean;
  created_at: string;
  resolvable: boolean;
  related_user_id: string | null;
  related_settlement_id?: string | null;
  related_expense_id?: string | null;
};

/**
 * A notification row. Two rules:
 *  • clicking it marks it read and follows the link;
 *  • if the thing it points at is gone (purged archive, cancelled record), it
 *    says so instead of dropping the user on a 404.
 */
export function NotificationItem({
  notification,
  onDismiss,
}: {
  notification: NotificationView;
  onDismiss?: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const Icon = ICONS[notification.type] ?? BellRing;
  const tone = TONES[notification.type] ?? 'text-muted-foreground';
  const actionableFriendRequest = notification.type === 'friend_request' && notification.related_user_id;
  const isPaymentActionable =
    notification.resolvable &&
    (notification.type === 'payment_marked' ||
      notification.type === 'settlement_created' ||
      notification.title.toLowerCase().includes('did you receive'));

  function open() {
    startTransition(async () => {
      if (!notification.is_read) await markNotificationRead(notification.id);
      if (notification.resolvable) router.push(notification.deep_link);
      else router.refresh();
    });
  }

  function remove() {
    onDismiss?.(notification.id);
    startTransition(async () => {
      const result = await dismissNotification(notification.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function respond(response: 'accept' | 'decline') {
    if (!notification.related_user_id) return;
    onDismiss?.(notification.id);
    startTransition(async () => {
      const result = await respondToFriendRequestFromNotification({
        addresseeId: notification.related_user_id,
        response,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(response === 'accept' ? 'Friend request accepted.' : 'Friend request declined.');
      router.refresh();
    });
  }

  function respondPayment(response: 'yes' | 'no') {
    onDismiss?.(notification.id);
    startTransition(async () => {
      const result = await respondToPaymentFromNotification({
        notificationId: notification.id,
        response,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        response === 'yes'
          ? 'Payment confirmed — balance updated.'
          : 'Payment declined — notification sent to the payer.',
      );
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        'group flex flex-col gap-3 rounded-2xl border bg-card p-3.5 transition-colors sm:flex-row sm:items-start',
        !notification.is_read && 'border-primary/40 bg-primary/5',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <button
          type="button"
          onClick={open}
          disabled={pending}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', tone)} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className={cn('truncate text-sm', !notification.is_read ? 'font-semibold' : 'font-medium')}>
                {notification.title}
              </span>
              {!notification.is_read && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                  <Sparkles className="h-3 w-3" aria-hidden /> Unread
                </span>
              )}
            </span>
            {notification.body && <span className="mt-0.5 block text-sm text-muted-foreground">{notification.body}</span>}
            <span className="mt-1 block text-xs text-muted-foreground">
              {timeAgo(notification.created_at)}
              {!notification.resolvable && ' · no longer available'}
            </span>
          </span>
        </button>

        <Button
          size="sm"
          variant="ghost"
          onClick={remove}
          disabled={pending}
          className="h-8 w-8 p-0 text-muted-foreground sm:hidden shrink-0"
          aria-label={`Dismiss “${notification.title}”`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {(actionableFriendRequest || isPaymentActionable) && (
        <div className="flex w-full sm:w-auto items-center justify-between gap-2 border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0 sm:self-center shrink-0">
          {actionableFriendRequest && (
            <div className="flex w-full sm:w-auto gap-2">
              <Button size="sm" variant="positive" className="flex-1 sm:flex-initial" onClick={() => respond('accept')} disabled={pending}>
                Accept
              </Button>
              <Button size="sm" variant="ghost" className="flex-1 sm:flex-initial" onClick={() => respond('decline')} disabled={pending}>
                Decline
              </Button>
            </div>
          )}

          {isPaymentActionable && (
            <div className="flex w-full sm:w-auto items-center gap-2">
              <Button size="sm" variant="positive" className="flex-1 sm:flex-initial" onClick={() => respondPayment('yes')} disabled={pending}>
                <Check className="h-3.5 w-3.5" aria-hidden /> Received
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-initial border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => respondPayment('no')}
                disabled={pending}
              >
                <X className="h-3.5 w-3.5" aria-hidden /> Didn&apos;t Receive
              </Button>
            </div>
          )}
        </div>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={remove}
        disabled={pending}
        className="hidden sm:inline-flex text-muted-foreground shrink-0 self-center"
        aria-label={`Dismiss “${notification.title}”`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
