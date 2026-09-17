'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckboxRow } from '@/components/groups/checkbox-row';
import { createGroup } from '@/lib/actions/groups';
import { PersonAvatar } from '@/components/person-avatar';
import type { FriendRow } from '@/lib/types';

export function CreateGroupDialog({ friends, disabled }: { friends: FriendRow[]; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (name.trim().length < 2) {
      setError('Give the group a name — “CS Project”, “Goa Trip”, anything.');
      return;
    }
    setError(null);

    startTransition(async () => {
      const created = await createGroup({
        name: name.trim(),
        description: description.trim(),
        memberIds: selected,
      });
      if (!created.ok) {
        setError(created.error);
        return;
      }

      toast.success(`“${name.trim()}” is ready.`);
      setOpen(false);
      setName('');
      setDescription('');
      setSelected([]);
      router.refresh();
      router.push(`/groups/${created.data.id}`);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        <Plus className="h-4 w-4" /> New group
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start a group</DialogTitle>
            <DialogDescription>
              Trips, project teams, hostel floors. Add friends now or later — expenses always split exactly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Goa Trip 2026"
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-description">Note (optional)</Label>
            <Textarea
              id="group-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Train tickets, stays, food…"
              maxLength={300}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Add friends</Label>
            {friends.length === 0 ? (
              <p className="rounded-xl bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                You’ll be able to add people once you have friends on OweMe.
              </p>
            ) : (
              <ul className="max-h-52 space-y-1 overflow-y-auto pr-1">
                {friends.map((friend) => (
                  <li key={friend.friendship_id}>
                    <CheckboxRow
                      checked={selected.includes(friend.friend_id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked ? [...current, friend.friend_id] : current.filter((id) => id !== friend.friend_id),
                        )
                      }
                      label={
                        <span className="flex items-center gap-2">
                          <PersonAvatar
                            person={{
                              id: friend.friend_id,
                              full_name: friend.full_name,
                              username: friend.username,
                              avatar_url: friend.avatar_url,
                            }}
                            className="h-7 w-7"
                          />
                          <span className="text-sm">{friend.full_name}</span>
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              <UsersRound className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              You’ll be the owner.
            </p>
            <Button onClick={submit} loading={pending} disabled={pending}>
              Create group
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
