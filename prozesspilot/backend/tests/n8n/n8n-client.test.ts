/**
 * D7 — Unit-Tests n8n-Client
 *
 * fetch wird via vi.stubGlobal gemockt — kein echter n8n-Server nötig.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  N8nClientError,
  getWorkflow,
  getWorkflows,
  triggerWebhook,
} from '../../src/core/n8n/client';

// ── fetch mocken ──────────────────────────────────────────────────────────────

function makeFetchMock(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(String(body)),
  });
}

// ── triggerWebhook ────────────────────────────────────────────────────────────

describe('triggerWebhook', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST an /webhook/<path> mit JSON-Payload', async () => {
    const mockFetch = makeFetchMock(200, { success: true });
    vi.stubGlobal('fetch', mockFetch);

    await triggerWebhook('document-received', { tenant_id: 't1', doc_id: 'd1' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/webhook/document-received');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toMatchObject({ tenant_id: 't1', doc_id: 'd1' });
    expect((options.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it('wirft N8nClientError bei HTTP-Fehler', async () => {
    vi.stubGlobal('fetch', makeFetchMock(503, { message: 'Service Unavailable' }));

    await expect(triggerWebhook('test', {})).rejects.toThrow(N8nClientError);
  });
});

// ── getWorkflows ──────────────────────────────────────────────────────────────

describe('getWorkflows', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET /api/v1/workflows und gibt data-Array zurück', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, { data: [{ id: '1', name: 'Workflow A' }] }));

    const workflows = await getWorkflows();

    expect(workflows).toHaveLength(1);
    expect((workflows[0] as { id: string }).id).toBe('1');
  });

  it('gibt leeres Array zurück wenn data fehlt', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, {}));
    const workflows = await getWorkflows();
    expect(workflows).toEqual([]);
  });
});

// ── getWorkflow ───────────────────────────────────────────────────────────────

describe('getWorkflow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET /api/v1/workflows/:id', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, { id: '42', name: 'My Workflow' }));

    const wf = (await getWorkflow('42')) as { id: string };

    expect(wf.id).toBe('42');
  });

  it('wirft N8nClientError bei 404', async () => {
    vi.stubGlobal('fetch', makeFetchMock(404, { message: 'Not found' }));
    await expect(getWorkflow('999')).rejects.toThrow(N8nClientError);
  });
});
