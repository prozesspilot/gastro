import { describe, expect, it } from 'vitest';
import {
  generateRefreshTokenPlain,
  hashRefreshToken,
  newFamilyId,
  newRefreshTokenId,
} from '../services/refresh-token.repository';

describe('refresh-token primitives', () => {
  it('generateRefreshTokenPlain: hohe Entropie, einzigartig', () => {
    const a = generateRefreshTokenPlain();
    const b = generateRefreshTokenPlain();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(64);
    // base64url-Zeichen
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashRefreshToken: deterministisch + sha256 hex (64 Zeichen)', () => {
    const h1 = hashRefreshToken('abc');
    const h2 = hashRefreshToken('abc');
    expect(h1).toEqual(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('newRefreshTokenId: Präfix rft_', () => {
    const id = newRefreshTokenId();
    expect(id.startsWith('rft_')).toBe(true);
  });

  it('newFamilyId: Präfix fam_', () => {
    const id = newFamilyId();
    expect(id.startsWith('fam_')).toBe(true);
  });
});
