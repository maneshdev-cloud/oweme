'use client';

import { useState, useTransition } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
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
import { deleteGroup } from '@/lib/actions/groups';
import type { GroupMemberRow } from '@/lib/types';

export function DeleteGroupDialog({
  groupId,
  groupName,
  members,
  trigger,
}: {
  groupId: string;
  groupName: string;
  members: GroupMemberRow[];
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const unsettledMembers = members.filter((m) => Math.abs(m.net) > 0.001);
  const hasUnsettled = unsettledMembers.length > 0;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteGroup({ groupId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Group "${groupName}" was deleted.`);
      setOpen(false);
      window.location.href = '/groups';
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
          >
            <Trash2 className="h-4 w-4" />
            Delete group
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Delete group
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 pt-2 text-left text-sm text-muted-foreground">
              {hasUnsettled ? (
                <div className="text-foreground">
                  <span className="font-medium text-destructive">Notice: This group has open unsettled balances.</span>{' '}
                  Deleting it will permanently delete all group expenses, settlements, and discard these remaining balances:
                  <ul className="mt-2 space-y-1 rounded-lg bg-muted p-2.5 text-xs text-foreground">
                    {unsettledMembers.map((m) => (
                      <li key={m.user_id} className="flex justify-between">
                        <span>{m.profile.full_name}</span>
                        <span className="font-semibold">{m.net > 0 ? `gets back ₹${m.net}` : `owes ₹${Math.abs(m.net)}`}</span>
                      </li>
                    ))}
                  </ul>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    This action cannot be undone. All history for this group will be wiped.
                  </span>
                </div>
              ) : (
                <p>
                  Are you sure you want to delete <strong className="text-foreground">{groupName}</strong>? All group
                  expenses, history, and member lists will be permanently deleted for all members. This action cannot be
                  undone.
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" loading={pending} onClick={handleDelete}>
            {hasUnsettled ? 'Delete group anyway' : 'Delete group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
