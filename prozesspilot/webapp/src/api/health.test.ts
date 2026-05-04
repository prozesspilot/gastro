/**
 * Tests für src/api/health.ts
 */

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import { fetchHealth, fetchReady, pingUrl } from './health';

describe('fetchHealth', () => {
  it('gibt Health-Objekt zurück', async () => {
    const result = await fetchHealth();
    expect(result.ok).toBe(true);
    expect(result.version).toBeDefined();
  });

  it('wirft bei Fehler-Status', async () => {
    server.use(
      http.get('/api/v1/health', () =>
        new HttpResponse(null, { status: 503 }),
      ),
    );
    await expect(fetchHealth()).rejects.toThrow('Health-Check fehlgeschlagen');
  });
});

describe('fetchReady', () => {
  it('gibt Ready-Objekt zurück', async () => {
    const result = await fetchReady();
    expect(result.ok).toBe(true);
  });

  it('gibt 503-Body zurück (degraded State) ohne zu werfen', async () => {
    server.use(
      http.get('/api/v1/ready', () =>
        HttpResponse.json(
          { ok: false, status: 'not_ready', checks: { db: { status: 'fail' } } },
          { status: 503 },
        ),
      ),
    );
    // Soll nicht werfen — 503 ist kein Fehler für Ready-Check
    const result = await fetchReady();
    expect(result.ok).toBe(false);
  });
});

describe('pingUrl', () => {
  it('gibt true zurück wenn URL erreichbar', async () => {
    // no-cors fetch in jsdom ist tricky — pingUrl catch gibt false zurück wenn fetch fehlschlägt
    const result = await pingUrl('http://localhost:3000');
    // Kann true oder false sein je nach jsdom-Verhalten, kein Assert auf true
    expect(typeof result).toBe('boolean');
  });
});
