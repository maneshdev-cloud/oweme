import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/supabase/config';

describe('Supabase OAuth redirect safety', () => {
  it('keeps local app paths', () => {
    expect(safeNextPath('/groups/example')).toBe('/groups/example');
  });

  it('rejects absolute and protocol-relative destinations', () => {
    expect(safeNextPath('https://example.com')).toBe('/home');
    expect(safeNextPath('//example.com')).toBe('/home');
    expect(safeNextPath(null)).toBe('/home');
  });
});