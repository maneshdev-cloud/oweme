'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PersonAvatar } from '@/components/person-avatar';
import { respondToFriendRequest } from '@/lib/actions/friends';
import { timeAgo } from '@/lib/utils';
import type { PendingRequest } from '@/lib/types';

export function FriendRequests({ requests }: { requests: PendingRequest[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function respond(friendshipId: string, response: 'accept' | 'decline' | 'cancel') {
    startTransition(async () => {
      const result = await respondToFriendRequest({ friendshipId, response });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        response === 'accept'
          ? 'You’re connected — you can add expenses together now.'
          : response === 'decline'
            ? 'Request declined. Nothing is owed either way.'
            : 'Request withdrawn.',
      );
      router.refresh();
    });
  }

  return (
    <ul className="space-y-2">
      {requests.map((request) => (
        <li key={request.friendship_id} className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
          <PersonAvatar person={request.person} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{request.person.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {request.direction === 'incoming'
                ? `Wants to connect · ${timeAgo(request.created_at)}`
                : `Waiting for them to accept · ${timeAgo(request.created_at)}`}
            </p>
          </div>
          {request.direction === 'incoming' ? (
            <div className="flex gap-1.5">
              <Button size="sm" variant="positive" loading={pending} onClick={() => respond(request.friendship_id, 'accept')}>
                <Check className="h-4 w-4" /> Accept
              </Button>
              <Button size="sm" variant="ghost" loading={pending} onClick={() => respond(request.friendship_id, 'decline')}>
                <X className="h-4 w-4" />
                <span className="sr-only">Decline</span>
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" loading={pending} onClick={() => respond(request.friendship_id, 'cancel')}>
              Cancel
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
