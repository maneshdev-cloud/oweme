import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { sanitise } from '@/lib/logger';

/**
 * Structured client-side error reports. Kept deliberately dumb: the payload is
 * sanitised server-side, the user id comes from the session (never the body),
 * and a failure here never affects the user's action.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const service = createServiceClient();
  if (!service) return NextResponse.json({ ok: false }, { status: 202 });

  await service.from('server_logs').insert({
    level: 'error',
    event: String(body.event ?? 'client_error').slice(0, 80),
    message: String(body.message ?? 'unknown').slice(0, 500),
    context: sanitise((body.context as Record<string, unknown>) ?? {}),
    user_id: user.id,
  });

  return NextResponse.json({ ok: true });
}
