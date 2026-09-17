import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createFakeClient, type FakeClient } from './helpers/fake-supabase';
import { fixtureRpcs, fixtureTables, ME } from './helpers/fixtures';
import { scopedDb } from './helpers/rls-policies';
import { getFriendRequests, getFriends, getNotifications, filterResolvableNotifications, searchPeople } from '@/lib/queries/social';
import { getUnreadNotificationCount } from '@/lib/queries/core';

/**
 * The row set the browser session can actually see: RLS-filtered, then handed
 * to the query helpers. If a helper reaches for anything outside this set it is
 * a bug — these tests fail.
 */
const state = vi.hoisted(() => ({ client: null as unknown, user: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => state.client,
  createServiceClient: () => null,
  getSessionUser: async () => state.user,
  requireUser: async () => state.user,
}));

let client: FakeClient;

function scopedClientFor(userId: string | null): FakeClient {
  const db = scopedDb(fixtureTables(), userId ?? ME, fixtureRpcs);
  db.user = userId ? { id: userId } : null;
  return createFakeClient(db);
}

beforeAll(() => {
  client = scopedClientFor(ME);
  state.client = client;
  state.user = { id: ME, email: 'manesh@example.com' };
});

function reset() {
  client = scopedClientFor(ME);
  state.client = client;
  state.user = { id: ME, email: 'manesh@example.com' };
}

describe('friends reads', () => {
  it('returns accepted friends only, never pending requests', async () => {
    reset();
    const friends = await getFriends();
    expect(friends.map((friend) => friend.username)).toEqual(['rahul_s']);
    expect(friends[0].balance).toBe(120.5);
  });

  it('exposes pending requests with a direction the UI can act on', async () => {
    reset();
    const requests = await getFriendRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].direction).toBe('outgoing');
    expect(requests[0].person.username).toBe('priya_n');
  });

  it('search returns people who are not friends yet, without their email', async () => {
    reset();
    const results = await searchPeople('priya');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ username: 'priya_n' });
    expect(Object.keys(results[0])).not.toContain('email');
  });
});

describe('notification reads', () => {
  it('returns my notifications, newest first, and never somebody else’s', async () => {
    reset();
    const notifications = await getNotifications();
    expect(notifications).toHaveLength(3);
    expect(notifications[0].created_at >= notifications[1].created_at).toBe(true);
    expect(notifications.every((notification) => notification.title !== 'Priya owes you ₹999.00')).toBe(true);
  });

  it('counts only my unread notifications', async () => {
    reset();
    expect(await getUnreadNotificationCount()).toBe(2);
  });

  it('flags notifications whose deep link no longer resolves, instead of showing a dead end', async () => {
    reset();
    const notifications = await getNotifications();
    const resolved = await filterResolvableNotifications(notifications);

    const stale = resolved.find((notification) => notification.id === '0f000000-0000-0000-0000-000000000002');
    const live = resolved.find((notification) => notification.id === '0f000000-0000-0000-0000-000000000001');

    expect(stale?.resolvable).toBe(false);
    expect(live?.resolvable).toBe(true);
  });
});
