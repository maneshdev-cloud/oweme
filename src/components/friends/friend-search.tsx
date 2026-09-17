'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonAvatar } from '@/components/person-avatar';
import { searchPeople } from '@/lib/queries/social-actions';
import { sendFriendRequest } from '@/lib/actions/friends';
import type { Person, SearchResult } from '@/lib/types';

/**
 * Debounced people search. Typing is throttled to one request per 250ms, and
 * the database only ever returns public fields (name, @username, avatar).
 */
export function FriendSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState<Record<string, 'pending' | 'accepted'>>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const found = await searchPeople(trimmed, 15);
      setResults(found as unknown as SearchResult[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function add(person: Person) {
    startTransition(async () => {
      const result = await sendFriendRequest({ addresseeId: person.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRequested((current) => ({ ...current, [person.id]: 'pending' }));
      toast.success(`Request sent to ${person.full_name.split(' ')[0]}.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find by name or username"
          className="pl-9"
          aria-label="Search for people"
          autoComplete="off"
        />
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        Search normally by name or username. Usernames use lowercase letters, numbers and underscores only — no spaces
        or special characters.
      </p>

      {query.trim().length >= 2 && (
        <div className="space-y-2">
          {loading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : results.length === 0 ? (
            <p className="rounded-xl bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
              Nobody matched “{query.trim()}”. Ask them for their exact @username.
            </p>
          ) : (
            <ul className="space-y-2">
              {results.map((person) => {
                const state = requested[person.id] ?? (person.friendship_status === 'accepted' ? 'accepted' : null);
                const outgoing = person.request_direction === 'outgoing';
                return (
                  <li key={person.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                    <PersonAvatar person={person} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{person.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{person.username}</p>
                    </div>
                    {state === 'accepted' || person.friendship_status === 'accepted' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Check className="h-3.5 w-3.5" aria-hidden /> Friends
                      </span>
                    ) : state === 'pending' || outgoing ? (
                      <span className="text-xs text-muted-foreground">Request sent</span>
                    ) : person.request_direction === 'incoming' ? (
                      <Button size="sm" variant="outline" onClick={() => add(person)} loading={pending}>
                        Accept
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => add(person)} loading={pending}>
                        <UserPlus className="h-4 w-4" /> Add
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
