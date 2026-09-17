import { filterResolvableNotifications, getNotifications } from '@/lib/queries/social';
import { NotificationList } from '@/components/notifications/notification-list';

export const metadata = { title: 'Alerts' };

export default async function NotificationsPage() {
  const notifications = await getNotifications();
  // Anything whose subject has since been purged or deleted is still listed —
  // it just loses its link, rather than becoming a dead end.
  const withResolvable = await filterResolvableNotifications(notifications);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Alerts</h2>
        <p className="text-sm text-muted-foreground">
          Nothing is lost if your phone was off — every one of these is stored first, then shown.
        </p>
      </div>
      <NotificationList
        notifications={withResolvable.map((notification) => ({
          id: notification.id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          deep_link: notification.deep_link,
          is_read: notification.is_read,
          created_at: notification.created_at,
          resolvable: notification.resolvable,
          related_user_id: notification.related_user_id,
          related_settlement_id: notification.related_settlement_id,
          related_expense_id: notification.related_expense_id,
        }))}
      />
    </div>
  );
}
