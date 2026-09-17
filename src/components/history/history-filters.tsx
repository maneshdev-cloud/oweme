'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { HistoryFilters } from '@/lib/types';

type Option = { id: string; label: string };

const STATUSES: Array<{ value: NonNullable<HistoryFilters['status']>; label: string }> = [
  { value: 'settled', label: 'Settled' },
  { value: 'pending', label: 'Pending' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const ALL = 'all';

/**
 * Filters live in the URL, not in component state: your search survives a
 * refresh, "back" works, and a link to "my February disputes" is shareable.
 */
export function HistoryFilters({
  friends,
  groups,
  initial,
}: {
  friends: Option[];
  groups: Option[];
  initial: HistoryFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initial.query ?? '');
  const firstRender = useRef(true);

  function apply(next: Partial<Record<string, string | undefined>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === ALL) params.delete(key);
      else params.set(key, value);
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  // Debounced free-text search: one navigation per pause, not per keystroke.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(() => apply({ q: query.trim() || undefined }), 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const hasFilters = Boolean(initial.query || initial.from || initial.to || initial.personId || initial.groupId || initial.status);

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Narrow it down
        </p>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('');
              router.replace(pathname, { scroll: false });
            }}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="What was it? e.g. printout"
          className="pl-9"
          aria-label="Search your history"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            type="date"
            value={initial.from?.slice(0, 10) ?? ''}
            onChange={(event) => apply({ from: event.target.value || undefined })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="date"
            value={initial.to?.slice(0, 10) ?? ''}
            onChange={(event) => apply({ to: event.target.value || undefined })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="person">Person</Label>
          <Select value={initial.personId ?? ALL} onValueChange={(value) => apply({ person: value })}>
            <SelectTrigger id="person" aria-label="Filter by person">
              <SelectValue placeholder="Anyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Anyone</SelectItem>
              {friends.map((friend) => (
                <SelectItem key={friend.id} value={friend.id}>
                  {friend.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select value={initial.status ?? ALL} onValueChange={(value) => apply({ status: value })}>
            <SelectTrigger id="status" aria-label="Filter by status">
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              {STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="group">Group</Label>
          <Select value={initial.groupId ?? ALL} onValueChange={(value) => apply({ group: value })}>
            <SelectTrigger id="group" aria-label="Filter by group">
              <SelectValue placeholder="Any group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any group</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
