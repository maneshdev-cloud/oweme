import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Brand } from '@/components/brand';
import { SidebarNav, BottomNav } from '@/components/nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { ConnectionBanner } from '@/components/providers/connection-banner';
import { RealtimeProvider } from '@/components/providers/realtime-provider';
import { AnnouncementBanner } from '@/components/announcement-banner';
import { AddExpenseButton } from '@/components/add-expense/add-expense-fab';
import { MaintenanceScreen } from '@/components/maintenance-screen';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/supabase/server';
import { getAppSettings, getUnreadNotificationCount, isAdmin } from '@/lib/queries/core';
import { getFriends } from '@/lib/queries/social';

import { DashboardSettleUpButton } from '@/components/dashboard-settle-up-button';
import { DownloadAppButton } from '@/components/download-app-button';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const [settings, unread, friends, admin] = await Promise.all([
    getAppSettings(),
    getUnreadNotificationCount(),
    getFriends(),
    isAdmin(),
  ]);

  if (settings.maintenance_mode && !admin) {
    return <MaintenanceScreen />;
  }

  // Expenses can be disabled globally; the button says why instead of failing later.
  const creationDisabled = settings.read_only_mode || !settings.expense_creation_enabled;

  return (
    <RealtimeProvider userId={user.id}>
      <div className="flex min-h-svh flex-col">
        <ConnectionBanner />
        <AnnouncementBanner settings={settings} />

        <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4 pb-24 safe-bottom pt-4 lg:pb-10">
          <aside className="hidden w-60 shrink-0 flex-col gap-6 lg:flex">
            <Link href="/home" className="px-3 py-2">
              <Brand />
            </Link>
            <SidebarNav unreadCount={unread} />
            <div className="space-y-2 px-3">
              <AddExpenseButton
                friends={friends}
                variant="inline"
                className="w-full"
                disabled={creationDisabled}
                label="Add expense"
              />
              <DashboardSettleUpButton
                friends={friends}
                variant="outline"
                className="w-full"
              />
              <DownloadAppButton
                variant="ghost"
                className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
                showLabel
              />
              {creationDisabled && (
                <p className="text-xs text-muted-foreground">
                  Adding expenses is switched off right now by an admin.
                </p>
              )}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="mb-4 flex items-center justify-between gap-2 lg:hidden">
              <Link href="/home" aria-label="OweMe home">
                <Brand />
              </Link>
              <div className="flex items-center gap-1">
                <DownloadAppButton variant="ghost" size="icon" />
                <Button asChild variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
                  <Link href="/notifications" className="relative">
                    <Bell className="h-5 w-5" />
                    {unread > 0 && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-negative" aria-hidden />
                    )}
                  </Link>
                </Button>
                <ThemeToggle />
              </div>
            </header>

            <header className="mb-6 hidden items-center justify-between lg:flex">
              <div className="flex items-center gap-2">
                <h1 className="text-sm text-muted-foreground">Track → Notify → Confirm → Settle</h1>
              </div>
              <div className="flex items-center gap-2">
                <DownloadAppButton variant="outline" size="sm" showLabel />
                <Button asChild variant="outline" size="sm">
                  <Link href="/history">History &amp; export</Link>
                </Button>
                <ThemeToggle />
              </div>
            </header>

            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>

        <AddExpenseButton friends={friends} disabled={creationDisabled} />
        <BottomNav unreadCount={unread} />
      </div>
    </RealtimeProvider>
  );
}
