import { HandCoins } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Brand({
  className,
  compact = false,
  showBeta = true,
}: {
  className?: string;
  compact?: boolean;
  showBeta?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
        <HandCoins className="h-4 w-4" aria-hidden />
      </span>
      {!compact && (
        <span className="inline-flex items-center gap-2">
          <span className="text-lg">OweMe</span>
          {showBeta && (
            <span className="rounded-md bg-amber-500/10 dark:bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-xs">
              BETA
            </span>
          )}
        </span>
      )}
    </span>
  );
}
