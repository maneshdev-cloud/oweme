import { ArrowDownLeft, ArrowUpRight, Minus } from 'lucide-react';
import { formatINR } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Canonical Balance & Direction Convention across all of OweMe:
 *   positive -> "To receive" from friend (Green + Incoming arrow: ArrowDownLeft ↙)
 *   negative -> "To give" to friend       (Red + Outgoing arrow: ArrowUpRight ↗)
 *   zero     -> "All square"              (Neutral muted + Minus / Check)
 */
export type BalanceDirection = 'to_receive' | 'to_give' | 'settled';

export function getBalanceDirection(minor: number): BalanceDirection {
  if (minor > 0) return 'to_receive';
  if (minor < 0) return 'to_give';
  return 'settled';
}

export function Amount({
  minor,
  tone,
  className,
  showSign = false,
}: {
  minor: number;
  tone?: 'auto' | 'neutral' | 'positive' | 'negative';
  className?: string;
  showSign?: boolean;
}) {
  const resolved = tone ?? 'auto';
  const isPositive = minor > 0;
  const isNegative = minor < 0;

  const toneClass =
    resolved === 'positive'
      ? 'text-positive'
      : resolved === 'negative'
        ? 'text-negative'
        : resolved === 'neutral'
          ? 'text-foreground'
          : isPositive
            ? 'text-positive'
            : isNegative
              ? 'text-negative'
              : 'text-muted-foreground';

  // Canonical: To receive = green + incoming arrow (ArrowDownLeft). To give = red + outgoing arrow (ArrowUpRight).
  const Icon = resolved === 'neutral' ? Minus : isPositive ? ArrowDownLeft : isNegative ? ArrowUpRight : Minus;

  return (
    <span className={cn('inline-flex items-center gap-1 tabular font-semibold', toneClass, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>
        {showSign && (isPositive || isNegative) ? (isPositive ? '+' : '−') : ''}
        {formatINR(Math.abs(minor))}
      </span>
    </span>
  );
}

export function BalanceLabel({ minor }: { minor: number }) {
  if (minor === 0) return <span className="text-sm text-muted-foreground">You&apos;re all square</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{minor > 0 ? 'To receive' : 'To give'}</span>
      <Amount minor={minor} />
    </span>
  );
}

export function BalanceDirectionBadge({
  minor,
  className,
  showAmount = false,
}: {
  minor: number;
  className?: string;
  showAmount?: boolean;
}) {
  const direction = getBalanceDirection(minor);
  if (direction === 'settled') {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground', className)}>
        <Minus className="h-3 w-3" aria-hidden /> All square
      </span>
    );
  }

  const isReceive = direction === 'to_receive';
  const Icon = isReceive ? ArrowDownLeft : ArrowUpRight;
  const label = isReceive ? 'To receive' : 'To give';
  const toneClass = isReceive ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative';

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', toneClass, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      <span>{label}</span>
      {showAmount && <span className="ml-0.5 font-bold tabular">{formatINR(Math.abs(minor))}</span>}
    </span>
  );
}
