import { redirect } from 'next/navigation';
import { Activity, AlertTriangle, Database, HeartPulse, ScrollText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { requireUser, createClient } from '@/lib/supabase/server';
import { getAppSettings, isAdmin } from '@/lib/queries/core';
import { getAdminUpgradeData } from '@/lib/queries/admin';
import { AdminSettingsPanel } from '@/components/admin/admin-settings-panel';
import { AdminManagementPanel, type AuthorizedAdminItem } from '@/components/admin/admin-management-panel';
import { AdminUsageChart } from '@/components/admin/admin-usage-chart';
import { AdminAdoptionPanel } from '@/components/admin/admin-adoption-panel';
import { formatINR, toMinor } from '@/lib/money';
import { timeAgo } from '@/lib/utils';

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

  // Strict server-side access enforcement: bounce unauthorized visitors immediately
  if (!(await isAdmin())) {
    redirect('/home');
  }

  const supabase = await createClient();
  const { createServiceClient } = await import('@/lib/supabase/server');
  const service = createServiceClient();
  const clientToUse = service ?? supabase;

  const [statsResult, settings, authorizedAdminsResult, logsResult, auditResult, upgradeData] = await Promise.all([
    supabase.rpc('admin_stats'),
    getAppSettings(),
    clientToUse
      .from('admin_authorized_emails')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: true }),
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
    getAdminUpgradeData().catch(() => ({
      usageOverTime: [],
      adoption: {
        groups: { total: 0, withThreePlusMembers: 0, withOneOrTwoMembers: 0, empty: 0 },
        settlements: { total: 0, confirmed: 0, disputed: 0, pendingOrUnconfirmed: 0 },
        usersUsedSettleUp: 0,
        activeUsers7d: 0,
        totalUsers: 0,
      },
    })),
  ]);

  let authorizedAdmins = (authorizedAdminsResult.data ?? []) as AuthorizedAdminItem[];
  if (!authorizedAdmins.some((a) => a.email.toLowerCase() === 'maneshjadhavofficial@gmail.com')) {
    authorizedAdmins = [
      {
        id: 'owner-primary',
        email: 'maneshjadhavofficial@gmail.com',
        role: 'owner',
        created_at: new Date().toISOString(),
      },
      ...authorizedAdmins,
    ];
  }

  const stats = (statsResult.data ?? null) as AdminStats | null;
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

  const totalUsersCount = stats?.users?.total ?? upgradeData.adoption.totalUsers ?? 0;
  const activeUsersCount = stats?.users?.active_7d ?? upgradeData.adoption.activeUsers7d ?? 0;
  const new7dUsersCount = stats?.users?.new_7d ?? 0;

  const tiles = [
    { label: 'Total Users', value: totalUsersCount, hint: `${new7dUsersCount} new this week` },
    { label: 'Active (7d)', value: activeUsersCount, hint: 'engaged recently' },
    { label: 'Expenses', value: stats?.expenses?.total ?? 0, hint: `${stats?.expenses?.last_7d ?? 0} this week` },
    { label: 'Open', value: stats?.expenses?.open ?? 0, hint: `${formatINR(toMinor(stats?.expenses?.open_value ?? 0))} face value` },
    { label: 'Disputed', value: stats?.expenses?.disputed ?? 0, hint: 'nothing auto-resolved' },
    { label: 'Groups', value: stats?.groups?.total ?? upgradeData.adoption.groups.total, hint: `${stats?.groups?.active_30d ?? 0} active this month` },
    { label: 'Notifications', value: stats?.notifications?.total ?? 0, hint: `${stats?.notifications?.unread ?? 0} unread` },
    { label: 'Archived', value: stats?.retention?.archived_records ?? 0, hint: `${stats?.retention?.pending_purge ?? 0} past purge date` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Admin</h2>
          <p className="text-sm text-muted-foreground">
            Operational view only. There is no way to read somebody’s expenses from here — that is by design.
          </p>
        </div>
        <Badge variant={stats && stats.health?.errors_24h === 0 ? 'positive' : 'negative'}>
          <HeartPulse className="mr-1 h-3 w-3" aria-hidden />
          {stats ? `${stats.health?.errors_24h ?? 0} errors / 24h` : 'health check quiet'}
        </Badge>
      </div>

      {statsResult.error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Notice: RPC statistics had degraded database response. Core operational panels remain active.</span>
        </div>
      )}

      {/* High-level metrics */}
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

      {/* Upgrades: Usage over time chart */}
      <AdminUsageChart data={upgradeData.usageOverTime} />

      {/* Upgrades: Feature adoption signals */}
      <AdminAdoptionPanel adoption={upgradeData.adoption} />

      <AdminSettingsPanel
        settings={settings}
        retention={{
          retention_days: Number(settings.retention_days ?? stats?.settings?.retention_days ?? 60),
          archive_purge_days: Number(settings.archive_purge_days ?? stats?.settings?.archive_purge_days ?? 90),
          archive_notice_days: Number(settings.archive_notice_days ?? stats?.settings?.archive_notice_days ?? 30),
        }}
      />

      <AdminManagementPanel admins={authorizedAdmins} currentUserEmail={user.email} />

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
              Database total: <span className="tabular font-medium">{bytes(stats?.storage?.database_bytes)}</span>
            </p>
            <Separator />
            <ul className="space-y-1">
              {(stats?.storage?.largest_tables ?? []).map((table) => (
                <li key={table.table} className="flex justify-between">
                  <span className="text-muted-foreground">{table.table}</span>
                  <span className="tabular">{bytes(table.bytes)}</span>
                </li>
              ))}
              {(!stats?.storage?.largest_tables || stats.storage.largest_tables.length === 0) && (
                <li className="text-xs text-muted-foreground">Table metrics unavailable</li>
              )}
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
    </div>
  );
}
