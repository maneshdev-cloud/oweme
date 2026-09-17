'use server';

import { createClient } from '@/lib/supabase/server';
import type { Person } from '@/lib/types';

/**
 * Client-callable reads. These exist so the browser never talks to Postgres for
 * anything it cannot verify: the RPC returns public fields only, and the
 * database still decides what "public" means.
 */
export async function searchPeople(query: string, limit = 20): Promise<Person[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_people', { p_query: trimmed, p_limit: limit });
  if (error) return [];
  return (data ?? []) as Person[];
}

export async function getGroupMembersForPicker(groupId: string): Promise<Person[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('group_members').select('user_id, public_profiles(id, full_name, username, avatar_url)').eq('group_id', groupId);
  return ((data ?? []) as unknown as Array<{ public_profiles: Person | null }>)
    .map((row) => row.public_profiles)
    .filter((person): person is Person => Boolean(person));
}

export async function getFriendsForPicker(): Promise<Person[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_friends');
  return ((data ?? []) as Array<{ friend_id: string; full_name: string; username: string; avatar_url: string | null }>).map(
    (row) => ({
      id: row.friend_id,
      full_name: row.full_name,
      username: row.username,
      avatar_url: row.avatar_url,
    }),
  );
}
