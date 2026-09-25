import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertMaintenanceAllowsWrites } from '@/lib/actions/maintenance';
import * as coreQueries from '@/lib/queries/core';

describe('Maintenance Mode Server-Side Protection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows writes when maintenance mode is OFF', async () => {
    vi.spyOn(coreQueries, 'getAppSettings').mockResolvedValue({
      ...coreQueries.DEFAULT_SETTINGS,
      maintenance_mode: false,
    });
    vi.spyOn(coreQueries, 'isAdmin').mockResolvedValue(false);

    const block = await assertMaintenanceAllowsWrites();
    expect(block).toBeNull();
  });

  it('blocks non-admin writes with standard error when maintenance mode is ON', async () => {
    vi.spyOn(coreQueries, 'getAppSettings').mockResolvedValue({
      ...coreQueries.DEFAULT_SETTINGS,
      maintenance_mode: true,
    });
    vi.spyOn(coreQueries, 'isAdmin').mockResolvedValue(false);

    const block = await assertMaintenanceAllowsWrites();
    expect(block).not.toBeNull();
    expect(block?.ok).toBe(false);
    expect(block?.error).toBe('OWEME is currently under maintenance. Please try again after some time.');
  });

  it('allows authorized admin to completely bypass maintenance mode when ON', async () => {
    vi.spyOn(coreQueries, 'getAppSettings').mockResolvedValue({
      ...coreQueries.DEFAULT_SETTINGS,
      maintenance_mode: true,
    });
    vi.spyOn(coreQueries, 'isAdmin').mockResolvedValue(true);


    const block = await assertMaintenanceAllowsWrites();
    expect(block).toBeNull();
  });

  it('ensures SUPABASE_SERVICE_ROLE_KEY is never prefixed with NEXT_PUBLIC_', () => {
    const publicKeys = Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC_'));
    const leakedServiceKey = publicKeys.some((k) => k.toUpperCase().includes('SERVICE_ROLE'));
    expect(leakedServiceKey).toBe(false);
  });
});
