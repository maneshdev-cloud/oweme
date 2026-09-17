import { Handshake, UserPlus, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { Amount } from '@/components/money';
import { PersonAvatar } from '@/components/person-avatar';
import { FriendSearch } from '@/components/friends/friend-search';
import { FriendRequests } from '@/components/friends/friend-requests';
import { AddExpenseButton } from '@/components/add-expense/add-expense-fab';
import { SettleUpButton } from '@/components/settle-up-dialog';
import { RemoveFriendButton } from '@/components/friends/remove-friend-button';
import { FriendNicknameDialog } from '@/components/friends/nickname-dialog';
import { getFriendRequests, getFriends } from '@/lib/queries/social';
import { toMinor } from '@/lib/money';

export const metadata = { title: 'Friends' };

export default async function FriendsPage() {
  const [friends, requests] = await Promise.all([getFriends(), getFriendRequests()]);
  const incoming = requests.filter((request) => request.direction === 'incoming');
  const outgoing = requests.filter((request) => request.direction === 'outgoing');

  return (
    <div className="space-y-6">
      <section aria-labelledby="find-heading" className="space-y-3">
        <h2 id="find-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <UserPlus className="h-4 w-4" aria-hidden />
          Find people
        </h2>
        <FriendSearch />
      </section>

      {requests.length > 0 && (
        <section aria-labelledby="requests-heading" className="space-y-3">
          <h2 id="requests-heading" className="text-base font-semibold">
            Requests
            {incoming.length > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {incoming.length} waiting
              </span>
            )}
          </h2>
          <FriendRequests requests={[...incoming, ...outgoing]} />
        </section>
      )}

      <section aria-labelledby="friends-heading" className="space-y-3">
        <h2 id="friends-heading" className="flex items-center gap-2 text-base font-semibold">
          <Users className="h-4 w-4" aria-hidden />
          Your friends
        </h2>

        {friends.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="No friends yet"
            description="Search for a classmate above. Once they accept, you can split printouts, chai and tickets — and neither of you has to remember who paid."
          />
        ) : (
          <ul className="space-y-2">
            {friends.map((friend) => {
              const person = {
                id: friend.friend_id,
                full_name: friend.full_name,
                username: friend.username,
                avatar_url: friend.avatar_url,
              };
              const balance = toMinor(friend.balance);
              return (
                <li key={friend.friendship_id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap sm:p-4">
                      <PersonAvatar person={person} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-medium">{friend.nickname || friend.full_name}</p>
                          {friend.nickname && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                              Nickname
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {friend.nickname ? `${friend.full_name} · ` : ''}@{friend.username}
                          {balance === 0 ? ' · all square' : balance > 0 ? ' · to receive' : ' · to give'}
                        </p>
                      </div>
                      {balance !== 0 && <Amount minor={balance} />}
                      <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                        <AddExpenseButton
                          friends={friends}
                          variant="inline"
                          size="sm"
                          label="Add expense"
                          initialFriendId={friend.friend_id}
                        />
                        <SettleUpButton
                          person={person}
                          balanceMinor={balance}
                          trigger={
                            <Button size="sm" variant="outline">
                              Settle up
                            </Button>
                          }
                        />
                        <FriendNicknameDialog friend={friend} />
                        <RemoveFriendButton
                          friendshipId={friend.friendship_id}
                          friendName={friend.nickname || friend.full_name}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
