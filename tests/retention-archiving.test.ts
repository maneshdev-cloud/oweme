import { describe, expect, it } from 'vitest';
import { adminSettingSchema } from '@/lib/validation';
import { DEFAULT_SETTINGS } from '@/lib/queries/core';

describe('Retention & Archiving System', () => {
  it('has sensible default retention settings defined', () => {
    expect(DEFAULT_SETTINGS.retention_days).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_SETTINGS.archive_notice_days).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_SETTINGS.archive_purge_days).toBeGreaterThanOrEqual(1);
  });

  it('validates retention_days correctly with adminSettingSchema', () => {
    const valid = adminSettingSchema.safeParse({ key: 'retention_days', value: 60 });
    expect(valid.success).toBe(true);

    const negative = adminSettingSchema.safeParse({ key: 'retention_days', value: -1 });
    expect(negative.success).toBe(false);

    const excessive = adminSettingSchema.safeParse({ key: 'retention_days', value: 99999 });
    expect(excessive.success).toBe(false);
  });

  it('validates archive_notice_days correctly with adminSettingSchema', () => {
    const valid = adminSettingSchema.safeParse({ key: 'archive_notice_days', value: 30 });
    expect(valid.success).toBe(true);
  });

  it('validates archive_purge_days correctly with adminSettingSchema', () => {
    const valid = adminSettingSchema.safeParse({ key: 'archive_purge_days', value: 90 });
    expect(valid.success).toBe(true);
  });

  it('rejects invalid key names for retention', () => {
    const invalid = adminSettingSchema.safeParse({ key: 'unknown_retention_key', value: 30 });
    expect(invalid.success).toBe(false);
  });
});
