'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowUpRight, Check, CloudOff, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonAvatar } from '@/components/person-avatar';
import { createExpense } from '@/lib/actions/expenses';
import { CATEGORIES } from '@/lib/constants';
import { getCategoryIcon } from '@/lib/category-icons';
import { formatINR, parseAmountInput, sanitizeAmountInput, toAmountString, toMinor } from '@/lib/money';
import { searchPeople } from '@/lib/queries/social-actions';
import { cn } from '@/lib/utils';
import type { FriendRow, Person } from '@/lib/types';

type Step = 'friend' | 'details';

/**
 * Add an expense in well under ten seconds: pick the friend, bang in the
 * amount, tap a category chip, say who paid, done.
 *
 * Two deliberate behaviours:
 *  - the idempotency key is minted once per draft, so a double tap (or a retry
 *    after a dropped connection) can never create two expenses;
 *  - submitting while offline is refused up front, because there is no
 *    conflict resolution in V1 and we will not pretend a write succeeded.
 */
export function AddExpenseDialog({
  open,
  onOpenChange,
  friends,
  initialFriendId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friends: FriendRow[];
  initialFriendId?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialFriendId ? 'details' : 'friend');
  const [selected, setSelected] = useState<Person | null>(() => {
    const friend = friends.find((row) => row.friend_id === initialFriendId);
    return friend ? toPerson(friend) : null;
  });
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Printout');
  const [direction, setDirection] = useState<'i_paid' | 'they_paid'>('i_paid');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, startTransition] = useTransition();
  const requestId = useRef<string>(crypto.randomUUID());
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Reset the draft whenever the sheet is closed and reopened.
  useEffect(() => {
    if (!open) {
      setStep(initialFriendId ? 'details' : 'friend');
      setSelected(() => {
        const friend = friends.find((row) => row.friend_id === initialFriendId);
        return friend ? toPerson(friend) : null;
      });
      setAmount('');
      setDescription('');
      setCategory('Printout');
      setDirection('i_paid');
      setQuery('');
      setResults([]);
      setError(null);
      requestId.current = crypto.randomUUID();
    }
  }, [open, initialFriendId, friends]);

  // Debounced people search — only when the friend list itself has no match.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || !open || step !== 'friend') {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const handle = setTimeout(async () => {
      const found = await searchPeople(trimmed);
      setResults(found);
      setSearching(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open, step]);

  const filteredFriends = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return friends;
    return friends.filter(
      (friend) =>
        friend.full_name.toLowerCase().includes(trimmed) || friend.username.toLowerCase().includes(trimmed),
    );
  }, [friends, query]);

  const minor = parseAmountInput(amount);
  const isAmountValid = minor !== null && minor >= 10 && minor <= 500000;
  const canSubmit = Boolean(selected) && isAmountValid && description.trim().length > 0 && online;

  const amountWarning = useMemo(() => {
    if (!amount || minor === null) return null;
    if (minor < 10) return 'Minimum amount is ₹0.10';
    if (minor > 500000) return 'Maximum amount is ₹5,000';
    return null;
  }, [amount, minor]);

  function pickFriend(person: Person) {
    setSelected(person);
    setStep('details');
    setTimeout(() => amountRef.current?.focus(), 80);
  }

  function submit() {
    if (!selected) return;
    if (!online) {
      setError('You’re offline. Adding an expense needs a connection.');
      return;
    }
    if (minor === null || minor < 10 || minor > 500000) {
      setError('Enter an amount between ₹0.10 and ₹5,000.');
      return;
    }
    if (!description.trim()) {
      setError('What was it for? A word is enough.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await createExpense({
        friendId: selected.id,
        amount: toAmountString(minor),
        description: description.trim(),
        category,
        direction,
        clientRequestId: requestId.current,
      });

      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(
        result.data.duplicate
          ? 'That expense was already saved — opened the existing one.'
          : direction === 'i_paid'
            ? `Added · To receive ${formatINR(minor)}`
            : `Added · To give ${formatINR(minor)}`,
      );
      requestId.current = crypto.randomUUID();
      onOpenChange(false);
      router.push(`/expenses/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{step === 'friend' ? 'Who was it with?' : 'What was it for?'}</DialogTitle>
          <DialogDescription>
            {step === 'friend'
              ? 'Pick a friend — they’ll get a heads-up straight away.'
              : 'Amount, a word about it, and who paid. That’s the whole thing.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'friend' ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or @username"
                className="pl-9"
                aria-label="Search for a friend"
              />
            </div>

            {filteredFriends.length > 0 && (
              <div className="space-y-1">
                <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Friends</p>
                <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {filteredFriends.map((friend) => (
                    <li key={friend.friendship_id}>
                      <button
                        type="button"
                        onClick={() => pickFriend(toPerson(friend))}
                        className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <PersonAvatar person={toPerson(friend)} className="h-9 w-9" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{friend.full_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">@{friend.username}</span>
                        </span>
                        {friend.balance !== 0 && (
                          <span className="text-xs text-muted-foreground tabular">
                            {friend.balance > 0 ? 'to receive ' : 'to give '}
                            {formatINR(Math.abs(toMinor(friend.balance)))}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {query.trim().length >= 2 && (
              <div className="space-y-1">
                <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {searching ? 'Searching…' : 'Other people'}
                </p>
                {searching ? (
                  <div className="space-y-2 p-1">
                    <Skeleton className="h-11 w-full" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                ) : results.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    Nobody else matched. Add them as a friend first — expenses only work between friends, so nobody
                    can file one against a stranger.
                  </p>
                ) : (
                  <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {results.map((person) => (
                      <li key={person.id} className="flex items-center gap-3 rounded-xl px-2.5 py-2">
                        <PersonAvatar person={person} className="h-9 w-9" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{person.full_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">@{person.username}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">Not friends yet</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {friends.length === 0 && query.trim().length < 2 && (
              <p className="rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">
                You have no friends on OweMe yet. Head to the Friends tab and send a request — then you can add
                expenses together.
              </p>
            )}
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {selected && (
              <button
                type="button"
                onClick={() => setStep('friend')}
                className="flex w-full items-center gap-3 rounded-xl bg-secondary p-2.5 text-left"
              >
                <PersonAvatar person={selected} className="h-9 w-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{selected.full_name}</span>
                  <span className="block text-xs text-secondary-foreground">Tap to change who this is with</span>
                </span>
                <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
              </button>
            )}

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-medium text-muted-foreground">₹</span>
                <input
                  ref={amountRef}
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={7}
                  value={amount}
                  onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
                  onFocus={(e) => {
                    setTimeout(() => {
                      e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 100);
                  }}
                  placeholder="28"
                  aria-label="Amount in rupees"
                  className="w-full border-0 bg-transparent p-0 text-4xl font-semibold tabular outline-none placeholder:text-muted-foreground/40"
                />
              </div>
              {amountWarning && (
                <p className="text-xs font-medium text-destructive">{amountWarning}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-description">What was it?</Label>
              <Input
                id="expense-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onFocus={(e) => {
                  setTimeout(() => {
                    e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 100);
                }}
                placeholder="Printout"
                maxLength={200}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((entry) => {
                  const Icon = getCategoryIcon(entry.value);
                  return (
                    <button
                      key={entry.value}
                      type="button"
                      onClick={() => setCategory(entry.value)}
                      aria-pressed={category === entry.value}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        category === entry.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input hover:bg-accent',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {entry.value}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Who paid?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('i_paid')}
                  aria-pressed={direction === 'i_paid'}
                  className={cn(
                    'flex flex-col items-start rounded-xl border p-2.5 text-left text-sm font-medium transition-colors',
                    direction === 'i_paid' ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary' : 'border-input hover:bg-accent',
                  )}
                >
                  <span className="font-semibold">I paid {minor ? formatINR(minor) : ''}</span>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-positive">
                    <ArrowDownLeft className="h-3 w-3" /> To receive
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('they_paid')}
                  aria-pressed={direction === 'they_paid'}
                  className={cn(
                    'flex flex-col items-start rounded-xl border p-2.5 text-left text-sm font-medium transition-colors',
                    direction === 'they_paid'
                      ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                      : 'border-input hover:bg-accent',
                  )}
                >
                  <span className="font-semibold">{selected ? selected.full_name.split(' ')[0] : 'They'} paid {minor ? formatINR(minor) : ''}</span>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-negative">
                    <ArrowUpRight className="h-3 w-3" /> To give
                  </span>
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-negative/10 px-3 py-2 text-sm text-negative">
                {error}
              </p>
            )}

            {!online && (
              <p role="alert" className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                <CloudOff className="h-4 w-4" aria-hidden />
                You&apos;re offline — this will save as soon as you reconnect, and nothing is queued in the meantime.
              </p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground">
                {direction === 'i_paid'
                  ? `${selected ? selected.full_name.split(' ')[0] : 'They'} will get a notification to confirm later.`
                  : 'You’ll be able to mark it paid once you’ve squared up.'}
              </p>
              <Button type="submit" loading={pending} disabled={!canSubmit}>
                <Check className="h-4 w-4" /> Add expense
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function toPerson(friend: FriendRow): Person {
  return {
    id: friend.friend_id,
    full_name: friend.full_name,
    username: friend.username,
    avatar_url: friend.avatar_url,
  };
}
