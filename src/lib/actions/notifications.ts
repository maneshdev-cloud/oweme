'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { notificationPreferencesSchema } from '@/lib/validation';
import { fail, ok, okVoid, type ActionResult } from '@/lib/actions/types';

export async function markAllNotificationsRead(): Promise<ActionResult<{ cleared: number }>> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) return fail(error.message);
  revalidatePath('/notifications');
  return ok({ cleared: (data as number) ?? 0 });
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) return fail(error.message);
  revalidatePath('/notifications');
  return okVoid();
}

export async function dismissNotification(id: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) return fail(error.message);
  revalidatePath('/notifications');
  return okVoid();
}

export async function updateNotificationPreferences(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = notificationPreferencesSchema.safeParse(input);
  if (!parsed.success) return fail('Those settings are not valid.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: user.id,
      browser_push_enabled: parsed.data.browserPushEnabled,
      email_enabled: parsed.data.emailEnabled,
    });

  if (error) return fail(error.message);
  revalidatePath('/profile');
  return okVoid();
}
