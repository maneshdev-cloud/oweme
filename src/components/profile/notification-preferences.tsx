'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BellRing, Mail, Smartphone } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { updateNotificationPreferences } from '@/lib/actions/notifications';

/**
 * The app works completely without browser push — notifications are rows in the
 * database first. Push is offered here as a bonus, and only after a deliberate
 * tap, because asking at the wrong moment burns the permission forever.
 */
export function NotificationPreferences({
  browserPushEnabled,
  emailEnabled,
}: {
  browserPushEnabled: boolean;
  emailEnabled: boolean;
}) {
  const router = useRouter();
  const [push, setPush] = useState(browserPushEnabled);
  const [email, setEmail] = useState(emailEnabled);
  // Decided in the browser: during server rendering there is no Notification API.
  const [pushSupported, setPushSupported] = useState(false);
  const [permission, setPermission] = useState<string>('default');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'Notification' in window;
    setPushSupported(supported);
    setPermission(supported ? Notification.permission : 'unsupported');
  }, []);

  async function enablePush(next: boolean) {
    if (!next) {
      setPush(false);
      save({ browserPushEnabled: false, emailEnabled: email });
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        toast.error('Your browser said no. In-app alerts still work — you won’t miss anything.');
        return;
      }
    } catch {
      toast.error('This browser wouldn’t ask. In-app alerts still work.');
      return;
    }

    setPush(true);
    save({ browserPushEnabled: true, emailEnabled: email });
  }

  function save(input: { browserPushEnabled: boolean; emailEnabled: boolean }) {
    startTransition(async () => {
      const result = await updateNotificationPreferences(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Preference saved.');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="in-app" className="flex items-center gap-2">
            <BellRing className="h-4 w-4" aria-hidden /> In-app alerts
          </Label>
          <p className="text-xs text-muted-foreground">
            Always on. They’re stored on the server first, so switching your phone off doesn’t lose one.
          </p>
        </div>
        <Switch id="in-app" checked disabled aria-label="In-app alerts are always on" />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="push" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" aria-hidden /> Browser notifications
          </Label>
          <p className="text-xs text-muted-foreground">
            {pushSupported
              ? permission === 'denied'
                ? 'Blocked in your browser settings. In-app alerts keep working.'
                : 'Only if you want a nudge when the app is closed. iPhone users: add OweMe to the Home Screen first.'
              : 'This browser doesn’t support notifications. Nothing else changes.'}
          </p>
        </div>
        <Switch
          id="push"
          checked={push}
          disabled={!pushSupported || pending}
          onCheckedChange={enablePush}
          aria-label="Browser notifications"
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" aria-hidden /> Email digests
          </Label>
          <p className="text-xs text-muted-foreground">
            Stored now so you can switch it on later; no email is sent in this version.
          </p>
        </div>
        <Switch
          id="email"
          checked={email}
          disabled={pending}
          onCheckedChange={(next) => {
            setEmail(next);
            save({ browserPushEnabled: push, emailEnabled: next });
          }}
          aria-label="Email digests"
        />
      </div>

      {pushSupported && permission === 'granted' && push && (
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          onClick={async () => {
            const registration = await navigator.serviceWorker?.getRegistration();
            registration?.showNotification('OweMe is set up', {
              body: 'This is how a payment reminder will look.',
              icon: '/icons/icon-192.png',
            });
          }}
        >
          Send a test notification
        </Button>
      )}
    </div>
  );
}
