'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { removeFriend } from '@/lib/actions/friends';

export function RemoveFriendButton({
  friendshipId,
  friendName,
}: {
  friendshipId: string;
  friendName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await removeFriend({ friendshipId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        friendName
          ? `${friendName} was removed. Existing history is unchanged.`
          : 'Friend removed. Existing history is unchanged.'
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5"
          title={friendName ? `Remove ${friendName}` : 'Remove friend'}
        >
          <UserMinus className="h-4 w-4" />
          <span className="hidden sm:inline">Remove friend</span>
          <span className="sr-only sm:hidden">Remove friend</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {friendName ? `Remove ${friendName}?` : 'Remove friend?'}
          </DialogTitle>
          <DialogDescription className="text-left pt-2 text-sm text-muted-foreground">
            Existing expense history stays safe and intact, but {friendName || 'this person'} will be removed from your friends list and won’t appear in new splits.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" loading={pending} onClick={remove}>
            Remove friend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}