'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { groupMemberSchema, groupRoleSchema, deleteGroupSchema, groupSchema } from '@/lib/validation';
import { fail, ok, okVoid, type ActionResult } from '@/lib/actions/types';

export async function createGroup(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Give the group a name', parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const groupId = crypto.randomUUID();
  const { error } = await supabase
    .from('groups')
    .insert({
      id: groupId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      created_by: user.id,
    });

  if (error) return fail(error.message);

  if (parsed.data.memberIds && parsed.data.memberIds.length > 0) {
    const memberRows = parsed.data.memberIds
      .filter((id) => id !== user.id)
      .map((userId) => ({ group_id: groupId, user_id: userId }));
    if (memberRows.length > 0) {
      await supabase.from('group_members').insert(memberRows);
    }
  }

  revalidatePath('/groups');
  revalidatePath(`/groups/${groupId}`);
  return ok({ id: groupId });
}

/** Members must already be accepted friends — enforced by a database trigger. */
export async function addGroupMember(input: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = groupMemberSchema.safeParse(input);
  if (!parsed.success) return fail('Pick someone to add.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: parsed.data.groupId, user_id: parsed.data.userId });

  if (error) {
    if (error.code === '23505') return fail('They are already in this group.');
    return fail(error.message);
  }

  revalidatePath(`/groups/${parsed.data.groupId}`);
  return okVoid();
}

/**
 * Update member role: 'owner', 'admin', or 'member'.
 * Both owner and admin have full access to manage members and group settings.
 */
export async function updateGroupMemberRole(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = groupRoleSchema.safeParse(input);
  if (!parsed.success) return fail('Invalid role or member.');

  const supabase = await createClient();

  // Check caller role in this group
  const { data: callerMember } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', parsed.data.groupId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerMember || (callerMember.role !== 'owner' && callerMember.role !== 'admin')) {
    return fail('Only a group owner or admin can manage member roles.');
  }

  // If changing someone from owner/admin to member, ensure there's at least one other owner/admin
  if (parsed.data.role === 'member') {
    const { data: ownersAndAdmins } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', parsed.data.groupId)
      .in('role', ['owner', 'admin'])
      .neq('user_id', parsed.data.userId);

    if (!ownersAndAdmins || ownersAndAdmins.length === 0) {
      return fail('The group must have at least one owner or admin.');
    }
  }

  const { error } = await supabase
    .from('group_members')
    .update({ role: parsed.data.role })
    .eq('group_id', parsed.data.groupId)
    .eq('user_id', parsed.data.userId);

  if (error) return fail(error.message);
  revalidatePath(`/groups/${parsed.data.groupId}`);
  revalidatePath('/groups');
  return okVoid();
}

/**
 * Delete an entire group. Allowed for group owners and admins when all balances are settled.
 */
export async function deleteGroup(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = deleteGroupSchema.safeParse(input);
  if (!parsed.success) return fail('Invalid group.');

  const supabase = await createClient();

  // Check caller role
  const { data: callerMember } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', parsed.data.groupId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerMember || (callerMember.role !== 'owner' && callerMember.role !== 'admin')) {
    return fail('Only a group owner or admin can delete this group.');
  }

  // Check open balances
  const { data: balances } = await supabase.rpc('group_balances_for', { p_group: parsed.data.groupId });
  if (balances && Array.isArray(balances)) {
    const hasUnsettled = balances.some((b: { net?: number }) => Math.abs(Number(b.net || 0)) > 0.001);
    if (hasUnsettled) {
      return fail('All group balances must be settled before deleting the group.');
    }
  }

  // Attempt RPC first, fall back to cascading delete
  const { error: rpcErr } = await supabase.rpc('delete_group', { p_group_id: parsed.data.groupId });
  if (rpcErr) {
    await supabase.from('settlements').delete().eq('group_id', parsed.data.groupId);
    await supabase.from('group_expenses').delete().eq('group_id', parsed.data.groupId);
    // Delete group first while caller is still in group_members for RLS evaluation
    const { error: directErr } = await supabase.from('groups').delete().eq('id', parsed.data.groupId);
    if (directErr) {
      await supabase.from('group_members').delete().eq('group_id', parsed.data.groupId);
      const { error: retryErr } = await supabase.from('groups').delete().eq('id', parsed.data.groupId);
      if (retryErr) return fail(retryErr.message);
    } else {
      await supabase.from('group_members').delete().eq('group_id', parsed.data.groupId);
    }
  }

  revalidatePath('/groups');
  revalidatePath(`/groups/${parsed.data.groupId}`);
  revalidatePath('/home');
  revalidatePath('/', 'layout');
  return okVoid();
}

/**
 * Leaving (or removing somebody) is guarded in the database: you cannot walk out on an
 * open balance, and an owner/admin has to hand the group over if other members exist.
 */
export async function removeGroupMember(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = groupMemberSchema.safeParse(input);
  if (!parsed.success) return fail('That is not a valid member.');

  const supabase = await createClient();

  // Check how many members are in the group
  const { data: allMembers } = await supabase
    .from('group_members')
    .select('user_id, role')
    .eq('group_id', parsed.data.groupId);

  const isMe = parsed.data.userId === user.id;

  // If caller is removing someone else, caller must be owner or admin
  if (!isMe) {
    const caller = allMembers?.find((m) => m.user_id === user.id);
    if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
      return fail('Only group owners or admins can remove members.');
    }
  }

  // If this is the last member in the group, leaving deletes the group
  if (!allMembers || allMembers.length <= 1) {
    return deleteGroup({ groupId: parsed.data.groupId });
  }

  // If leaving user is owner or admin, check if another owner or admin exists
  if (isMe) {
    const myMember = allMembers.find((m) => m.user_id === user.id);
    if (myMember && (myMember.role === 'owner' || myMember.role === 'admin')) {
      const otherLeaders = allMembers.filter(
        (m) => m.user_id !== user.id && (m.role === 'owner' || m.role === 'admin')
      );
      if (otherLeaders.length === 0) {
        return fail('Make another member admin or owner before you leave.');
      }
    }
  }

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', parsed.data.groupId)
    .eq('user_id', parsed.data.userId);

  if (error) return fail(error.message);

  revalidatePath(`/groups/${parsed.data.groupId}`);
  revalidatePath('/groups');
  return okVoid();
}

/** Hand the group over — shortcut for updateGroupMemberRole */
export async function transferOwnership(input: unknown): Promise<ActionResult> {
  return updateGroupMemberRole({ ...(input as object), role: 'owner' });
}
