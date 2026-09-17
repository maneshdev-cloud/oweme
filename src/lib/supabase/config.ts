const PLACEHOLDER_URL = 'https://placeholder.supabase.co';

function required(
  value: string | undefined,
  name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
): string {
  const normalized = value?.trim();
  if (!normalized || normalized === 'your-anon-key' || normalized === PLACEHOLDER_URL) {
    throw new Error(`Missing Supabase configuration: set ${name} in .env.local.`);
  }
  return normalized;
}

export function getSupabaseConfig() {
  // Keep these direct references: Next.js injects NEXT_PUBLIC_* variables into
  // browser bundles only when the property access is statically analyzable.
  const url = required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = required(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      throw new Error('Supabase URL must use HTTPS outside localhost.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Supabase URL')) throw error;
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL.');
  }

  return { url, anonKey };
}

/** OAuth destinations must remain on this app's origin. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/home';
  return value;
}