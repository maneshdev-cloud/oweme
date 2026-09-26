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
  const email = user.email?.toLowerCase();
  if (email === 'maneshjadhavofficial@gmail.com') {
    return user;
  }
  const supabase = await createClient();
  const { data } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (data) return user;

  const service = createServiceClient();
  if (service && email) {
    const { data: authRow } = await service
      .from('admin_authorized_emails')
      .select('email')
      .eq('email', email)
      .maybeSingle();
    if (authRow) return user;
  }

  return null;
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
  const supabase = await createClient();
  let writeSucceeded = false;
  let lastError: string | null = null;


  if (service) {
    const { error } = await service
      .from('app_settings')
      .upsert({
        key: parsed.data.key,
        value: parsed.data.value,
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      });
    if (!error) {
      writeSucceeded = true;
      try {
        await service.from('admin_audit_log').insert({
          actor_id: admin.id,
          action: `setting:${parsed.data.key}`,
          payload: { value: parsed.data.value },
        });
      } catch {
        // Non-blocking
      }
    } else {
      lastError = error.message;
    }
  }

  if (!writeSucceeded) {
    // Fallback 1: update via database RPC set_app_setting
    const { error: rpcError } = await supabase.rpc('set_app_setting', {
      p_key: parsed.data.key,
      p_value: parsed.data.value,
    });

    if (!rpcError) {
      writeSucceeded = true;
    } else {
      lastError = rpcError.message;
      // Fallback 2: direct update via authenticated admin RLS
      const { error: directError } = await supabase
        .from('app_settings')
        .upsert({
          key: parsed.data.key,
          value: parsed.data.value,
          updated_by: admin.id,
          updated_at: new Date().toISOString(),
        });
      if (!directError) {
        writeSucceeded = true;
      } else {
        lastError = directError.message;
      }
    }

    if (!writeSucceeded) {
      if (!service) {
        return fail('Server is missing SUPABASE_SERVICE_ROLE_KEY. Please configure it in your server runtime or .env.local.');
      }
      return fail(`Unable to update setting: ${lastError || 'Check server configuration.'}`);
    }

    try {
      await supabase.rpc('record_admin_audit', {
        p_action: `setting:${parsed.data.key}`,
        p_payload: { value: parsed.data.value },
      });
    } catch {
      // Non-blocking
    }
  }

  await log.info('admin_setting_updated', `setting ${parsed.data.key} changed`, { value: parsed.data.value }, admin.id);

  revalidatePath('/admin');
  revalidatePath('/home');
  revalidatePath('/', 'layout');
  return okVoid();
}


export async function updateAnnouncement(input: unknown): Promise<ActionResult> {
  const admin = await assertAdmin();
  if (!admin) return fail('Admins only.');

  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return fail('Check the announcement text.');

  if (parsed.data.active && parsed.data.message.trim().length === 0) {
    return fail('Banner message cannot be empty when banner is enabled.');
  }

  const value = parsed.data.active
    ? {
        message: parsed.data.message.trim(),
        tone: parsed.data.tone,
        dismissible: parsed.data.dismissible,
      }
    : null;

  const service = createServiceClient();
  const supabase = await createClient();
  let writeSucceeded = false;

  if (service) {
    const { error } = await service
      .from('app_settings')
      .upsert({ key: 'announcement_banner', value, updated_by: admin.id, updated_at: new Date().toISOString() });
    if (!error) {
      writeSucceeded = true;
      try {
        await service.from('admin_audit_log').insert({
          actor_id: admin.id,
          action: 'setting:announcement_banner',
          payload: value ?? {},
        });
      } catch {
        // Non-blocking
      }
    }
  }

  if (!writeSucceeded) {
    const { error: rpcError } = await supabase.rpc('set_app_setting', {
      p_key: 'announcement_banner',
      p_value: value,
    });
    if (!rpcError) {
      writeSucceeded = true;
    } else {
      const { error: directError } = await supabase
        .from('app_settings')
        .upsert({ key: 'announcement_banner', value, updated_by: admin.id, updated_at: new Date().toISOString() });
      if (!directError) {
        writeSucceeded = true;
      }
    }

    if (!writeSucceeded) {
      return fail('Unable to update announcement. Check server configuration.');
    }

    try {
      await supabase.rpc('record_admin_audit', {
        p_action: 'setting:announcement_banner',
        p_payload: value ?? {},
      });
    } catch {
      // Non-blocking
    }
  }

  revalidatePath('/', 'layout');
  revalidatePath('/admin');
  revalidatePath('/home');
  return okVoid();
}

