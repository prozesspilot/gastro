import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from './jwt';

describe('jwt', () => {
  it('Round-Trip: sign + verify liefert dieselben Claims', () => {
    const token = signAccessToken({
      userId: 'usr_test_001',
      tenantId: 'tnt_abc',
      permissions: ['receipts.read', 'receipts.write'],
      preset: 'operator',
    });
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const result = verifyAccessToken(token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.sub).toBe('usr_test_001');
    expect(result.payload.tenant_id).toBe('tnt_abc');
    expect(result.payload.permissions).toEqual(['receipts.read', 'receipts.write']);
    expect(result.payload.preset).toBe('operator');
    expect(result.payload.jti.length).toBeGreaterThan(0);
  });

  it('super_admin: tenant_id null wird durchgereicht', () => {
    const token = signAccessToken({
      userId: 'usr_root',
      tenantId: null,
      permissions: ['*'],
      preset: 'super_admin',
    });
    const result = verifyAccessToken(token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.tenant_id).toBeNull();
    expect(result.payload.permissions).toEqual(['*']);
  });

  it('Tampering: manipuliertes Token wird verworfen', () => {
    const token = signAccessToken({
      userId: 'usr_x',
      tenantId: null,
      permissions: ['*'],
      preset: null,
    });
    // Signatur durch komplett falschen Wert ersetzen — kein no-op möglich
    const parts = token.split('.');
    // DECISION: Signatur durch festen Dummy-Wert ersetzen statt letztes Zeichen zu kippen,
    // da slice(0,-1)+'A' ein No-Op ist wenn die Signatur bereits auf 'A' endet.
    const brokenSig = parts[2]
      .split('')
      .map((c) => (c === 'A' ? 'B' : 'A'))
      .join('');
    const broken = `${parts[0]}.${parts[1]}.${brokenSig}`;
    const result = verifyAccessToken(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID');
  });

  it('Müll-String wird verworfen', () => {
    const result = verifyAccessToken('not-a-real-token');
    expect(result.ok).toBe(false);
  });
});
