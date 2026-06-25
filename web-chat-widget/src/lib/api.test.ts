/**
 * T071 — Tests für den Web-Chat-API-Client (Fetch gemockt).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatApiError, getSession, listMessages, sendMessage, uploadBeleg } from './api';

function fetchReturns(opts: { ok?: boolean; status?: number; body?: unknown }) {
  globalThis.fetch = vi.fn(async () => ({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    statusText: 'OK',
    json: async () => opts.body,
  })) as unknown as typeof fetch;
}

beforeEach(() => vi.restoreAllMocks());

describe('getSession', () => {
  it('liefert die Session bei 200', async () => {
    fetchReturns({ body: { session: { status: 'active', expires_at: null } } });
    const s = await getSession('tok');
    expect(s.status).toBe('active');
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/v1/chat/tok');
  });

  it('wirft ChatApiError bei 410', async () => {
    fetchReturns({ ok: false, status: 410, body: { error: 'revoked', message: 'weg' } });
    await expect(getSession('tok')).rejects.toBeInstanceOf(ChatApiError);
    await expect(getSession('tok')).rejects.toMatchObject({ status: 410, code: 'revoked' });
  });
});

describe('listMessages', () => {
  it('liefert den Verlauf', async () => {
    fetchReturns({ body: { messages: [{ id: 'm1' }, { id: 'm2' }] } });
    const msgs = await listMessages('tok');
    expect(msgs).toHaveLength(2);
  });
});

describe('sendMessage', () => {
  it('POSTet Text und liefert die Nachricht', async () => {
    fetchReturns({ body: { message: { id: 'm9', body: 'hi', sender_type: 'customer' } } });
    const m = await sendMessage('tok', 'hi');
    expect(m.id).toBe('m9');
    const [, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ text: 'hi' });
  });
});

describe('uploadBeleg', () => {
  it('sendet FormData und liefert beleg_id + message', async () => {
    fetchReturns({ body: { beleg_id: 'b1', status: 'received', message: { id: 'm10' } } });
    const file = new File([new Uint8Array([1, 2, 3])], 'beleg.png', { type: 'image/png' });
    const res = await uploadBeleg('tok', file);
    expect(res.beleg_id).toBe('b1');
    expect(res.message.id).toBe('m10');
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/chat/tok/belege');
    expect(opts.body).toBeInstanceOf(FormData);
  });

  it('wirft ChatApiError bei 415', async () => {
    fetchReturns({ ok: false, status: 415, body: { error: 'unsupported_mime_type' } });
    const file = new File(['x'], 'x.txt', { type: 'text/plain' });
    await expect(uploadBeleg('tok', file)).rejects.toMatchObject({ status: 415 });
  });
});
