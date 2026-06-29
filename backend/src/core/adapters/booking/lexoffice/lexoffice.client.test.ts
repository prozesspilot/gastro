/**
 * T009-Review-Fix (PR #59 Blocker): createVoucher muss einen stabilen
 * `Idempotency-Key`-Header senden, damit Retries (interner Client-Retry bei
 * 5xx/429 UND der aeussere Exporter-Retry) keinen doppelten Buchungsbeleg im
 * Steuerberater-System erzeugen.
 */

import { describe, expect, it, vi } from 'vitest';
import { LexofficeApiError, LexofficeClient } from './lexoffice.client';

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const VOUCHER = {
  type: 'purchaseinvoice' as const,
  voucherNumber: 'b-001',
  voucherDate: '2026-05-19',
  dueDate: '2026-05-19',
  totalGrossAmount: 119,
  totalTaxAmount: 19,
  taxType: 'gross' as const,
  useCollectiveContact: true,
  voucherItems: [{ amount: 119, taxAmount: 19, taxRatePercent: 19, categoryId: 'cat-1' }],
  memo: 'test',
};

type FetchArgs = [input: string | URL, init?: RequestInit];

function headersOf(call: FetchArgs): Record<string, string> {
  return (call[1]?.headers ?? {}) as Record<string, string>;
}

describe('LexofficeClient.createVoucher — Idempotency-Key', () => {
  it('sendet den Idempotency-Key-Header wenn übergeben', async () => {
    const fetchImpl = vi.fn<(...args: FetchArgs) => Promise<Response>>(async () =>
      jsonResponse({ id: 'voucher-123' }),
    );
    const client = new LexofficeClient({
      apiKey: 'test-token',
      customerId: 't-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      redis: null,
    });

    await client.createVoucher(VOUCHER, 'abc123-idem-key');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(headersOf(fetchImpl.mock.calls[0])['Idempotency-Key']).toBe('abc123-idem-key');
  });

  it('sendet keinen Idempotency-Key-Header wenn nicht übergeben', async () => {
    const fetchImpl = vi.fn<(...args: FetchArgs) => Promise<Response>>(async () =>
      jsonResponse({ id: 'voucher-123' }),
    );
    const client = new LexofficeClient({
      apiKey: 'test-token',
      customerId: 't-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      redis: null,
    });

    await client.createVoucher(VOUCHER);

    expect(headersOf(fetchImpl.mock.calls[0])['Idempotency-Key']).toBeUndefined();
  });

  it('behält denselben Idempotency-Key über interne Retries (5xx) bei', async () => {
    const fetchImpl = vi
      .fn<(...args: FetchArgs) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'voucher-123' }));
    const client = new LexofficeClient({
      apiKey: 'test-token',
      customerId: 't-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      redis: null,
    });

    await client.createVoucher(VOUCHER, 'stable-key');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      expect(headersOf(call)['Idempotency-Key']).toBe('stable-key');
    }
  });
});

describe('LexofficeClient.getProfile + maxRetries (T084)', () => {
  it('getProfile gibt das Firmenprofil zurück (1 Fetch)', async () => {
    const fetchImpl = vi.fn<(...args: FetchArgs) => Promise<Response>>(async () =>
      jsonResponse({ companyName: 'Pizzeria Bella GmbH', organizationId: 'org-1' }, 200),
    );
    const client = new LexofficeClient({
      apiKey: 'gueltig',
      customerId: 't-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      redis: null,
    });

    const profile = await client.getProfile();
    expect(profile.companyName).toBe('Pizzeria Bella GmbH');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0][0] as string).endsWith('/v1/profile')).toBe(true);
  });

  it('maxRetries:0 macht KEINE Retries bei 5xx (fail-fast für den UI-Live-Check)', async () => {
    const fetchImpl = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () => new Response('boom', { status: 503 }),
    );
    const client = new LexofficeClient({
      apiKey: 'gueltig',
      customerId: 't-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      redis: null,
      maxRetries: 0,
    });

    await expect(client.getProfile()).rejects.toBeInstanceOf(LexofficeApiError);
    // Genau ein Versuch — kein 0.5/2/8 s-Backoff.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('401 wirft sofort LexofficeApiError(401) (kein Retry bei 4xx)', async () => {
    const fetchImpl = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () => new Response('unauthorized', { status: 401 }),
    );
    const client = new LexofficeClient({
      apiKey: 'falsch',
      customerId: 't-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      redis: null,
    });

    await expect(client.getProfile()).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
