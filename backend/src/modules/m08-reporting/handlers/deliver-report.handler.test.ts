/**
 * T089/M08 — Unit-Tests für den Deliver-Report-Handler (ohne DB/SMTP, Service gemockt).
 *
 * Fokus: Auth-/Rollen-Gate, ID-Validierung, Mapping der Service-Ergebnisse auf
 * Status-Codes. Die fachliche Versand-Logik ist separat integrationsgetestet.
 */
import type { FastifyReply } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deliverReport = vi.fn();

vi.mock('../services/handover-mail.service', () => ({
  deliverReport: (...args: unknown[]) => deliverReport(...args),
}));

import { deliverReportHandler } from './deliver-report.handler';

const VALID_ID = '0c0c0c0c-0087-4087-8087-00000000aaaa';

interface Captured {
  status: number;
  payload: Record<string, unknown>;
}

function makeReply(): { reply: FastifyReply; captured: Captured } {
  const captured: Captured = { status: 0, payload: {} };
  const reply = {
    code(n: number) {
      captured.status = n;
      return this;
    },
    send(p: Record<string, unknown>) {
      captured.payload = p;
      return this;
    },
  } as unknown as FastifyReply;
  return { reply, captured };
}

type HandlerReq = Parameters<typeof deliverReportHandler>[0];

function makeReq(over: Record<string, unknown> = {}): HandlerReq {
  return {
    tenantId: 'tenant-1',
    m14Staff: { userId: 'staff-1', role: 'mitarbeiter' },
    params: { id: VALID_ID },
    server: { db: {}, s3: {} },
    ...over,
  } as unknown as HandlerReq;
}

beforeEach(() => {
  deliverReport.mockReset();
  deliverReport.mockResolvedValue({ ok: true, deliveryId: 'del-1', dryRun: true });
});

describe('deliverReportHandler', () => {
  it('401 ohne Auth/Tenant', async () => {
    const { reply, captured } = makeReply();
    await deliverReportHandler(makeReq({ m14Staff: undefined }), reply);
    expect(captured.status).toBe(401);
    expect(deliverReport).not.toHaveBeenCalled();
  });

  it('403 für Rolle support', async () => {
    const { reply, captured } = makeReply();
    await deliverReportHandler(makeReq({ m14Staff: { userId: 's', role: 'support' } }), reply);
    expect(captured.status).toBe(403);
    expect(deliverReport).not.toHaveBeenCalled();
  });

  it('400 bei ungültiger Report-ID', async () => {
    const { reply, captured } = makeReply();
    await deliverReportHandler(makeReq({ params: { id: 'nicht-uuid' } }), reply);
    expect(captured.status).toBe(400);
    expect(deliverReport).not.toHaveBeenCalled();
  });

  it('500 wenn S3 nicht konfiguriert', async () => {
    const { reply, captured } = makeReply();
    await deliverReportHandler(makeReq({ server: { db: {}, s3: undefined } }), reply);
    expect(captured.status).toBe(500);
  });

  it('200 sent (Dry-Run) mit delivery_id', async () => {
    const { reply, captured } = makeReply();
    await deliverReportHandler(makeReq(), reply);
    expect(captured.status).toBe(200);
    expect(captured.payload.delivery_id).toBe('del-1');
    expect(captured.payload.dry_run).toBe(true);
    expect(captured.payload.status).toBe('sent');
  });

  it('200 mit message_id, wenn echt versendet', async () => {
    deliverReport.mockResolvedValue({
      ok: true,
      deliveryId: 'del-2',
      dryRun: false,
      messageId: 'msg-99',
    });
    const { reply, captured } = makeReply();
    await deliverReportHandler(makeReq(), reply);
    expect(captured.status).toBe(200);
    expect(captured.payload.message_id).toBe('msg-99');
  });

  it('404 bei report_not_found', async () => {
    deliverReport.mockResolvedValue({ ok: false, reason: 'report_not_found' });
    const { reply, captured } = makeReply();
    await deliverReportHandler(makeReq(), reply);
    expect(captured.status).toBe(404);
    expect(captured.payload.error).toBe('report_not_found');
  });

  it('404 bei pdf_missing', async () => {
    deliverReport.mockResolvedValue({ ok: false, reason: 'pdf_missing', error: 'NoSuchKey' });
    const { reply, captured } = makeReply();
    await deliverReportHandler(makeReq(), reply);
    expect(captured.status).toBe(404);
    expect(captured.payload.error).toBe('pdf_missing');
  });

  it('422 wenn kein Steuerberater hinterlegt', async () => {
    deliverReport.mockResolvedValue({ ok: false, reason: 'no_recipient' });
    const { reply, captured } = makeReply();
    await deliverReportHandler(makeReq(), reply);
    expect(captured.status).toBe(422);
    expect(captured.payload.error).toBe('no_recipient');
  });

  it('502 bei send_failed (mit delivery_id)', async () => {
    deliverReport.mockResolvedValue({
      ok: false,
      reason: 'send_failed',
      deliveryId: 'del-3',
      error: 'SMTP down',
    });
    const { reply, captured } = makeReply();
    await deliverReportHandler(makeReq(), reply);
    expect(captured.status).toBe(502);
    expect(captured.payload.delivery_id).toBe('del-3');
  });
});
