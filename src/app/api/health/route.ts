import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Cheap liveness probe for uptime checks and the admin dashboard. */
export async function GET() {
  const started = Date.now();
  try {
    const supabase = await createClient();
    // A reachable PostgREST that answers with an error (bad key, paused project)
    // is just as unhealthy as a connection refusal — report both.
    const { error } = await supabase.rpc('healthcheck');
    if (error) {
      return NextResponse.json(
        { status: 'degraded', database: 'error', detail: error.message, time: new Date().toISOString() },
        { status: 503 },
      );
    }
    return NextResponse.json({
      status: 'ok',
      database: 'reachable',
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'unreachable' }, { status: 503 });
  }
}
