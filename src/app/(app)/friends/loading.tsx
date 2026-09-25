import { HeaderSkeleton, ListSkeleton } from '@/components/loading-states';

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <ListSkeleton rows={5} />
    </div>
  );
}
