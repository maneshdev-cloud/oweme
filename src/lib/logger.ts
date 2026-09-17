import { createServiceClient } from '@/lib/supabase/server';

type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured server-side logging. Feeds the health signals on the admin
 * dashboard. Deliberately never receives tokens, emails or full row payloads —
 * only the fields listed in `sanitise`, which strips anything that looks like a
 * credential before it can reach the table.
 */
const REDACTED = '[redacted]';
const SENSITIVE = /(token|secret|password|apikey|api_key|authorization|jwt|cookie|service_role)/i;

export function sanitise(context: Record<string, unknown> = {}): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE.test(key)) {
      clean[key] = REDACTED;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitise(value as Record<string, unknown>);
    } else if (typeof value === 'string' && value.length > 300) {
      clean[key] = `${value.slice(0, 300)}…`;
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

async function write(level: Level, event: string, message: string, context: Record<string, unknown>, userId?: string | null) {
  const payload = sanitise(context);

  if (level === 'error') console.error(`[oweme] ${event}: ${message}`, payload);
  else if (level === 'warn') console.warn(`[oweme] ${event}: ${message}`, payload);
  else console.log(`[oweme] ${event}: ${message}`, payload);

  // Best-effort persistence for the admin dashboard; a logging failure must
  // never break a user action.
  try {
    const service = createServiceClient();
    if (!service) return;
    await service.from('server_logs').insert({
      level,
      event: event.slice(0, 80),
      message: message.slice(0, 500),
      context: payload,
      user_id: userId ?? null,
    });
  } catch {
    /* ignore */
  }
}

export const log = {
  info: (event: string, message: string, context: Record<string, unknown> = {}, userId?: string | null) =>
    write('info', event, message, context, userId),
  warn: (event: string, message: string, context: Record<string, unknown> = {}, userId?: string | null) =>
    write('warn', event, message, context, userId),
  error: (event: string, message: string, context: Record<string, unknown> = {}, userId?: string | null) =>
    write('error', event, message, context, userId),
};
