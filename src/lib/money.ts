/**
 * Money helpers.
 *
 * Rule for the whole app: currency is never stored or added as a binary float.
 * The database keeps `numeric(14,2)`, and in TypeScript we convert to integer
 * minor units (paise) immediately, do all arithmetic on integers, and only
 * format back to a string at the edge.
 */

/** ₹1,25,000.50 — Indian digit grouping, via the platform's own ICU data. */
export function formatINR(minor: number, options: { withDecimals?: boolean } = {}): string {
  const withDecimals = options.withDecimals ?? true;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  }).format(toMajor(minor));
}

/** Compact form for chips and dense rows: ₹28, ₹1.2L */
export function formatINRCompact(minor: number): string {
  const major = Math.abs(toMajor(minor));
  const sign = minor < 0 ? '-' : '';
  if (major >= 10_000_000) return `${sign}₹${(major / 10_000_000).toFixed(2).replace(/\.00$/, '')}Cr`;
  if (major >= 100_000) return `${sign}₹${(major / 100_000).toFixed(2).replace(/\.00$/, '')}L`;
  if (major >= 1_000) return `${sign}₹${(major / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sign}₹${withDecimalsOnlyWhenNeeded(major)}`;
}

function withDecimalsOnlyWhenNeeded(major: number): string {
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

/**
 * "1250.5" / 1250.5 / "₹1,250.50" -> 125050 (paise).
 * Parses the *string* form for exactness instead of multiplying floats.
 */
export function toMinor(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const raw = typeof value === 'number' ? value.toFixed(2) : String(value).replace(/[₹,\s]/g, '');
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match) throw new Error(`Not a valid amount: ${value}`);
  const [, sign, whole = '0', fraction = ''] = match;
  const paise = `${fraction}00`.slice(0, 2);
  const minor = Number(whole || '0') * 100 + Number(paise || '0');
  return sign === '-' ? -minor : minor;
}

/** 125050 -> 1250.5 */
export function toMajor(minor: number): number {
  return minor / 100;
}

/** 125050 -> "1250.50" (what we send to Postgres for a numeric(14,2) column). */
export function toAmountString(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function sumMinor(values: number[]): number {
  return values.reduce((total, value) => total + Math.round(value), 0);
}

/** Remaining budget-ish helper used by the add-expense form. */
export function isPositiveAmount(minor: number): boolean {
  return Number.isFinite(minor) && minor > 0;
}

/** Parses whatever the user typed in an amount field, or null when unusable. */
export function parseAmountInput(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '').trim();
  if (!cleaned) return null;
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  try {
    return toMinor(cleaned);
  } catch {
    return null;
  }
}
