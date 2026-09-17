import { HandCoins } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground">
        <HandCoins className="h-4 w-4" aria-hidden />
      </span>
      {!compact && <span className="text-lg">OweMe</span>}
    </span>
  );
}
