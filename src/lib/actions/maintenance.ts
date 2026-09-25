import 'server-only';

import { getAppSettings, isAdmin } from '@/lib/queries/core';
import { fail, type ActionFailure } from '@/lib/actions/types';

/**
 * Server-side maintenance check.
 * Rejects non-admin financial & social writes when maintenance mode is active.
 * Bypassed completely for verified administrators.
 */
export async function assertMaintenanceAllowsWrites<_T = never>(): Promise<ActionFailure | null> {
  const settings = await getAppSettings();
  if (settings.maintenance_mode) {
    const admin = await isAdmin();
    if (!admin) {
      return fail('OWEME is currently under maintenance. Please try again after some time.');
    }
  }
  return null;
}

