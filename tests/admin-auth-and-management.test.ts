import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isAdmin } from '@/lib/queries/core';
import { addAuthorizedAdminEmail, removeAuthorizedAdminEmail } from '@/lib/actions/admin';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockState = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  authorizedEmails: [
    { email: 'maneshjadhavofficial@gmail.com', role: 'owner' },
    { email: 'admin@example.com', role: 'admin' },
  ],
}));

vi.mock('@/lib/supabase/server', () => ({
  getSessionUser: async () => mockState.user,
  requireUser: async () => {
    if (!mockState.user) throw new Error('Unauthorized');
    return mockState.user;
  },
  createClient: async () => ({
    rpc: vi.fn().mockResolvedValue({ data: false }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    }),
  }),
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'admin_authorized_emails') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockState.authorizedEmails.find((e) => e.email.toLowerCase() === val.toLowerCase()) ?? null,
              }),
            })),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              mockState.authorizedEmails = mockState.authorizedEmails.filter(
                (e) => e.email.toLowerCase() !== val.toLowerCase()
              );
              return { error: null };
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    },
  }),
}));

describe('Admin Authentication & Authorization System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.authorizedEmails = [
      { email: 'maneshjadhavofficial@gmail.com', role: 'owner' },
      { email: 'admin@example.com', role: 'admin' },
    ];
  });

  it('isAdmin returns true for developer owner email maneshjadhavofficial@gmail.com', async () => {
    mockState.user = { id: 'dev-1', email: 'maneshjadhavofficial@gmail.com' };
    const result = await isAdmin();
    expect(result).toBe(true);
  });

  it('isAdmin returns false for unauthorized user email', async () => {
    mockState.user = { id: 'user-random', email: 'intruder@example.com' };
    const result = await isAdmin();
    expect(result).toBe(false);
  });

  it('isAdmin returns true for an authorized admin email registered in database', async () => {
    mockState.user = { id: 'admin-2', email: 'admin@example.com' };
    const result = await isAdmin();
    expect(result).toBe(true);
  });

  it('removeAuthorizedAdminEmail protects owner and refuses to remove maneshjadhavofficial@gmail.com', async () => {
    mockState.user = { id: 'dev-1', email: 'maneshjadhavofficial@gmail.com' };
    const result = await removeAuthorizedAdminEmail({ email: 'maneshjadhavofficial@gmail.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('The primary owner administrator cannot be removed');
    }
  });

  it('addAuthorizedAdminEmail rejects invalid email format', async () => {
    mockState.user = { id: 'dev-1', email: 'maneshjadhavofficial@gmail.com' };
    const result = await addAuthorizedAdminEmail({ email: 'invalid-email' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('valid email');
    }
  });

  it('authorized admin can add another admin email', async () => {
    mockState.user = { id: 'dev-1', email: 'maneshjadhavofficial@gmail.com' };
    const result = await addAuthorizedAdminEmail({ email: 'newadmin@domain.com' });
    expect(result.ok).toBe(true);
  });
});
