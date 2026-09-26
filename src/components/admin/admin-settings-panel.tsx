'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, CalendarClock, Megaphone, Save, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { runArchiveNow, updateAdminSetting, updateAnnouncement } from '@/lib/actions/admin';
import type { AppSettings } from '@/lib/types';

type SettingKey = 'maintenance_mode' | 'registrations_enabled' | 'expense_creation_enabled' | 'read_only_mode';

const TOGGLES: Array<{ key: SettingKey; label: string; help: string }> = [
  {
    key: 'maintenance_mode',
    label: 'Maintenance mode',
    help: 'Everyone but admins sees a “back shortly” screen. Nobody loses data.',
  },
  {
    key: 'registrations_enabled',
    label: 'New sign-ups',
    help: 'Turn off to stop new people joining while you tidy things up.',
  },
  {
    key: 'expense_creation_enabled',
    label: 'Creating expenses',
    help: 'Off means the add-expense button is disabled everywhere, for everyone.',
  },
  {
    key: 'read_only_mode',
    label: 'Read-only mode',
    help: 'Freezes all financial writes — nothing can be added, marked paid or settled.',
  },
];

export function AdminSettingsPanel({
  settings,
  retention,
}: {
  settings: AppSettings;
  retention: { retention_days: number; archive_purge_days: number; archive_notice_days: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [days, setDays] = useState(retention);
  const [announcement, setAnnouncement] = useState({
    message: settings.announcement_banner?.message ?? '',
    tone: settings.announcement_banner?.tone ?? ('info' as 'info' | 'warning'),
    dismissible: settings.announcement_banner?.dismissible ?? true,
    active: Boolean(settings.announcement_banner),
  });

  useEffect(() => {
    setAnnouncement({
      message: settings.announcement_banner?.message ?? '',
      tone: settings.announcement_banner?.tone ?? ('info' as 'info' | 'warning'),
      dismissible: settings.announcement_banner?.dismissible ?? true,
      active: Boolean(settings.announcement_banner),
    });
  }, [settings.announcement_banner]);

  useEffect(() => {
    setDays({
      retention_days: retention.retention_days,
      archive_purge_days: retention.archive_purge_days,
      archive_notice_days: retention.archive_notice_days,
    });
  }, [retention.retention_days, retention.archive_purge_days, retention.archive_notice_days]);

  const [archiving, setArchiving] = useState(false);

  function setBoolean(key: SettingKey, value: boolean) {
    setSavingKey(key);
    startTransition(async () => {
      const result = await updateAdminSetting({ key, value });
      setSavingKey(null);
      if (!result.ok) {
        toast.error(result.error || `Unable to update ${key}. Check server configuration.`);
        return;
      }
      if (key === 'maintenance_mode') {
        toast.success(value ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.');
      } else {
        const toggle = TOGGLES.find((t) => t.key === key);
        toast.success(`${toggle?.label ?? 'Setting'} updated.`);
      }
      router.refresh();
    });
  }

  function saveRetention() {
    setSavingKey('retention');
    startTransition(async () => {
      for (const [key, value] of Object.entries(days)) {
        const result = await updateAdminSetting({ key, value: Number(value) });
        if (!result.ok) {
          toast.error(result.error);
          setSavingKey(null);
          return;
        }
      }
      setSavingKey(null);
      toast.success('Retention updated — applies to the next scheduled run.');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" aria-hidden /> Switches
          </CardTitle>
          <CardDescription>Every change is written to the admin audit log with who and when.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {TOGGLES.map((toggle) => (
            <div key={toggle.key} className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor={toggle.key}>{toggle.label}</Label>
                <p className="text-xs text-muted-foreground">{toggle.help}</p>
              </div>
              <Switch
                id={toggle.key}
                checked={Boolean(settings[toggle.key])}
                disabled={pending && savingKey === toggle.key}
                onCheckedChange={(value) => setBoolean(toggle.key, value)}
                aria-label={toggle.label}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4" aria-hidden /> Banner
          </CardTitle>
          <CardDescription>Short note at the top of every screen. Keep it under 280 characters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={announcement.message}
            onChange={(event) => setAnnouncement((current) => ({ ...current, message: event.target.value }))}
            placeholder="Exams week — settle up before Friday?"
            rows={2}
            maxLength={280}
          />
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="banner-active"
                checked={announcement.active}
                onCheckedChange={(value) => setAnnouncement((current) => ({ ...current, active: value }))}
                aria-label="Show banner"
              />
              <Label htmlFor="banner-active" className="text-sm">
                Show banner
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="banner-warning"
                checked={announcement.tone === 'warning'}
                onCheckedChange={(value) => setAnnouncement((current) => ({ ...current, tone: value ? 'warning' : 'info' }))}
                aria-label="Warning tone"
              />
              <Label htmlFor="banner-warning" className="text-sm">
                Warning tone
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="banner-dismissible"
                checked={announcement.dismissible}
                onCheckedChange={(value) => setAnnouncement((current) => ({ ...current, dismissible: value }))}
                aria-label="Dismissible"
              />
              <Label htmlFor="banner-dismissible" className="text-sm">
                Dismissible
              </Label>
            </div>
            <Button
              size="sm"
              loading={pending && savingKey === 'banner'}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setSavingKey('banner');
                  const result = await updateAnnouncement(announcement);
                  setSavingKey(null);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success(announcement.active ? 'Banner updated.' : 'Banner removed.');
                  router.refresh();
                })
              }
            >
              <Save className="h-4 w-4" /> Save banner
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" aria-hidden /> Retention & archiving
          </CardTitle>
          <CardDescription>
            These are the only places the numbers are defined — nothing is hardcoded. Records that are still open,
            pending or disputed are never archived.
          </CardDescription>
          <p className="pt-2 text-xs text-muted-foreground">
            What actually decides a deletion, in order: the record must be past <strong>Keep archived for</strong>,
            people must have had their <strong>Notice before purge</strong>, and then either everyone has downloaded
            their history since that notice — or twice the notice window has gone by, so one person who never
            downloads can’t pin a row here forever. Deletion is therefore always <em>on or after</em> the keep-archived
            date; a download can only bring it forward, never hold it back. With the defaults below (keep 90, notice
            30) the keep-archived date is the one that binds.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="retention_days">Archive after (days)</Label>
              <Input
                id="retention_days"
                type="number"
                min={0}
                max={3650}
                value={days.retention_days}
                onChange={(event) => setDays((current) => ({ ...current, retention_days: Number(event.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="archive_notice_days">Notice before purge (days)</Label>
              <Input
                id="archive_notice_days"
                type="number"
                min={0}
                max={3650}
                value={days.archive_notice_days}
                onChange={(event) => setDays((current) => ({ ...current, archive_notice_days: Number(event.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="archive_purge_days">Keep archived for (days)</Label>
              <Input
                id="archive_purge_days"
                type="number"
                min={0}
                max={3650}
                value={days.archive_purge_days}
                onChange={(event) => setDays((current) => ({ ...current, archive_purge_days: Number(event.target.value) }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={saveRetention} loading={pending && savingKey === 'retention'} disabled={pending}>
              <Save className="h-4 w-4" /> Save retention
            </Button>
            <Button
              variant="outline"
              loading={archiving}
              disabled={archiving}
              onClick={() =>
                startTransition(async () => {
                  setArchiving(true);
                  const result = await runArchiveNow();
                  setArchiving(false);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success(
                    `Archived ${result.data.archived}, notified ${result.data.notified}, purged ${result.data.purged}.`,
                  );
                  router.refresh();
                })
              }
            >
              <Archive className="h-4 w-4" /> Run the archive job now
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The job also runs on its own schedule (03:15 archive, 03:45 purge) — this button is for “I changed the
            numbers and want to see it happen”.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
