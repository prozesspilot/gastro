import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeWizard, connectLexware, getSession, saveStep, WizardApiError } from './api';

function mockFetchOnce(opts: { ok: boolean; status?: number; body: unknown; statusText?: string }) {
  const fn = vi.fn().mockResolvedValue({
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 400),
    statusText: opts.statusText ?? '',
    json: async () => opts.body,
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const SESSION = {
  status: 'started',
  current_step: 1,
  step_data: {},
  premium_setup_requested: false,
  expires_at: new Date().toISOString(),
};

describe('wizard api client', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('getSession entpackt { session } und ruft den richtigen Pfad', async () => {
    const fetchFn = mockFetchOnce({ ok: true, body: { session: SESSION } });
    const s = await getSession('tok123');
    expect(s.current_step).toBe(1);
    expect(fetchFn).toHaveBeenCalledWith('/api/v1/wizard/tok123', expect.objectContaining({ method: 'GET' }));
  });

  it('saveStep POSTet JSON-Body an den Step-Pfad', async () => {
    const fetchFn = mockFetchOnce({ ok: true, body: { session: { ...SESSION, current_step: 2 } } });
    const s = await saveStep('tok123', 1, { firmenname: 'X' });
    expect(s.current_step).toBe(2);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/v1/wizard/tok123/step/1');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ firmenname: 'X' });
  });

  it('wirft WizardApiError mit Status + Code bei Fehlerantwort', async () => {
    mockFetchOnce({ ok: false, status: 410, body: { error: 'expired', message: 'abgelaufen' } });
    await expect(getSession('tok')).rejects.toMatchObject({
      name: 'WizardApiError',
      status: 410,
      code: 'expired',
      message: 'abgelaufen',
    });
  });

  it('completeWizard nutzt POST /complete', async () => {
    const fetchFn = mockFetchOnce({ ok: true, body: { session: { ...SESSION, status: 'completed' } } });
    const s = await completeWizard('tok');
    expect(s.status).toBe('completed');
    expect(fetchFn.mock.calls[0][0]).toBe('/api/v1/wizard/tok/complete');
  });

  it('WizardApiError ist eine Error-Instanz', () => {
    const e = new WizardApiError(404, 'x');
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(404);
  });

  it('connectLexware POSTet api_token an /connect/lexware und gibt { ok, company_name } zurück', async () => {
    const fetchFn = mockFetchOnce({ ok: true, body: { ok: true, company_name: 'Bella GmbH' } });
    const res = await connectLexware('tok123', 'apikey1234567', 'Kanzlei');
    expect(res).toEqual({ ok: true, company_name: 'Bella GmbH' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/v1/wizard/tok123/connect/lexware');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ api_token: 'apikey1234567', display_name: 'Kanzlei' });
  });

  it('connectLexware wirft WizardApiError mit Code bei abgelehntem Token (422)', async () => {
    mockFetchOnce({ ok: false, status: 422, body: { error: 'token_rejected', message: 'abgelehnt' } });
    await expect(connectLexware('tok', 'apikey1234567')).rejects.toMatchObject({
      name: 'WizardApiError',
      status: 422,
      code: 'token_rejected',
    });
  });
});
