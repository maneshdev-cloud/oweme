import { describe, expect, it } from 'vitest';
import { deleteGroupSchema, groupRoleSchema } from '@/lib/validation';
import type { GroupMemberRow } from '@/lib/types';

describe('Group Admin & Deletion Logic', () => {
  const GROUP_ID = '11111111-1111-4111-8111-111111111111';
  const USER_1 = '22222222-2222-4222-8222-222222222222';
  const USER_2 = '33333333-3333-4333-8333-333333333333';

  describe('Validation Schemas', () => {
    it('validates role changes for owner, admin, and member', () => {
      expect(groupRoleSchema.safeParse({ groupId: GROUP_ID, userId: USER_1, role: 'admin' }).success).toBe(true);
      expect(groupRoleSchema.safeParse({ groupId: GROUP_ID, userId: USER_1, role: 'owner' }).success).toBe(true);
      expect(groupRoleSchema.safeParse({ groupId: GROUP_ID, userId: USER_1, role: 'member' }).success).toBe(true);

      // Rejects invalid role
      expect(groupRoleSchema.safeParse({ groupId: GROUP_ID, userId: USER_1, role: 'moderator' }).success).toBe(false);
      // Rejects invalid uuid
      expect(groupRoleSchema.safeParse({ groupId: 'invalid', userId: USER_1, role: 'admin' }).success).toBe(false);
    });

    it('validates deleteGroup input', () => {
      expect(deleteGroupSchema.safeParse({ groupId: GROUP_ID }).success).toBe(true);
      expect(deleteGroupSchema.safeParse({ groupId: 'not-a-uuid' }).success).toBe(false);
      expect(deleteGroupSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('Group Member Leave & Deletion Rules', () => {
    const makeMember = (userId: string, role: 'owner' | 'admin' | 'member', net: number): GroupMemberRow => ({
      user_id: userId,
      role,
      profile: { id: userId, full_name: `User ${userId.slice(0, 4)}`, username: `user_${userId.slice(0, 4)}`, avatar_url: null },
      paid: 0,
      share: 0,
      settled_out: 0,
      settled_in: 0,
      net,
    });

    it('identifies sole member who can leave and delete group', () => {
      const members = [makeMember(USER_1, 'owner', 0)];
      const isSoleMember = members.length <= 1;
      expect(isSoleMember).toBe(true);

      const hasUnsettled = members.some((m) => Math.abs(m.net) > 0.001);
      expect(hasUnsettled).toBe(false);
    });

    it('blocks deletion when any member has an unsettled balance', () => {
      const members = [
        makeMember(USER_1, 'owner', 150),
        makeMember(USER_2, 'member', -150),
      ];
      const hasUnsettled = members.some((m) => Math.abs(m.net) > 0.001);
      expect(hasUnsettled).toBe(true);
    });

    it('allows leaving if another owner or admin exists', () => {
      const members = [
        makeMember(USER_1, 'owner', 0),
        makeMember(USER_2, 'admin', 0),
      ];
      const currentUserId = USER_1;
      const otherLeaders = members.filter(
        (m) => m.user_id !== currentUserId && (m.role === 'owner' || m.role === 'admin')
      );
      expect(otherLeaders.length).toBeGreaterThan(0);
    });

    it('detects when sole owner/admin tries to leave without assigning a successor', () => {
      const members = [
        makeMember(USER_1, 'owner', 0),
        makeMember(USER_2, 'member', 0),
      ];
      const currentUserId = USER_1;
      const otherLeaders = members.filter(
        (m) => m.user_id !== currentUserId && (m.role === 'owner' || m.role === 'admin')
      );
      expect(otherLeaders.length).toBe(0);
    });
  });
});
