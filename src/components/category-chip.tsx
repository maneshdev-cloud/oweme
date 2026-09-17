import { getCategoryIcon } from '@/lib/category-icons';
import { cn } from '@/lib/utils';

export function CategoryChip({ category, className }: { category: string; className?: string }) {
  const Icon = getCategoryIcon(category);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {category}
    </span>
  );
}
