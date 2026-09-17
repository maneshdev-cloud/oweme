import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await log.info('user_signed_out', 'User signed out', {}, user.id);
  }

  await supabase.auth.signOut();

  return NextResponse.redirect(new URL('/login?signedOut=1', url.origin), {
    status: 303,
  });
}
