'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceClient, requireUser } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { adminSettingSchema, announcementSchema } from '@/lib/validation';
import { fail, ok, okVoid, type ActionResult } from '@/lib/actions/types';

/**
 * Admin mutations.
 *
 * Two gates, both required:
 *  1. the caller's own session must prove the `admin` role (read from
 *     admin_users through RLS — a user can only ever see their own claim), and
 *  2. the write itself goes through the service role, because the client —
 *     even an "admin" client — has no write policy on app_settings at all.
 *
 * So there is no path where a non-admin, or a tampered frontend, can flip
 * maintenance mode, disable registrations, or change retention.
 */
async function assertAdmin() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!data) return null;
  return user;
}

export async function claimFirstAdmin(): Promise<ActionResult<{ claimed: boolean }>> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('claim_admin_if_none_exists');
  if (error) return fail(error.message);
  await log.info('admin_bootstrap_claimed', 'first admin claim attempted', { claimed: Boolean(data) }, user.id);
  revalidatePath('/admin');
  return ok({ claimed: Boolean(data) });
}

export async function updateAdminSetting(input: unknown): Promise<ActionResult> {
  const admin = await assertAdmin();
  if (!admin) return fail('Admins only.');

  const parsed = adminSettingSchema.safeParse(input);
  if (!parsed.success) return fail('That setting value is not allowed.');

  const service = createServiceClient();
  if (!service) return fail('Server is missing SUPABASE_SERVICE_ROLE_KEY — admin writes are disabled.');

  const { error } = await service
    .from('app_settings')
    .upsert({
      key: parsed.data.key,
      value: parsed.data.value,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    });

  if (error) return fail(error.message);

  await service.from('admin_audit_log').insert({
    actor_id: admin.id,
    action: `setting:${parsed.data.key}`,
    payload: { value: parsed.data.value },
  });
  await log.info('admin_setting_updated', `setting ${parsed.data.key} changed`, { value: parsed.data.value }, admin.id);

  revalidatePath('/admin');
  revalidatePath('/home');
  return okVoid();
}

export async function updateAnnouncement(input: unknown): Promise<ActionResult> {
  const admin = await assertAdmin();
  if (!admin) return fail('Admins only.');

  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return fail('Check the announcement text.');

  const service = createServiceClient();
  if (!service) return fail('Server is missing SUPABASE_SERVICE_ROLE_KEY — admin writes are disabled.');

  const value = parsed.data.active
    ? { message: parsed.data.message, tone: parsed.data.tone, dismissible: parsed.data.dismissible }
    : null;

  const { error } = await service
    .from('app_settings')
    .upsert({ key: 'announcement_banner', value, updated_by: admin.id, updated_at: new Date().toISOString() });
  if (error) return fail(error.message);

  await service.from('admin_audit_log').insert({
    actor_id: admin.id,
    action: 'setting:announcement_banner',
    payload: value ?? {},
  });

  revalidatePath('/admin');
  revalidatePath('/home');
  return okVoid();
}

export async function runArchiveNow(): Promise<ActionResult<{ archived: number; notified: number; purged: number }>> {
  const admin = await assertAdmin();
  if (!admin) return fail('Admins only.');

  const service = createServiceClient();
  if (!service) return fail('Server is missing SUPABASE_SERVICE_ROLE_KEY.');

  const { data, error } = await service.rpc('archive_settled_records');
  if (error) return fail(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as
    | { archived_count: number; notice_count: number; purged_count: number }
    | undefined;

  await service.from('admin_audit_log').insert({
    actor_id: admin.id,
    action: 'retention:run_archive',
    payload: row ?? {},
  });
  await log.info('admin_archive_run', 'retention job triggered manually', { ...row }, admin.id);

  revalidatePath('/admin');
  return ok({
    archived: row?.archived_count ?? 0,
    notified: row?.notice_count ?? 0,
    purged: row?.purged_count ?? 0,
  });
}

export async function setAdminRole(input: { userId: string; grant: boolean }): Promise<ActionResult> {
  const admin = await assertAdmin();
  if (!admin) return fail('Admins only.');
  if (!input?.userId) return fail('Pick a person.');

  const service = createServiceClient();
  if (!service) return fail('Server is missing SUPABASE_SERVICE_ROLE_KEY.');

  if (input.grant) {
    const { error } = await service
      .from('admin_users')
      .upsert({ user_id: input.userId, granted_by: admin.id }, { onConflict: 'user_id' });
    if (error) return fail(error.message);
  } else {
    if (input.userId === admin.id) return fail('You cannot remove your own admin access.');
    const { error } = await service.from('admin_users').delete().eq('user_id', input.userId);
    if (error) return fail(error.message);
  }

  await service.from('admin_audit_log').insert({
    actor_id: admin.id,
    action: input.grant ? 'admin:grant' : 'admin:revoke',
    payload: { user_id: input.userId },
  });

  revalidatePath('/admin');
  return okVoid();
}
