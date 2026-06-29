/**
 * T084 — Unit-Test für validateLexwareToken: die Abbildung des Lexware-Profil-
 * Aufrufs auf ok / rejected / unreachable. Injiziert einen Fake-Client (kein HTTP).
 */
import { describe, expect, it } from 'vitest';
import { LexofficeApiError } from '../../../core/adapters/booking/lexoffice/lexoffice.client';
import { validateLexwareToken } from '../services/lexware-validate.service';

function clientThatReturns(profile: { companyName?: string }) {
  return { getProfile: async () => profile };
}
function clientThatThrows(err: unknown) {
  return {
    getProfile: async () => {
      throw err;
    },
  };
}

describe('validateLexwareToken', () => {
  it('ok=true + companyName bei gültigem Profil', async () => {
    const res = await validateLexwareToken({
      token: 't',
      customerId: 'c',
      client: clientThatReturns({ companyName: 'Bella GmbH' }),
    });
    expect(res).toEqual({ ok: true, companyName: 'Bella GmbH' });
  });

  it('ok=true + companyName=null wenn Profil keinen Namen liefert', async () => {
    const res = await validateLexwareToken({
      token: 't',
      customerId: 'c',
      client: clientThatReturns({}),
    });
    expect(res).toEqual({ ok: true, companyName: null });
  });

  it('reason=rejected bei 401', async () => {
    const res = await validateLexwareToken({
      token: 't',
      customerId: 'c',
      client: clientThatThrows(new LexofficeApiError(401, 'unauthorized')),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('rejected');
  });

  it('reason=rejected bei 403', async () => {
    const res = await validateLexwareToken({
      token: 't',
      customerId: 'c',
      client: clientThatThrows(new LexofficeApiError(403, 'forbidden')),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('rejected');
  });

  it('reason=unreachable bei 5xx', async () => {
    const res = await validateLexwareToken({
      token: 't',
      customerId: 'c',
      client: clientThatThrows(new LexofficeApiError(503, 'service unavailable')),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('unreachable');
  });

  it('reason=unreachable bei Netzwerk-/Timeout-Fehler', async () => {
    const res = await validateLexwareToken({
      token: 't',
      customerId: 'c',
      client: clientThatThrows(new Error('fetch failed')),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('unreachable');
  });
});
