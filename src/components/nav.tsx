'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, History, Home, User, Users, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/constants';

const ITEMS = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/friends', label: 'Friends', icon: Users },
  { href: '/groups', label: 'Groups', icon: Wallet },
  { href: '/notifications', label: 'Alerts', icon: Bell },
  { href: '/profile', label: 'Profile', icon: User },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur safe-bottom lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative">
                  <item.icon className={cn('h-5 w-5', active && 'stroke-[2.4]')} aria-hidden />
                  {item.href === '/notifications' && !active && unreadCount > 0 && (
                    <span
                      className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-negative px-1 text-[10px] font-semibold text-negative-foreground"
                      aria-label={`${unreadCount} unread`}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SidebarNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="hidden lg:block">
      <ul className="space-y-1">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <item.icon className="h-5 w-5" aria-hidden />
                <span className="flex-1">{item.label === 'Alerts' ? 'Notifications' : item.label}</span>
                {item.href === '/notifications' && !active && unreadCount > 0 && (
                  <span className="rounded-full bg-negative px-2 py-0.5 text-xs font-semibold text-negative-foreground">
                    {unreadCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        <li className="pt-2">
          <Link
            href="/history"
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              isActive(pathname, '/history')
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <History className="h-5 w-5" aria-hidden />
            <span className="flex-1">History &amp; export</span>
          </Link>
        </li>
      </ul>
      <p className="mt-6 px-3 text-xs text-muted-foreground">
        {APP_NAME} tracks what to give and what to receive. Money still changes hands in cash or UPI.
      </p>
    </nav>
  );
}
