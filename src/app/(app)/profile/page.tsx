import Link from 'next/link';
import { BellRing, Download, Lock, MailWarning, Palette, ShieldQuestion, UserRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { PersonAvatar } from '@/components/person-avatar';
import { ProfileForm } from '@/components/profile/profile-form';
import { NotificationPreferences } from '@/components/profile/notification-preferences';
import { SignOutButton } from '@/components/profile/sign-out-button';
import { ReportIssueButton } from '@/components/report-issue-button';
import { requireUser, createClient } from '@/lib/supabase/server';
import { getMyProfile, getUnreadNotificationCount, isAdmin } from '@/lib/queries/core';
import { formatDate } from '@/lib/utils';
import { getPersonalAnalytics, getRecapCardData } from '@/lib/queries/analytics';
import { PersonalAnalyticsView } from '@/components/analytics/personal-analytics';
import { RecapCard } from '@/components/analytics/recap-card';
import { DownloadAppButton } from '@/components/download-app-button';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [myProfile, admin, unread, preferences, analytics, recap] = await Promise.all([
    getMyProfile(),
    isAdmin(),
    getUnreadNotificationCount(),
    supabase.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    getPersonalAnalytics(user.id),
    getRecapCardData(user.id),
  ]);

  const prefs = (preferences.data ?? {}) as { browser_push_enabled?: boolean; email_enabled?: boolean };

  // The profile row is created by the OAuth callback; if it is ever missing the
  // screen still works instead of crashing on a half-finished signup.
  const profile = myProfile ?? {
    id: user.id,
    full_name: (user.email ?? 'You').split('@')[0],
    username: 'you',
    avatar_url: null,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <PersonAvatar person={profile} className="h-14 w-14" />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold tracking-tight">{profile.full_name}</h2>
          <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
          {profile.created_at && (
            <p className="text-xs text-muted-foreground">Joined {formatDate(profile.created_at)}</p>
          )}
        </div>
      </div>

      {/* Personal Analytics (Private — visible only to user) */}
      <section aria-labelledby="analytics-heading" className="space-y-3">
        <div>
          <h3 id="analytics-heading" className="text-base font-semibold tracking-tight">
            Personal analytics
          </h3>
          <p className="text-xs text-muted-foreground">
            Private to you. Counterparties are counted only — no balances or friend financials are ever exposed.
          </p>
        </div>
        <PersonalAnalyticsView data={analytics} />
      </section>

      {/* Shareable Recap Card (Public-ready, zero friend info) */}
      <section aria-labelledby="recap-heading" className="space-y-3">
        <div>
          <h3 id="recap-heading" className="text-base font-semibold tracking-tight">
            Shareable recap
          </h3>
          <p className="text-xs text-muted-foreground">
            Spotify Wrapped style image card. Strict privacy review: no friend names or balances appear.
          </p>
        </div>
        {recap ? <RecapCard data={recap} /> : null}
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-4 w-4" aria-hidden /> Who you are
          </CardTitle>
          <CardDescription>Only your name, @username and photo are visible to other people.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4" aria-hidden /> Alerts
          </CardTitle>
          <CardDescription>
            OweMe always keeps an in-app alert for you. Browser push is optional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationPreferences
            browserPushEnabled={Boolean(prefs.browser_push_enabled)}
            emailEnabled={Boolean(prefs.email_enabled)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" aria-hidden /> Look
          </CardTitle>
          <CardDescription>Light, dark, or whatever your phone is doing.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" aria-hidden /> Your data
          </CardTitle>
          <CardDescription>
            Download everything you’re part of as CSV or JSON. Nothing is held hostage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/history">Open history & exports</Link>
            </Button>
            <Button asChild variant="ghost">
              <a href="/api/history/export?format=csv" download>
                Quick CSV download
              </a>
            </Button>
          </div>
          <Separator />
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Your expenses are readable only by you and the other person on them. That rule lives in the database,
              not in the app screens.
            </li>
            <li className="flex items-start gap-2">
              <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Nothing is ever hard-deleted while it still matters. Settled records move to an archive first and you
              get a heads-up naming the date the archived copy can go. Downloading your history is how you keep your
              own copy — the archived one is cleared automatically either way.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>
            Signed in with Google. In-app alerts waiting: {unread}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {admin && (
            <Button asChild variant="outline">
              <Link href="/admin">Admin</Link>
            </Button>
          )}
          <SignOutButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" aria-hidden /> App &amp; Offline Access
          </CardTitle>
          <CardDescription>
            Install OweMe on your home screen or desktop for fast, one-tap access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DownloadAppButton variant="outline" showLabel />
          <p className="text-xs text-muted-foreground">
            Works on Android, iPhone (Safari), Windows, and Mac.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MailWarning className="h-4 w-4" aria-hidden /> Report an issue
          </CardTitle>
          <CardDescription>
            Found a bug or something doesn&apos;t feel right? Let us know — we read every message.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ReportIssueButton />
          <p className="text-xs text-muted-foreground">
            Opens Gmail in browser, your email app, or copy our support email.
          </p>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground">
        OweMe v1 <Badge variant="secondary">INR</Badge> · records money that moved, it never moves any.
      </div>
    </div>
  );
}
