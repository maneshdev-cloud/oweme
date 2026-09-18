'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { toAmountString, toMinor } from '@/lib/money';
import { splitEqually } from '@/lib/split';
import {
  createExpenseSchema,
  createGroupExpenseSchema,
  expenseTransitionSchema,
  settlementActionSchema,
  settlementSchema,
} from '@/lib/validation';
import { fail, ok, okVoid, type ActionResult } from '@/lib/actions/types';

/**
 * Every mutation in here is validated on the server, written through the
 * caller's own session (so RLS and the database triggers apply), and returns a
 * friendly message instead of leaking SQL to the UI.
 *
 * The client is never trusted for: who the payer is, what the status should be,
 * whether the two people are friends, or whether the amounts reconcile. All of
 * that is re-derived or re-checked by the database.
 */

const DUPLICATE_KEY = '23505';

function friendly(error: { message?: string; code?: string; details?: string } | null): string {
  if (!error) return 'Something went wrong. Try again.';
  const message = error.message ?? '';
  if (error.code === '23514') return message || 'Those numbers do not add up.';
  if (error.code === '23505') return 'That looks like a duplicate — nothing was added twice.';
  if (error.code === '42501' || error.code === '42P01') return message || 'You cannot do that.';
  if (message.includes('JWT') || message.includes('refresh token')) {
    return 'Your session expired. Sign in again to continue.';
  }
  return message || 'Something went wrong. Try again.';
}

/** 1:1 expense — the <10 second flow. */
export async function createExpense(
  input: unknown,
): Promise<ActionResult<{ id: string; duplicate: boolean }>> {
  const user = await requireUser();
  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Check the form', parsed.error.flatten().fieldErrors);
  }
  const { friendId, amount, description, category, direction, clientRequestId } = parsed.data;

  const supabase = await createClient();
  const payerId = direction === 'i_paid' ? user.id : friendId;
  const debtorId = direction === 'i_paid' ? friendId : user.id;

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      payer_id: payerId,
      debtor_id: debtorId,
      amount: toAmountString(toMinor(amount)),
      currency: 'INR',
      description,
      category,
      created_by: user.id,
      client_request_id: clientRequestId,
    })
    .select('id')
    .single();

  if (error) {
    // A retry after a dropped connection reuses the same idempotency key: the
    // expense already exists, so we hand back the original instead of a
    // confusing error — and instead of a second expense.
    if (error.code === DUPLICATE_KEY) {
      const { data: existing } = await supabase
        .from('expenses')
        .select('id')
        .eq('created_by', user.id)
        .eq('client_request_id', clientRequestId)
        .maybeSingle();
      if (existing) return ok({ id: existing.id, duplicate: true });
    }
    await log.error('create_expense_failed', friendly(error), { code: error.code }, user.id);
    return fail(friendly(error));
  }

  revalidatePath('/home');
  revalidatePath('/friends');
  return ok({ id: data!.id, duplicate: false });
}

/** Legal state-machine moves only — the database rejects anything else anyway. */
export async function transitionExpense(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = expenseTransitionSchema.safeParse(input);
  if (!parsed.success) return fail('That action is not available.');

  const { expenseId, action } = parsed.data;
  const nextStatus =
    action === 'mark_paid'
      ? 'PAYMENT_MARKED'
      : action === 'confirm'
        ? 'CONFIRMED'
        : action === 'dispute'
          ? 'DISPUTED'
          : 'CANCELLED';

  const supabase = await createClient();
  const { error } = await supabase.from('expenses').update({ status: nextStatus }).eq('id', expenseId);

  if (error) {
    await log.warn('expense_transition_failed', friendly(error), { action, code: error.code }, user.id);
    return fail(friendly(error));
  }

  revalidatePath('/home');
  revalidatePath(`/expenses/${expenseId}`);
  revalidatePath('/notifications');
  return okVoid();
}

/**
 * "I paid them" / "They paid me" — recorded as a claim the other side confirms.
 * Money does not move through OweMe; this only tracks who says what happened.
 */
