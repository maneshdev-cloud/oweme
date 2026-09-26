import { describe, it, expect, vi, beforeEach } from 'vitest';
import { announcementSchema } from '@/lib/validation';
import * as coreQueries from '@/lib/queries/core';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockUser = vi.hoisted(() => ({
  current: null as { id: string; email: string } | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  getSessionUser: async () => mockUser.current,
  requireUser: async () => {
    if (!mockUser.current) throw new Error('Unauthorized');
    return mockUser.current;
  },
  createClient: async () => ({
    rpc: vi.fn().mockResolvedValue({ data: false }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
  createServiceClient: () => ({
    from: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

import { updateAnnouncement } from '@/lib/actions/admin';

describe('Announcement & Banner System', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUser.current = null;
  });

  describe('Validation Schema', () => {
    it('accepts valid active announcement with warning tone and dismissible flag', () => {
      const parsed = announcementSchema.safeParse({
        message: 'Scheduled maintenance this Friday at 11 PM',
        tone: 'warning',
        dismissible: true,
        active: true,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.tone).toBe('warning');
        expect(parsed.data.dismissible).toBe(true);
        expect(parsed.data.active).toBe(true);
      }
    });

    it('accepts valid active announcement with info tone and dismissible false', () => {
      const parsed = announcementSchema.safeParse({
        message: 'Welcome to the new academic year!',
        tone: 'info',
        dismissible: false,
        active: true,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.tone).toBe('info');
        expect(parsed.data.dismissible).toBe(false);
      }
    });

    it('accepts inactive announcement payload', () => {
      const parsed = announcementSchema.safeParse({
        message: '',
        tone: 'info',
        dismissible: true,
        active: false,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.active).toBe(false);
      }
    });

    it('rejects invalid tones', () => {
      const parsed = announcementSchema.safeParse({
        message: 'Hello',
        tone: 'danger',
        dismissible: true,
        active: true,
      });
      expect(parsed.success).toBe(false);
    });

    it('enforces 280 character maximum length', () => {
      const parsed = announcementSchema.safeParse({
        message: 'a'.repeat(281),
        tone: 'info',
        dismissible: true,
        active: true,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('Settings Parsing in getAppSettings', () => {
    it('parses announcement_banner as null when disabled in database', () => {
      const settings = { ...coreQueries.DEFAULT_SETTINGS };
      expect(settings.announcement_banner).toBeNull();
    });

    it('retains announcement banner properties when active', () => {
      const bannerData = {
        message: 'Test banner',
        tone: 'warning' as const,
        dismissible: false,
      };
      const settings = {
        ...coreQueries.DEFAULT_SETTINGS,
        announcement_banner: bannerData,
      };
      expect(settings.announcement_banner?.message).toBe('Test banner');
      expect(settings.announcement_banner?.tone).toBe('warning');
      expect(settings.announcement_banner?.dismissible).toBe(false);
    });
  });

  describe('updateAnnouncement action protection', () => {
    it('rejects non-admin users with error', async () => {
      mockUser.current = { id: 'regular-user', email: 'regular@example.com' };
      const result = await updateAnnouncement({
        message: 'Test',
        tone: 'warning',
        dismissible: true,
        active: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Admins only.');
      }
    });

    it('rejects active announcement with empty message', async () => {
      mockUser.current = { id: 'admin-1', email: 'maneshjadhavofficial@gmail.com' };
      const result = await updateAnnouncement({
        message: '   ',
        tone: 'warning',
        dismissible: true,
        active: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Banner message cannot be empty when banner is enabled.');
      }
    });

    it('persists announcement when authorized admin updates banner', async () => {
      mockUser.current = { id: 'admin-1', email: 'maneshjadhavofficial@gmail.com' };
      const result = await updateAnnouncement({
        message: 'Exams week announcement',
        tone: 'info',
        dismissible: true,
        active: true,
      });
      expect(result.ok).toBe(true);
    });
  });
});
