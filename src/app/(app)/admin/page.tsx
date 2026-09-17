import Link from 'next/link';
import { Activity, BarChart3, Database, HeartPulse, ScrollText, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { requireUser, createClient } from '@/lib/supabase/server';
import { getAppSettings, isAdmin } from '@/lib/queries/core';
import { ClaimAdminCard } from '@/components/admin/claim-admin-card';
import { AdminSettingsPanel } from '@/components/admin/admin-settings-panel';
import { AdminRolePanel } from '@/components/admin/admin-role-panel';
import { formatINR, toMinor } from '@/lib/money';
import { timeAgo } from '@/lib/utils';
import type { Person } from '@/lib/types';

export const metadata = { title: 'Admin' };

function bytes(value: number | undefined): string {
  if (!value) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

type AdminStats = {
  generated_at: string;
  users: { total: number; new_7d: number; active_7d: number };
  expenses: { total: number; open: number; settled: number; disputed: number; last_7d: number; open_value: number };
  groups: { total: number; active_30d: number; members: number };
  notifications: { total: number; unread: number; last_7d: number };
  retention: { archived_records: number; pending_purge: number; oldest_archived_at: string | null };
  health: {
    errors_24h: number;
    warnings_24h: number;
    last_error: { event: string; message: string | null; at: string } | null;
  };
  storage: { database_bytes: number; largest_tables: Array<{ table: string; bytes: number }> };
  settings: Record<string, unknown>;
};

export default async function AdminPage() {
  const user = await requireUser();

  if (!(await isAdmin())) {
    return (
      <div className="space-y-5">
        <h2 className="text-xl font-semibold tracking-tight">Admin</h2>
        <ClaimAdminCard />
      </div>
    );
  }

  const supabase = await createClient();
  const [statsResult, settings, adminsResult, logsResult, auditResult] = await Promise.all([
    supabase.rpc('admin_stats'),
    getAppSettings(),
    supabase.from('admin_users').select('user_id, created_at').order('created_at'),
    supabase
      .from('server_logs')
      .select('id, level, event, message, created_at')
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('admin_audit_log')
      .select('id, action, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const stats = (statsResult.data ?? null) as AdminStats | null;
  const adminIds = ((adminsResult.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id);
  const people = adminIds.length
    ? (((
        await supabase.from('public_profiles').select('id, full_name, username, avatar_url').in('id', adminIds)
      ).data ?? []) as Person[])
    : [];
  const logs = (logsResult.data ?? []) as Array<{
    id: number;
    level: string;
    event: string;
    message: string | null;
    created_at: string;
  }>;
  const audit = (auditResult.data ?? []) as Array<{
    id: number;
    action: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;

  const tiles = stats
    ? [
        { label: 'People', value: stats.users.total, hint: `${stats.users.new_7d} new this week` },
        { label: 'Active (7d)', value: stats.users.active_7d, hint: 'wrote something' },
        { label: 'Expenses', value: stats.expenses.total, hint: `${stats.expenses.last_7d} this week` },
        { label: 'Open', value: stats.expenses.open, hint: `${formatINR(toMinor(stats.expenses.open_value))} face value` },
        { label: 'Disputed', value: stats.expenses.disputed, hint: 'nothing auto-resolved' },
        { label: 'Groups', value: stats.groups.total, hint: `${stats.groups.active_30d} active this month` },
        { label: 'Notifications', value: stats.notifications.total, hint: `${stats.notifications.unread} unread` },
        { label: 'Archived', value: stats.retention.archived_records, hint: `${stats.retention.pending_purge} past purge date` },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Admin</h2>
          <p className="text-sm text-muted-foreground">
            Operational view only. There is no way to read somebody’s expenses from here — that is by design.
          </p>
        </div>
        <Badge variant={stats && stats.health.errors_24h === 0 ? 'positive' : 'negative'}>
          <HeartPulse className="mr-1 h-3 w-3" aria-hidden />
          {stats ? `${stats.health.errors_24h} errors / 24h` : 'stats unavailable'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="space-y-1 p-3.5">
              <p className="text-xs text-muted-foreground">{tile.label}</p>
              <p className="tabular text-xl font-semibold">{tile.value}</p>
              <p className="text-[11px] text-muted-foreground">{tile.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdminSettingsPanel
        settings={settings}
        retention={{
          retention_days: Number(stats?.settings?.retention_days ?? 180),
          archive_purge_days: Number(stats?.settings?.archive_purge_days ?? 90),
          archive_notice_days: Number(stats?.settings?.archive_notice_days ?? 30),
        }}
      />

      <AdminRolePanel admins={people} currentUserId={user.id} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" aria-hidden /> Recent server log
          </CardTitle>
          <CardDescription>
            Warnings and errors the server recorded, with secrets stripped before they were written.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing logged yet — which is the quiet we want.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {logs.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2">
                  <Badge variant={entry.level === 'error' ? 'negative' : entry.level === 'warn' ? 'waiting' : 'muted'}>
                    {entry.level}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{entry.event}</span>
                    {entry.message && <span className="block truncate text-xs text-muted-foreground">{entry.message}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(entry.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" aria-hidden /> Storage
            </CardTitle>
            <CardDescription>Where the free tier is going, biggest first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Database total: <span className="tabular font-medium">{bytes(stats?.storage.database_bytes)}</span>
            </p>
            <Separator />
            <ul className="space-y-1">
              {(stats?.storage.largest_tables ?? []).map((table) => (
                <li key={table.table} className="flex justify-between">
                  <span className="text-muted-foreground">{table.table}</span>
                  <span className="tabular">{bytes(table.bytes)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4" aria-hidden /> Admin actions
            </CardTitle>
            <CardDescription>Every settings change and role grant, with who did it.</CardDescription>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No admin actions yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {audit.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">{entry.action}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(entry.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-secondary/60">
        <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Users className="h-4 w-4" aria-hidden /> How to grant admin outside this screen
          </p>
          <pre className="overflow-x-auto rounded-lg bg-background p-3 text-xs">
{`insert into public.admin_users (user_id, note)
select id, 'trusted teammate'
from public.profiles
where username = 'their_username';`}
          </pre>
          <p>
            The claim button above only works while no admin exists at all. Everything after that is this one-liner —
            deliberately, so a compromised account cannot promote itself from the UI.
          </p>
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" aria-hidden />
        Aggregates only: counts and rupee totals across everyone, never a single person’s ledger. Health probe lives at{' '}
        <Link href="/api/health" className="underline underline-offset-4">
          /api/health
        </Link>
        .
      </p>
    </div>
  );
}
