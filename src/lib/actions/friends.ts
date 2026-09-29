'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { friendRequestSchema, friendResponseSchema } from '@/lib/validation';
import { fail, okVoid, type ActionResult } from '@/lib/actions/types';
import { sendPushNotificationToUser } from '@/lib/push/server';
import { assertMaintenanceAllowsWrites } from '@/lib/actions/maintenance';

/**
 * Friend requests. Duplicate requests (in either direction) are impossible:
 * the database keeps one live row per unordered pair, and the unique index
 * raises rather than silently creating a second row.
 */
const DUPLICATE_KEY = '23505';

export async function sendFriendRequest(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const maintenanceBlock = await assertMaintenanceAllowsWrites();
  if (maintenanceBlock) return maintenanceBlock;

  const parsed = friendRequestSchema.safeParse(input);
  if (!parsed.success) return fail('That is not a valid person.');

  const { addresseeId } = parsed.data;
  if (addresseeId === user.id) return fail('You cannot add yourself.');

  const supabase = await createClient();

  // Somebody may already have asked us — accept that instead of erroring.
  const { data: incoming } = await supabase
    .from('friendships')
    .select('id')
    .eq('status', 'pending')
    .eq('requester_id', addresseeId)
    .eq('addressee_id', user.id)
    .maybeSingle();

  if (incoming) {
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', incoming.id);
    if (error) return fail(error.message);
    revalidatePath('/friends');
    return okVoid();
  }

  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: addresseeId });

  if (error) {
    if (error.code === DUPLICATE_KEY) return fail('You have already sent them a request.');
    return fail(error.message);
  }

  const actorName = user.user_metadata?.full_name?.split(' ')[0] || 'Someone';
  void sendPushNotificationToUser(addresseeId, {
    type: 'friend_request',
    title: 'New friend request',
    body: `${actorName} sent you a friend request on OWEME.`,
    url: '/friends',
    tag: `friend-request-${user.id}`,
  }).catch(() => undefined);

  revalidatePath('/friends');
  return okVoid();
}

export async function respondToFriendRequest(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const maintenanceBlock = await assertMaintenanceAllowsWrites();
  if (maintenanceBlock) return maintenanceBlock;

  const parsed = friendResponseSchema.safeParse(input);
  if (!parsed.success) return fail('That request is no longer available.');

  const { friendshipId, response } = parsed.data;
  const status = response === 'accept' ? 'accepted' : response === 'decline' ? 'declined' : 'cancelled';

  const supabase = await createClient();

  const { data: current } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .eq('id', friendshipId)
    .maybeSingle();

  if (!current || current.status !== 'pending') {
    return fail('That request is no longer available.');
  }

  if (response === 'accept' || response === 'decline') {
    if (current.addressee_id !== user.id) {
      return fail('Only the person who received this friend request can respond to it.');
    }
  } else if (response === 'cancel') {
    if (current.requester_id !== user.id) {
      return fail('Only the person who sent this friend request can cancel it.');
    }
  }

  const { error } = await supabase
    .from('friendships')
    .update({ status })
    .eq('id', friendshipId)
    .eq(response === 'cancel' ? 'requester_id' : 'addressee_id', user.id);

  if (error) return fail(error.message);

  if (response === 'accept' && current.requester_id) {
    const actorName = user.user_metadata?.full_name?.split(' ')[0] || 'Friend';
    void sendPushNotificationToUser(current.requester_id, {
      type: 'friend_accepted',
      title: 'Friend request accepted',
      body: `${actorName} accepted your friend request on OWEME.`,
      url: '/friends',
      tag: `friend-accepted-${user.id}`,
    }).catch(() => undefined);
  }

  revalidatePath('/friends');
  revalidatePath('/home');
  return okVoid();
}

export async function removeFriend(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const maintenanceBlock = await assertMaintenanceAllowsWrites();
  if (maintenanceBlock) return maintenanceBlock;

  const parsed = friendResponseSchema.pick({ friendshipId: true }).safeParse(input);
  if (!parsed.success) return fail('That friendship is no longer available.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'cancelled' })
    .eq('id', parsed.data.friendshipId)
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (error) return fail(error.message);
  revalidatePath('/friends');
  revalidatePath('/home');
  return okVoid();
}

/** Respond to an incoming request directly from its notification. */
export async function respondToFriendRequestFromNotification(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const maintenanceBlock = await assertMaintenanceAllowsWrites();
  if (maintenanceBlock) return maintenanceBlock;

  const parsed = friendResponseSchema.pick({ response: true }).and(friendRequestSchema).safeParse(input);
  if (!parsed.success) return fail('That friend request is no longer available.');

  const supabase = await createClient();
  const status = parsed.data.response === 'accept' ? 'accepted' : 'declined';
  const { data: request, error: lookupError } = await supabase
    .from('friendships')
    .select('id')
    .eq('requester_id', parsed.data.addresseeId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (lookupError || !request) return fail('That friend request is no longer available.');

  const { error } = await supabase.from('friendships').update({ status }).eq('id', request.id);
  if (error) return fail(error.message);

  // Mark/delete the underlying notification server-side so it doesn't reappear on reload
  await supabase
    .from('notifications')
    .delete()
    .eq('user_id', user.id)
    .eq('type', 'friend_request')
    .eq('related_user_id', parsed.data.addresseeId);

  revalidatePath('/friends');
  revalidatePath('/home');
  revalidatePath('/notifications');
  return okVoid();
}

/** Assign, update, or remove a private nickname for a friend. */
export async function setFriendNickname(input: {
  friendId: string;
  nickname: string | null;
}): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const trimmed = input.nickname?.trim() ?? '';
  if (!trimmed) {
    const { error } = await supabase
      .from('friend_nicknames')
      .delete()
      .eq('user_id', user.id)
      .eq('friend_id', input.friendId);
    if (error) return fail(error.message);
  } else {
    if (trimmed.length > 60) return fail('Nickname must be 60 characters or less.');
    const { error } = await supabase
      .from('friend_nicknames')
      .upsert(
        {
          user_id: user.id,
          friend_id: input.friendId,
          nickname: trimmed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,friend_id' },
      );
    if (error) return fail(error.message);
  }

  revalidatePath('/friends');
  revalidatePath('/home');
  return okVoid();
}
