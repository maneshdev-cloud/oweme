import { Skeleton } from '@/components/ui/skeleton';

export default function GroupDetailLoading() {
  return (
    <div className="space-y-6" aria-hidden>
      {/* Group header */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Balance card */}
      <Skeleton className="h-28 w-full rounded-2xl" />

      {/* Actions */}
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>

      {/* Expense list */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-36" />
        <div className="space-y-2.5">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
