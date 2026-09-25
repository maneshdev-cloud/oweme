'use client';

import { useEffect, useState } from 'react';
import { BellRing, Check, Send, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isPushSupported,
  isIosNonStandalone,
  subscribeDeviceToPush,
  getExistingPushSubscription,
} from '@/lib/push/client';
import { testDeviceNotification } from '@/lib/notifications';
import { toast } from 'sonner';

export function NotificationPromptBanner() {
  const [mounted, setMounted] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
      void getExistingPushSubscription().then((sub) => {
        setIsSubscribed(Boolean(sub));
      });
    }
  }, []);

  if (!mounted || dismissed || !isPushSupported() && !isIosNonStandalone()) {
    return null;
  }

  const handleEnable = async () => {
    setLoading(true);
    try {
      const result = await subscribeDeviceToPush();
      if (result.success) {
        setIsSubscribed(true);
        setPermission('granted');
        toast.success('Notifications enabled ✓', {
          description: 'You will receive background alerts when friends pay, request, or confirm settlements.',
        });
        await testDeviceNotification();
      } else {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          setPermission(Notification.permission);
        }
        toast.error(result.error || 'Failed to enable notifications.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setLoading(true);
    try {
      await testDeviceNotification();
    } finally {
      setLoading(false);
    }
  };

  // If iOS user is in regular Safari rather than standalone Home Screen app
  if (isIosNonStandalone()) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-900 dark:text-amber-300">
        <div className="flex items-center gap-3">
          <Smartphone className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-0.5">
            <p className="font-semibold text-foreground">iPhone / iPad Background Alerts</p>
            <p className="text-muted-foreground">
              To receive notifications when OWEME is closed, tap the Share button in Safari and select &ldquo;Add to Home Screen&rdquo;.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (permission === 'default' || (!isSubscribed && permission === 'granted')) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <BellRing className="h-4 w-4" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold tracking-tight text-foreground">
                🔔 Enable instant payment alerts
              </p>
              <p className="text-xs text-muted-foreground">
                Get notified instantly on this device even when OWEME is in the background or closed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button
              size="sm"
              onClick={handleEnable}
              disabled={loading}
              loading={loading}
              className="shadow-xs font-medium cursor-pointer"
            >
              Enable Alerts
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
              className="text-xs text-muted-foreground cursor-pointer"
            >
              Later
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (permission === 'granted' && isSubscribed) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-xs text-emerald-900 dark:text-emerald-300">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" />
          </span>
          <span className="font-medium">
            Notifications enabled ✓ (Web Push active on this device)
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={loading}
          className="h-7 text-xs border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 cursor-pointer"
        >
          <Send className="mr-1.5 h-3 w-3" /> Test alert
        </Button>
      </div>
    );
  }

  // Permission denied
  return (
    <div className="flex items-center justify-between rounded-xl border border-muted bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span>
          Notifications are currently blocked. Enable them from your browser/device settings to receive payment alerts.
        </span>
      </div>
    </div>
  );
}

export default NotificationPromptBanner;
