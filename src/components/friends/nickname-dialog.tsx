'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Info, Tag } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setFriendNickname } from '@/lib/actions/friends';
import type { FriendRow } from '@/lib/types';

export function FriendNicknameDialog({ friend }: { friend: FriendRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState(friend.nickname ?? '');
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await setFriendNickname({
        friendId: friend.friend_id,
        nickname: nickname.trim() || null,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(nickname.trim() ? 'Private nickname saved.' : 'Nickname removed.');
      setOpen(false);
      router.refresh();
    });
  }

  function handleClear() {
    startTransition(async () => {
      const result = await setFriendNickname({
        friendId: friend.friend_id,
        nickname: null,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setNickname('');
      toast.success('Nickname removed.');
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
          className="text-muted-foreground hover:text-foreground"
          aria-label={friend.nickname ? `Edit nickname for ${friend.full_name}` : `Set nickname for ${friend.full_name}`}
        >
          <Tag className="h-4 w-4" />
          <span className="hidden xl:inline">{friend.nickname ? 'Nickname' : 'Add label'}</span>
          <span className="sr-only xl:hidden">Nickname</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Bookmark className="h-4 w-4 text-primary" aria-hidden />
              Private Nickname for {friend.full_name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Only you can see this nickname. It will never be shared with {friend.full_name} or anyone else.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground flex items-start gap-2.5">
            <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden />
            <div>
              <strong className="text-foreground block mb-0.5">Stay protected against name changes</strong>
              Set a private nickname (e.g. &ldquo;College Roommate&rdquo;) so even if this person changes their profile name or handle later, you will always recognize who they are.
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`nickname-${friend.friend_id}`} className="text-xs font-medium">
              Nickname or Note
            </Label>
            <Input
              id={`nickname-${friend.friend_id}`}
              placeholder="e.g. College Roommate, Office Buddy"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={60}
              autoFocus
            />
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-2 pt-2 sm:justify-between">
            {friend.nickname ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={pending}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Clear
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending} loading={pending}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