export async function createSettlement(
  input: unknown,
): Promise<ActionResult<{ id: string; duplicate: boolean }>> {
  const user = await requireUser();
  const parsed = settlementSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Check the amount', parsed.error.flatten().fieldErrors);
  }
  const { counterpartyId, groupId, amount, direction, clientRequestId } = parsed.data;

  const supabase = await createClient();
  const payerId = direction === 'i_paid' ? user.id : counterpartyId;
  const receiverId = direction === 'i_paid' ? counterpartyId : user.id;

  const { data, error } = await supabase
    .from('settlements')
    .insert({
      group_id: groupId ?? null,
      payer_id: payerId,
      receiver_id: receiverId,
      amount: toAmountString(toMinor(amount)),
      currency: 'INR',
      created_by: user.id,
      client_request_id: clientRequestId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === DUPLICATE_KEY) {
      const { data: existing } = await supabase
        .from('settlements')
        .select('id')
        .eq('created_by', user.id)
        .eq('client_request_id', clientRequestId)
        .maybeSingle();
      if (existing) return ok({ id: existing.id, duplicate: true });
    }
    await log.error('create_settlement_failed', friendly(error), { code: error.code }, user.id);
    return fail(friendly(error));
  }

  revalidatePath('/home');
  if (groupId) revalidatePath(`/groups/${groupId}`);
  return ok({ id: data!.id, duplicate: false });
}

export async function transitionSettlement(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = settlementActionSchema.safeParse(input);
  if (!parsed.success) return fail('That action is not available.');

  const { settlementId, action } = parsed.data;
  const nextStatus = action === 'confirm' ? 'CONFIRMED' : action === 'dispute' ? 'DISPUTED' : 'CANCELLED';

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('settlements')
    .update({ status: nextStatus })
    .eq('id', settlementId)
    .select('group_id')
    .single();

  if (error) {
    await log.warn('settlement_transition_failed', friendly(error), { action, code: error.code }, user.id);
    return fail(friendly(error));
  }

  revalidatePath('/home');
  revalidatePath(`/settlements/${settlementId}`);
  if (data?.group_id) revalidatePath(`/groups/${data.group_id}`);
  return okVoid();
}

/** Group expense: supports equal split (Mode 1) or custom payments & shares (Mode 2). */
export async function createGroupExpense(
  input: unknown,
): Promise<ActionResult<{ id: string; duplicate: boolean }>> {
  const user = await requireUser();
  const parsed = createGroupExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Check the form', parsed.error.flatten().fieldErrors);
  }
  const { groupId, amount, description, category, clientRequestId } = parsed.data;

  const payers =
    parsed.data.payers && parsed.data.payers.length > 0
      ? parsed.data.payers
      : parsed.data.paidBy
        ? [{ userId: parsed.data.paidBy, amount: parsed.data.amount }]
        : [];

  type ShareItem = { userId: string; amount: string };
  const shares: ShareItem[] =
    parsed.data.shares && parsed.data.shares.length > 0
      ? parsed.data.shares
      : parsed.data.participantIds && parsed.data.participantIds.length > 0
        ? splitEqually(toMinor(amount), parsed.data.participantIds).map(
            (s: { userId: string; share: number }) => ({
              userId: s.userId,
              amount: toAmountString(s.share),
            }),
          )
        : [];

  const supabase = await createClient();

  // Try create_group_expense_v2 first
  const { data: v2Data, error: v2Error } = await supabase.rpc('create_group_expense_v2', {
    p_group_id: groupId,
    p_amount: toAmountString(toMinor(amount)),
    p_description: description,
    p_category: category,
    p_payers: payers.map((p) => ({ user_id: p.userId, amount: Number(p.amount) })),
    p_shares: shares.map((s) => ({ user_id: s.userId, amount: Number(s.amount) })),
    p_client_request_id: clientRequestId,
  });

  if (!v2Error && v2Data) {
    revalidatePath(`/groups/${groupId}`);
    revalidatePath('/groups');
    return ok({ id: v2Data as string, duplicate: false });
  }

  // Fallback 1: Legacy RPC create_group_expense if single payer and participantIds available
  if (payers.length === 1 && parsed.data.participantIds && parsed.data.participantIds.length > 0) {
    const { data: v1Data, error: v1Error } = await supabase.rpc('create_group_expense', {
      p_group_id: groupId,
      p_paid_by: payers[0].userId,
      p_amount: toAmountString(toMinor(amount)),
      p_description: description,
      p_category: category,
      p_participant_ids: parsed.data.participantIds,
      p_client_request_id: clientRequestId,
    });

    if (!v1Error && v1Data) {
      await supabase.from('group_expense_payers').insert({
        group_expense_id: v1Data as string,
        user_id: payers[0].userId,
        paid_amount: toAmountString(toMinor(amount)),
      });
      revalidatePath(`/groups/${groupId}`);
      revalidatePath('/groups');
      return ok({ id: v1Data as string, duplicate: false });
    }
  }

  // Fallback 2: Direct table insertions if RPC v2 isn't deployed yet
  const { data: expRow, error: expError } = await supabase
    .from('group_expenses')
    .insert({
      group_id: groupId,
      paid_by: payers[0]?.userId ?? user.id,
      amount: toAmountString(toMinor(amount)),
      currency: 'INR',
      description: description.trim(),
      category: category.trim() || 'Other',
      created_by: user.id,
      client_request_id: clientRequestId,
    })
    .select('id')
    .single();

  if (expError || !expRow) {
    if (expError?.code === DUPLICATE_KEY) {
      const { data: existing } = await supabase
        .from('group_expenses')
        .select('id')
        .eq('created_by', user.id)
        .eq('client_request_id', clientRequestId)
        .maybeSingle();
      if (existing) return ok({ id: existing.id, duplicate: true });
    }
    await log.error(
      'create_group_expense_failed',
      friendly(v2Error ?? expError),
      { code: (v2Error ?? expError)?.code },
      user.id,
    );
    return fail(friendly(v2Error ?? expError));
  }

  if (payers.length > 0) {
    await supabase.from('group_expense_payers').insert(
      payers.map((p) => ({
        group_expense_id: expRow.id,
        user_id: p.userId,
        paid_amount: toAmountString(toMinor(p.amount)),
      })),
    );
  }

  if (shares.length > 0) {
    await supabase.from('group_expense_shares').insert(
      shares.map((s) => ({
        group_expense_id: expRow.id,
        user_id: s.userId,
        share_amount: toAmountString(toMinor(s.amount)),
      })),
    );
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath('/groups');
  return ok({ id: expRow.id, duplicate: false });
}

