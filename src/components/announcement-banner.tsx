'use client';

import { useEffect, useState } from 'react';
import { Info, TriangleAlert, X } from 'lucide-react';
import type { AppSettings } from '@/lib/types';

/**
 * Site-wide announcement set from the admin panel.
 * - Single source of truth from app_settings (Supabase).
 * - Dismissal is only active if dismissible is enabled in admin settings.
 * - Perfectly aligned across mobile, tablet, and desktop (max-w-6xl).
 * - Distinct, high-contrast info vs warning tones.
 */
export function AnnouncementBanner({ settings }: { settings: AppSettings }) {
  const banner = settings.announcement_banner;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!banner || !banner.dismissible) {
      setDismissed(false);
      return;
    }
    const key = `oweme:banner:${banner.message}:${banner.tone}`;
    try {
      setDismissed(window.localStorage.getItem(key) === 'dismissed');
    } catch {
      setDismissed(false);
    }
  }, [banner]);

  if (!banner || (banner.dismissible && dismissed)) return null;

  const isWarning = banner.tone === 'warning';
  const Icon = isWarning ? TriangleAlert : Info;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        isWarning
          ? 'relative z-20 w-full border-b border-amber-500/30 bg-amber-500/10 text-amber-900 backdrop-blur-sm dark:border-amber-500/20 dark:bg-amber-950/80 dark:text-amber-200'
          : 'relative z-20 w-full border-b border-primary/20 bg-primary/10 text-primary-950 backdrop-blur-sm dark:border-primary/20 dark:bg-primary-950/80 dark:text-primary-100'
      }
    >
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-3 px-4 py-2.5 sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
          <Icon
            className={`mt-0.5 h-4 w-4 shrink-0 sm:mt-0 ${
              isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-primary'
            }`}
            aria-hidden
          />
          <p className="flex-1 text-xs font-medium leading-relaxed break-words sm:text-sm">
            {banner.message}
          </p>
        </div>
        {banner.dismissible && (
          <button
            type="button"
            aria-label="Dismiss announcement"
            className="shrink-0 -mr-1 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground active:scale-95 dark:hover:bg-white/10"
            onClick={() => {
              try {
                window.localStorage.setItem(`oweme:banner:${banner.message}:${banner.tone}`, 'dismissed');
              } catch {
                // Ignore storage failure
              }
              setDismissed(true);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

