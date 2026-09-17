'use client';

import { useEffect, useState } from 'react';
import { Info, TriangleAlert, X } from 'lucide-react';
import type { AppSettings } from '@/lib/types';

/**
 * Site-wide announcement set from the admin panel. Dismissal is remembered
 * locally only — it is a banner, not a record, and it comes straight from
 * app_settings so it appears without a deploy.
 */
export function AnnouncementBanner({ settings }: { settings: AppSettings }) {
  const banner = settings.announcement_banner;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!banner) return;
    setDismissed(window.localStorage.getItem(`oweme:banner:${banner.message}`) === 'dismissed');
  }, [banner]);

  if (!banner || dismissed) return null;

  const Icon = banner.tone === 'warning' ? TriangleAlert : Info;

  return (
    <div
      role="status"
      className={
        banner.tone === 'warning'
          ? 'flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200'
          : 'flex items-start gap-2 border-b bg-accent px-4 py-2 text-sm text-accent-foreground'
      }
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1">{banner.message}</p>
      {banner.dismissible && (
        <button
          type="button"
          aria-label="Dismiss announcement"
          className="rounded-full p-1 hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => {
            window.localStorage.setItem(`oweme:banner:${banner.message}`, 'dismissed');
            setDismissed(true);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
