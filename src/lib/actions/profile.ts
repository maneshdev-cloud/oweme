'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { profileSchema } from '@/lib/validation';
import { fail, okVoid, type ActionResult } from '@/lib/actions/types';

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Check your details', parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      username: parsed.data.username,
      avatar_url: parsed.data.avatarUrl ?? null,
    })
    .eq('id', user.id);

  if (error) {
    if (error.code === '23505') return fail('That username is taken — try another.');
    if (error.code === '23514') return fail('Usernames are 3–24 characters: a–z, 0–9 and _');
    return fail(error.message);
  }

  revalidatePath('/profile');
  revalidatePath('/home');
  return okVoid();
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { redirect } = await import('next/navigation');
  redirect('/login?signedOut=1');
}
