'use client';

import { useEffect, useState } from 'react';
import { Bell, BellRing, Check, Send, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
  testDeviceNotification,
} from '@/lib/notifications';
import { updateNotificationPreferences } from '@/lib/actions/notifications';

export function NotificationPromptBanner() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [testing, setTesting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPermission(getNotificationPermission());
    }
  }, []);

  if (dismissed || !isNotificationSupported() || permission === 'unsupported') {
    return null;
  }

  const handleEnable = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      void updateNotificationPreferences({ browserPushEnabled: true, emailEnabled: false });
      // Immediately send a live test notification to give immediate feedback
      await testDeviceNotification();
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await testDeviceNotification();
    } finally {
      setTesting(false);
    }
  };

  if (permission === 'default') {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <BellRing className="h-4 w-4" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold tracking-tight text-foreground">
                Enable Desktop & Phone Notifications
              </p>
              <p className="text-xs text-muted-foreground">
                Get real-time alerts with sound on this device when friends pay you, add expenses, or confirm settlements.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button size="sm" onClick={handleEnable} className="shadow-xs font-medium">
              <Bell className="mr-1.5 h-3.5 w-3.5" /> Turn on alerts
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDismissed(true)} className="text-xs text-muted-foreground">
              Later
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (permission === 'granted') {
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-xs text-emerald-900 dark:text-emerald-300">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" />
          </span>
          <span className="font-medium">Device notifications are active on this {typeof window !== 'undefined' && window.innerWidth < 768 ? 'phone' : 'computer'}.</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={testing}
          className="h-7 text-xs border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
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
        <span>Notifications are blocked in your browser settings. In-app toasts and alerts still work.</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleTest}
        disabled={testing}
        className="h-7 text-xs"
      >
        Test in-app sound
      </Button>
    </div>
  );
}
