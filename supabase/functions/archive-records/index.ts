// supabase/functions/archive-records/index.ts
//
// Optional scheduled caller for the retention job.
//
// The archival logic itself lives in the database (`archive_settled_records()`,
// migration 20260101090500_admin_retention.sql) and is normally driven by
// pg_cron at 03:15 with a purge pass at 03:45. This function exists for two
// cases where pg_cron is not available or not trusted:
//
//   • a Supabase project with pg_cron disabled or restricted, or
//   • an operator who would rather see the job run from an HTTP scheduler.
//
// Deploy:
//   supabase functions deploy archive-records --no-verify-jwt
//   supabase secrets set ARCHIVE_CRON_SECRET=$(openssl rand -hex 32)
//
// Schedule (Supabase dashboard → Edge Functions → Schedules, or any HTTP cron):
//   POST https://<project-ref>.supabase.co/functions/v1/archive-records
//   Header: x-cron-secret: <ARCHIVE_CRON_SECRET>
//
// Security: `--no-verify-jwt` is required because the scheduler is not a signed-in
// user, so the shared secret below is what authorises the call. The function
// uses the service role key (injected by the platform) only after that check,
// and the SQL function it calls makes its own decisions about what may be
// archived — an open, pending or disputed record is never touched.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('ARCHIVE_CRON_SECRET');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function secretMatches(request: Request): boolean {
  if (!CRON_SECRET) return false;

  const presented = request.headers.get('x-cron-secret') ?? '';
  // Constant-time-ish comparison: never early-exit on the first difference.
  if (presented.length !== CRON_SECRET.length) return false;
  let mismatch = 0;
  for (let index = 0; index < CRON_SECRET.length; index += 1) {
    mismatch |= presented.charCodeAt(index) ^ CRON_SECRET.charCodeAt(index);
  }
  return mismatch === 0;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json({ error: 'Use POST — this is a job trigger, not a health check.' }, 405);
  }

  if (!secretMatches(request)) {
    // Deliberately vague: no hints about whether the secret is set or wrong.
    return json({ error: 'Not authorised.' }, 401);
  }

  if (!CRON_SECRET) {
    return json({ error: 'ARCHIVE_CRON_SECRET is not configured on this function.' }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = new Date().toISOString();

  // One call archives anything past its retention window, tells both people,
  // and purges only records that are past the notice window *and* where an
  // export opportunity has already been recorded.
  const { data, error } = await supabase.rpc('archive_settled_records');

  if (error) {
    // Log a sanitised line — never the secret, never user data.
    await supabase.from('server_logs').insert({
      level: 'error',
      event: 'archive_edge_function_failed',
      message: error.message,
      context: { source: 'edge-function', startedAt },
    });
    return json({ ok: false, error: error.message }, 500);
  }

  const row = (data ?? [])[0] as
    | { archived_count?: number; notice_count?: number; purged_count?: number }
    | undefined;

  const result = {
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    archived: row?.archived_count ?? 0,
    notified: row?.notice_count ?? 0,
    purged: row?.purged_count ?? 0,
  };

  await supabase.from('server_logs').insert({
    level: 'info',
    event: 'archive_edge_function_ran',
    message: `archived ${result.archived}, purged ${result.purged}`,
    context: result,
  });

  return json(result);
});
