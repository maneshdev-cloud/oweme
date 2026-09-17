import { ArrowDownLeft, ArrowUpRight, Minus } from 'lucide-react';
import { formatINR } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Money always reads the same way:
 *   positive -> "you're owed" (green + up arrow)
 *   negative -> "you owe"     (red + down arrow)
 * Icons carry the meaning; colour is only reinforcement, so the UI still works
 * for anybody who cannot separate red from green.
 */
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

  const Icon = resolved === 'neutral' ? Minus : isNegative ? ArrowDownLeft : isPositive ? ArrowUpRight : Minus;

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
