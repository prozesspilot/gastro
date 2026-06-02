/**
 * Unit-Tests fuer den T038 Discord-Alert-Helper.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('buildCronCrashPayload', () => {
  it('baut Content mit Script-Name, Hostname, Error-Message und Timestamp', async () => {
    const { buildCronCrashPayload } = await import('../../../src/core/notify/discord-alert');

    const payload = buildCronCrashPayload({
      scriptName: 'sumup-daily.ts',
      error: new Error('Connection refused'),
    });

    expect(payload.content).toContain('sumup-daily.ts');
    expect(payload.content).toContain('Connection refused');
    expect(payload.content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(payload.allowed_mentions).toEqual({ parse: ['everyone'] });
  });

  it('akzeptiert Non-Error-Throws (String)', async () => {
    const { buildCronCrashPayload } = await import('../../../src/core/notify/discord-alert');

    const payload = buildCronCrashPayload({
      scriptName: 'foo.ts',
      error: 'plain string error',
    });

    expect(payload.content).toContain('plain string error');
  });

  it('truncated lange Error-Messages auf 400 Zeichen + Ellipsis', async () => {
    const { buildCronCrashPayload } = await import('../../../src/core/notify/discord-alert');

    const huge = 'x'.repeat(1000);
    const payload = buildCronCrashPayload({
      scriptName: 'bar.ts',
      error: new Error(huge),
    });

    expect(payload.content).toContain('…');
    expect(payload.content.length).toBeLessThan(huge.length);
  });

  it('haengt context als JSON-Zeile an wenn vorhanden', async () => {
    const { buildCronCrashPayload } = await import('../../../src/core/notify/discord-alert');

    const payload = buildCronCrashPayload({
      scriptName: 'baz.ts',
      error: new Error('x'),
      context: { tenants: 3, business_date: '2026-06-01' },
    });

    expect(payload.content).toMatch(/Context: `\{"tenants":3/);
  });
});

describe('notifyCronCrash', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(process.env, 'DISCORD_OPS_WEBHOOK_URL');
  });

  it('returns false und no-op wenn DISCORD_OPS_WEBHOOK_URL leer ist', async () => {
    Reflect.deleteProperty(process.env, 'DISCORD_OPS_WEBHOOK_URL');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { notifyCronCrash } = await import('../../../src/core/notify/discord-alert');
    const result = await notifyCronCrash({
      scriptName: 'sumup-daily.ts',
      error: new Error('x'),
    });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTet an Webhook wenn URL gesetzt und returns true', async () => {
    process.env.DISCORD_OPS_WEBHOOK_URL = 'https://discord.com/api/webhooks/abc/xyz';
    // Discord-Webhooks antworten in der Regel 204; Response-Konstruktor mag den
    // empty-body bei 204 in node nicht — wir geben nur ein generisches Mock-Object
    // zurueck, da der Helper die Response nicht inspiziert.
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchSpy);

    const { notifyCronCrash } = await import('../../../src/core/notify/discord-alert');
    const result = await notifyCronCrash({
      scriptName: 'sumup-daily.ts',
      error: new Error('DB-Connection refused'),
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://discord.com/api/webhooks/abc/xyz');
    expect((opts as RequestInit).method).toBe('POST');
    expect((opts as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.content).toContain('sumup-daily.ts');
    expect(body.content).toContain('DB-Connection refused');
  });

  it('schluckt eigene Fehler wenn fetch wirft und returns trotzdem true (best-effort)', async () => {
    process.env.DISCORD_OPS_WEBHOOK_URL = 'https://discord.com/api/webhooks/abc/xyz';
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchSpy);

    const { notifyCronCrash } = await import('../../../src/core/notify/discord-alert');
    const result = await notifyCronCrash({
      scriptName: 'pos-credentials-cleanup.ts',
      error: new Error('original error'),
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
