import { Skeleton } from '@/components/ui/skeleton';

export default function ExpenseDetailLoading() {
  return (
    <div className="space-y-5" aria-hidden>
      <Skeleton className="h-5 w-16" />

      {/* Main expense card skeleton */}
      <div className="rounded-2xl border bg-card p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>

        {/* Amount banner */}
        <Skeleton className="h-20 w-full rounded-2xl" />

        {/* Participants */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>

        {/* Action button */}
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>

      {/* Timeline skeleton */}
      <div className="space-y-3 pt-2">
        <Skeleton className="h-5 w-32" />
        <div className="space-y-3 pl-4">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
