'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, ShieldCheck, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PersonAvatar } from '@/components/person-avatar';
import { setAdminRole } from '@/lib/actions/admin';
import { searchPeople } from '@/lib/queries/social-actions';
import type { Person } from '@/lib/types';

/**
 * Granting admin is a server action that itself re-checks the caller's admin
 * claim before using the service role, and writes an audit row either way.
 * The client never touches `admin_users` directly.
 */
export function AdminRolePanel({ admins, currentUserId }: { admins: Person[]; currentUserId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const people = await searchPeople(trimmed, 8);
      setResults(people.filter((person) => !admins.some((admin) => admin.id === person.id)));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, admins]);

  function change(userId: string, makeAdmin: boolean, name: string) {
    startTransition(async () => {
      const result = await setAdminRole({ userId, grant: makeAdmin });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(makeAdmin ? `${name} is now an admin.` : `${name} is no longer an admin.`);
      setQuery('');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Admins
        </CardTitle>
        <CardDescription>
          Admins see aggregate numbers and operational logs — never anybody’s expenses. Keep the list short.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1">
          {admins.map((admin) => (
            <li key={admin.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
              <PersonAvatar person={admin} className="h-8 w-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {admin.full_name}
                  {admin.id === currentUserId && <span className="text-muted-foreground"> (you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">@{admin.username}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={pending}
                onClick={() => change(admin.id, false, admin.full_name.split(' ')[0])}
              >
                <UserMinus className="h-4 w-4" />
                <span className="sr-only">Remove admin role from {admin.full_name}</span>
              </Button>
            </li>
          ))}
        </ul>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Add an admin by name or @username"
            className="pl-9"
            aria-label="Find someone to make an admin"
          />
        </div>

        {results.length > 0 && (
          <ul className="space-y-1 rounded-xl border p-1">
            {results.map((person) => (
              <li key={person.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                <PersonAvatar person={person} className="h-7 w-7" />
                <span className="min-w-0 flex-1 truncate text-sm">{person.full_name}</span>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => change(person.id, true, person.full_name)}>
                  Make admin
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