export async function cancelGroupExpense(input: unknown): Promise<ActionResult> {
  await requireUser();
  const shape = expenseTransitionSchema.safeParse(input);
  if (!shape.success) return fail('That action is not available.');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('group_expenses')
    .update({ status: 'CANCELLED' })
    .eq('id', shape.data.expenseId)
    .select('group_id')
    .single();

  if (error) return fail(friendly(error));
  if (data?.group_id) {
    revalidatePath(`/groups/${data.group_id}`);
    revalidatePath('/groups');
  }
  return okVoid();
}

/** Respond to a payment/settlement confirmation request directly from its notification. */
export async function respondToPaymentFromNotification(input: {
  notificationId: string;
  response: 'yes' | 'no';
}): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: notification, error: notifError } = await supabase
    .from('notifications')
    .select('id, type, deep_link, related_settlement_id, related_expense_id, related_user_id')
    .eq('id', input.notificationId)
    .eq('user_id', user.id)
    .single();

  if (notifError || !notification) {
    return fail('That notification is no longer available.');
  }

  const isSettlement = Boolean(
    notification.related_settlement_id ||
      notification.type === 'settlement_created' ||
      notification.deep_link?.startsWith('/settlements/'),
  );

  const action = input.response === 'yes' ? 'confirm' : 'dispute';

  if (isSettlement) {
    const settlementId =
      notification.related_settlement_id ||
      notification.deep_link?.split('/settlements/')[1]?.split('/')[0]?.split('?')[0];

    if (!settlementId) return fail('Settlement could not be found.');

    const res = await transitionSettlement({ settlementId, action });
    if (!res.ok) return res;
  } else {
    const expenseId =
      notification.related_expense_id ||
      notification.deep_link?.split('/expenses/')[1]?.split('/')[0]?.split('?')[0];

    if (!expenseId) return fail('Expense could not be found.');

    const res = await transitionExpense({ expenseId, action });
    if (!res.ok) return res;
  }

  // Delete notification server-side so it does not reappear on reload
  await supabase.from('notifications').delete().eq('id', input.notificationId);

  revalidatePath('/notifications');
  revalidatePath('/home');
  return okVoid();
}
