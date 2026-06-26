/**
 * T079 — BullMQ-jobId-Builder dürfen KEIN ':' enthalten.
 *
 * Regression gegen "Custom Id cannot contain :" (Prod-Blocker: OCR/DSGVO-Jobs
 * wurden nie enqueued, Belege blieben für immer in status=received).
 */
import { describe, expect, it } from 'vitest';
import { buildDsgvoJobId } from './dsgvo-queue';
import { buildOcrJobId } from './ocr-queue';

const BELEG = '550e8400-e29b-41d4-a716-446655440001';
const REQ = 'a1b2c3d4-0000-4000-8000-000000000001';

describe('buildOcrJobId (T079)', () => {
  it("upload → 'ocr-<belegId>', ohne ':' und dedup-stabil", () => {
    const id = buildOcrJobId({ tenantId: 't', belegId: BELEG, reason: 'upload' });
    expect(id).toBe(`ocr-${BELEG}`);
    expect(id).not.toContain(':');
    // Stabil: gleicher Beleg → gleiche jobId (Dedup paralleler Uploads).
    expect(buildOcrJobId({ tenantId: 't', belegId: BELEG, reason: 'upload' })).toBe(id);
  });

  it("reprocess → 'ocr-<belegId>-reprocess-<ts>', ohne ':' und zeit-eindeutig", () => {
    const a = buildOcrJobId({ tenantId: 't', belegId: BELEG, reason: 'reprocess' }, 1000);
    const b = buildOcrJobId({ tenantId: 't', belegId: BELEG, reason: 'reprocess' }, 2000);
    expect(a).toBe(`ocr-${BELEG}-reprocess-1000`);
    expect(a).not.toContain(':');
    expect(b).not.toContain(':');
    // Unterschiedlicher Timestamp → unterschiedliche jobId (Reprocess läuft immer).
    expect(a).not.toBe(b);
  });
});

describe('buildDsgvoJobId (T079)', () => {
  it("→ 'dsgvo-<request_id>', ohne ':'", () => {
    const id = buildDsgvoJobId({ request_id: REQ, tenant_id: 't' });
    expect(id).toBe(`dsgvo-${REQ}`);
    expect(id).not.toContain(':');
  });
});
