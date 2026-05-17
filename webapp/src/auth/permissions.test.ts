import { describe, expect, it } from 'vitest';
import { matchPermission } from './permissions';

describe('frontend permissions', () => {
  it('"*" matcht alles', () => {
    expect(matchPermission(['*'], 'receipts.read')).toBe(true);
    expect(matchPermission(['*'], 'users.manage')).toBe(true);
  });

  it('Resource-Wildcard "users.*" matcht alle users.X', () => {
    expect(matchPermission(['users.*'], 'users.read')).toBe(true);
    expect(matchPermission(['users.*'], 'users.manage')).toBe(true);
    expect(matchPermission(['users.*'], 'receipts.read')).toBe(false);
  });

  it('exakte Permission matcht nur exakt', () => {
    expect(matchPermission(['users.read'], 'users.read')).toBe(true);
    expect(matchPermission(['users.read'], 'users.manage')).toBe(false);
  });

  it('leere Grants matchen nichts', () => {
    expect(matchPermission([], 'users.read')).toBe(false);
  });
});