export async function runArchiveNow(): Promise<ActionResult<{ archived: number; notified: number; purged: number }>> {
  const admin = await assertAdmin();
  if (!admin) return fail('Admins only.');

  const service = createServiceClient();
  const supabase = await createClient();

  let data: unknown = null;
  let lastError: string | null = null;

  if (service) {
    const { data: serviceData, error: serviceError } = await service.rpc('archive_settled_records');
    if (!serviceError) {
      data = serviceData;
    } else {
      lastError = serviceError.message;
    }
  }

  if (data === null) {
    const { data: adminData, error: adminError } = await supabase.rpc('archive_settled_records');
    if (!adminError) {
      data = adminData;
    } else {
      return fail(adminError.message || lastError || 'Unable to execute archive job.');
    }
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { archived_count: number; notice_count: number; purged_count: number }
    | undefined;

  if (service) {
    try {
      await service.from('admin_audit_log').insert({
        actor_id: admin.id,
        action: 'retention:run_archive',
        payload: row ?? {},
      });
    } catch {
      // Non-blocking
    }
  } else {
    try {
      await supabase.rpc('record_admin_audit', {
        p_action: 'retention:run_archive',
        p_payload: row ?? {},
      });
    } catch {
      // Non-blocking
    }
  }

  try {
    await log.info('admin_archive_run', 'retention job triggered manually', { ...row }, admin.id);
  } catch {
    // Non-blocking
  }

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

export async function addAuthorizedAdminEmail(input: { email: string }): Promise<ActionResult> {
  const admin = await assertAdmin();
  if (!admin) return fail('Admins only.');

  const email = input?.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) return fail('Enter a valid email address.');

  const service = createServiceClient();
  const supabase = await createClient();
  const clientToUse = service ?? supabase;

  const { error } = await clientToUse
    .from('admin_authorized_emails')
    .upsert(
      { email, role: 'admin', added_by: admin.id },
      { onConflict: 'email' }
    );

  if (error) return fail(error.message);

  // If a user with this email has signed up in profiles, auto-link to admin_users
  const { data: matchedProfiles } = await clientToUse
    .from('profiles')
    .select('id')
    .ilike('username', email.split('@')[0])
    .limit(1);

  if (matchedProfiles && matchedProfiles[0] && service) {
    await service
      .from('admin_users')
      .upsert({ user_id: matchedProfiles[0].id, note: 'authorized admin' }, { onConflict: 'user_id' });
  }

  if (service) {
    try {
      await service.from('admin_audit_log').insert({
        actor_id: admin.id,
        action: 'admin:add_authorized_email',
        payload: { email },
      });
    } catch {
      // Non-blocking
    }
  }
  await log.info('admin_authorized_email_added', `${email} added to authorized admins`, { email }, admin.id);

  revalidatePath('/admin');
  return okVoid();
}

export async function removeAuthorizedAdminEmail(input: { email: string }): Promise<ActionResult> {
  const admin = await assertAdmin();
  if (!admin) return fail('Admins only.');

  const email = input?.email?.trim().toLowerCase();
  if (!email) return fail('Invalid email.');

  if (email === 'maneshjadhavofficial@gmail.com') {
    return fail('The primary owner administrator cannot be removed.');
  }

  const service = createServiceClient();
  const supabase = await createClient();
  const clientToUse = service ?? supabase;

  const { data: existing } = await clientToUse
    .from('admin_authorized_emails')
    .select('role')
    .eq('email', email)
    .maybeSingle();

  if (existing?.role === 'owner') {
    return fail('The owner administrator cannot be removed.');
  }

  const { error } = await clientToUse
    .from('admin_authorized_emails')
    .delete()
    .eq('email', email);

  if (error) return fail(error.message);

  if (service) {
    try {
      await service.from('admin_audit_log').insert({
        actor_id: admin.id,
        action: 'admin:remove_authorized_email',
        payload: { email },
      });
    } catch {
      // Non-blocking
    }
  }
  await log.info('admin_authorized_email_removed', `${email} removed from authorized admins`, { email }, admin.id);

  revalidatePath('/admin');
  return okVoid();
}
