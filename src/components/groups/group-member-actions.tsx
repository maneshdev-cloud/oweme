'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Crown,
  LogOut,
  MoreVertical,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserMinus,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { deleteGroup, removeGroupMember, updateGroupMemberRole } from '@/lib/actions/groups';
import type { GroupMemberRow, GroupRole } from '@/lib/types';

export function GroupMemberActions({
  groupId,
  groupName = 'group',
  member,
  isOwner,
  currentUserRole,
  isMe,
  memberCount = 1,
  hasOtherAdminOrOwner = false,
}: {
  groupId: string;
  groupName?: string;
  member: GroupMemberRow;
  isOwner?: boolean;
  currentUserRole?: GroupRole;
  isMe: boolean;
  memberCount?: number;
  hasOtherAdminOrOwner?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  const isAdminOrOwner =
    currentUserRole === 'owner' || currentUserRole === 'admin' || Boolean(isOwner);

  const firstName = member.profile.full_name.split(' ')[0];
  const isSoleMember = memberCount <= 1;
  const isLeader = member.role === 'owner' || member.role === 'admin';
  const cannotLeaveBecauseSoleLeader =
    isMe && !isSoleMember && isLeader && !hasOtherAdminOrOwner;

  function handleRoleChange(newRole: GroupRole) {
    startTransition(async () => {
      const result = await updateGroupMemberRole({
        groupId,
        userId: member.user_id,
        role: newRole,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (newRole === 'admin') {
        toast.success(`${firstName} is now an admin with full management access.`);
      } else if (newRole === 'owner') {
        toast.success(`${firstName} is now the group owner.`);
      } else {
        toast.success(`${firstName} is now a regular member.`);
      }
      router.refresh();
    });
  }

  function handleLeave() {
    startTransition(async () => {
      // If user is sole member, deleting the group is the intended action
      const result = isSoleMember
        ? await deleteGroup({ groupId })
        : await removeGroupMember({ groupId, userId: member.user_id });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(isSoleMember ? `Group "${groupName}" was deleted.` : 'You’ve left the group.');
      setLeaveDialogOpen(false);
      window.location.href = '/groups';
    });
  }

  function handleRemoveMember() {
    startTransition(async () => {
      const result = await removeGroupMember({ groupId, userId: member.user_id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${firstName} was removed from the group.`);
      setRemoveDialogOpen(false);
      router.refresh();
    });
  }

  // Current user's row actions (Leave or Leave & Delete)
  if (isMe) {
    return (
      <div className="flex items-center gap-1">
        <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              disabled={pending}
              title={
                isSoleMember
                  ? 'Leave & delete group'
                  : cannotLeaveBecauseSoleLeader
                    ? 'Make someone admin/owner before leaving'
                    : 'Leave this group'
              }
            >
              {isSoleMember ? <Trash2 className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
              <span className="sr-only">
                {isSoleMember ? 'Leave & delete group' : 'Leave group'}
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {isSoleMember ? 'Leave and delete this group?' : 'Leave this group?'}
              </DialogTitle>
              <DialogDescription className="space-y-2 pt-2 text-left">
                {isSoleMember ? (
                  member.net !== 0 ? (
                    <span className="block text-destructive">
                      You still have an open balance of ₹{Math.abs(member.net).toFixed(2)}. Please settle
                      it before deleting the group.
                    </span>
                  ) : (
                    <span className="block text-muted-foreground">
                      You are the only member left in <strong>{groupName}</strong>. Leaving will permanently
                      delete this group.
                    </span>
                  )
                ) : cannotLeaveBecauseSoleLeader ? (
                  <span className="block text-amber-600 dark:text-amber-400">
                    You are currently the only owner/admin of this group. Please promote another member to
                    admin or owner before leaving so the group remains managed.
                  </span>
                ) : member.net !== 0 ? (
                  <span className="block text-destructive">
                    You still have an open balance of ₹{Math.abs(member.net).toFixed(2)} in this group. You
                    must settle up first before leaving.
                  </span>
                ) : (
                  <span className="block text-muted-foreground">
                    Are you sure you want to leave <strong>{groupName}</strong>? Your past expense history is
                    preserved, but you will no longer be included in new group expenses.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>
                Cancel
              </Button>
              {!cannotLeaveBecauseSoleLeader && member.net === 0 && (
                <Button variant="destructive" loading={pending} onClick={handleLeave}>
                  {isSoleMember ? 'Delete group' : 'Leave group'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Actions on OTHER members (only visible to owner or admin)
  if (!isAdminOrOwner) return null;

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            disabled={pending}
            title={`Manage ${firstName}`}
          >
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Manage {firstName}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {/* Admin toggle */}
          {member.role === 'member' && (
            <DropdownMenuItem onClick={() => handleRoleChange('admin')}>
              <ShieldCheck className="mr-2 h-4 w-4 text-primary" />
              Make admin
            </DropdownMenuItem>
          )}

          {member.role === 'admin' && (
            <DropdownMenuItem onClick={() => handleRoleChange('member')}>
              <ShieldOff className="mr-2 h-4 w-4 text-muted-foreground" />
              Remove as admin
            </DropdownMenuItem>
          )}

          {/* Owner transfer */}
          {member.role !== 'owner' && (
            <DropdownMenuItem onClick={() => handleRoleChange('owner')}>
              <Crown className="mr-2 h-4 w-4 text-amber-500" />
              Make owner
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* Remove member */}
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onClick={() => setRemoveDialogOpen(true)}
          >
            <UserMinus className="mr-2 h-4 w-4" />
            Remove from group
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Remove Confirmation Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {firstName} from group?</DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-left">
              {member.net !== 0 ? (
                <span className="block text-destructive">
                  {firstName} still has an open balance of ₹{Math.abs(member.net).toFixed(2)} in this group.
                  All balances must be settled before removing this member.
                </span>
              ) : (
                <span className="block text-muted-foreground">
                  {firstName} will be removed from <strong>{groupName}</strong>. Past expense history will be
                  kept, but they will not participate in future group expenses.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
              Cancel
            </Button>
            {member.net === 0 && (
              <Button variant="destructive" loading={pending} onClick={handleRemoveMember}>
                Remove member
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
