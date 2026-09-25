import { NextResponse } from 'next/server';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { getHistory, toCsv } from '@/lib/queries/history';
import { getAppSettings, isAdmin } from '@/lib/queries/core';
import { log } from '@/lib/logger';
import type { HistoryFilters } from '@/lib/types';

/**
 * "Download my history" — CSV or JSON, generated on the server from the user's
 * own session (RLS applies), and recorded in `user_exports`.
 *
 * What that record does — exactly, because it is easy to overstate: the purge
 * loop waits for the notice window and needs either everyone to have downloaded
 * since the notice, or twice the notice window to have passed. A download can
 * therefore bring a purge forward; it never holds one back, and it never
 * shortens the notice below the window the admin configured.
 *
 * PDF is deliberately not here: proper rendering needs compute that a free tier
 * does not pay for. See README → "Why CSV and JSON, not PDF".
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const settings = await getAppSettings();
  if (settings.maintenance_mode && !(await isAdmin())) {
    return NextResponse.json(
      { error: 'OWEME is currently under maintenance. Please try again after some time.' },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';

  const filters: HistoryFilters = {
    query: url.searchParams.get('q') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    personId: url.searchParams.get('person') ?? undefined,
    groupId: url.searchParams.get('group') ?? undefined,
    status: (url.searchParams.get('status') as HistoryFilters['status']) ?? undefined,
  };

  const history = await getHistory(filters);

  // Record the export *before* returning it: the file is not handed over until
  // the row the purge loop reads exists, so the two can never disagree.
  const supabase = await createClient();
  const { error: exportError } = await supabase.from('user_exports').insert({
    user_id: user.id,
    format,
    filters: filters as Record<string, unknown>,
    row_count: history.rows.length,
  });
  if (exportError) {
    await log.warn('history_export_record_failed', exportError.message, { format }, user.id);
  }

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    return new NextResponse(JSON.stringify(history, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="oweme-history-${stamp}.json"`,
        'cache-control': 'no-store',
      },
    });
  }

  return new NextResponse(toCsv(history), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="oweme-history-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
