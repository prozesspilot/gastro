/**
 * M10 — End-to-End-Test
 *
 * Pipt einen kompletten WhatsApp-Webhook-Payload (M10 §5.1 Beispiel) durch
 * alle vier M10-Endpoints:
 *   1) /verify         — Webhook-Signatur
 *   2) /resolve        — phone_number_id+from → customer_id
 *   3) /media          — Bytes ziehen, MinIO-Upload (mit Idempotenz)
 *   4) /send-template  — Bestätigungsnachricht
 *
 * Im echten Betrieb bedeutet "E2E" eine reale Test-DB + MinIO-Container; in
 * dieser CI-Variante mocken wir die externen Seiteneffekte (Meta + Storage)
 * und die Postgres-Lookups, sodass der Test deterministisch in <1 s läuft.
 *
 * Spec-Referenz: M10 §13.3, §16
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// ENV-Werte werden in tests/setup.ts gesetzt — vor allen Imports.

// ── Mocks: Storage + Credentials ───────────────────────────────────────────

vi.mock('../../../core/storage/storage.service', () => ({
  uploadObject:   vi.fn(async (_c, key: string, body: Buffer, ct: string) => ({
    key, bucket: 'prozesspilot-raw', size_bytes: body.length, content_type: ct,
  })),
  createS3Client: vi.fn(() => ({}) as never),
}));

vi.mock('../services/credential.service', () => ({
  loadWaCredential: vi.fn(async () => ({
    credentialId:    'cred_test_e2e',
    accessToken:     'EAAtest',
    phoneNumberId:   '123456789012345',
    graphApiVersion: 'v19.0',
  })),
  CredentialNotFoundError: class extends Error { readonly code = 'CREDENTIAL_NOT_FOUND'; },
}));

import { createHmac } from 'node:crypto';
import { m10WhatsAppRoutes } from '../routes';
import { sha256Hex } from '../services/media-downloader';
import type { MetaGraphClient } from '../services/meta-graph.client';

// ── Sample-Webhook-Payload aus M10 §5.1 ────────────────────────────────────

const WEBHOOK_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '+498912345678',
          phone_number_id:      '123456789012345',
        },
        contacts: [{ profile: { name: 'Mario' }, wa_id: '4917612345678' }],
        messages: [{
          from:       '4917612345678',
          id:         'wamid.HBgMNDk3MTYxMjM0NTY3OBUCABIYIDQ4',
          timestamp:  '1714378458',
          type:       'image',
          image: {
            id:        '1234567890987654',
            mime_type: 'image/jpeg',
            sha256:    'f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5',
            caption:   'Metro Beleg von gestern',
          },
        }],
      },
      field: 'messages',
    }],
  }],
};

const SAMPLE_BYTES = Buffer.from('JPEG_BYTES_SAMPLE');
const SAMPLE_SHA   = sha256Hex(SAMPLE_BYTES);

// ── Mocks: DB-Pool ─────────────────────────────────────────────────────────

interface ReceiptRow {
  receipt_id:      string;
  file_object_key: string;
  file_sha256:     string;
  payload:         { file?: { mime_type?: string; size_bytes?: number } };
}

const fakeDb = {
  receipts: [] as ReceiptRow[],
  audits:   [] as unknown[],

  reset() { this.receipts = []; this.audits = []; },

  query: vi.fn(async (sql: string, params: unknown[]) => {
    // resolve: customer_profiles JSONB-Lookup
    if (/customer_profiles/i.test(sql)) {
      const phoneNumberId = params[0] as string;
      if (phoneNumberId === '123456789012345') {
        return {
          rows: [{
            customer_id: 'cust_a3f4b2',
            integrations: {
              input_whatsapp: {
                phone_number_id: '123456789012345',
                allowed_senders: [
                  { name: 'Mario', phone: '+4917612345678', role: 'owner' },
                ],
              },
            },
          }],
        };
      }
      return { rows: [] };
    }

    // media: receipts-Lookup
    if (/FROM receipts/i.test(sql)) {
      const customerId = params[0] as string;
      const sha        = params[1] as string;
      return {
        rows: fakeDb.receipts.filter(
          (r) => r.file_sha256 === sha && customerId === 'cust_a3f4b2',
        ),
      };
    }

    // audit_log INSERT
    if (/INSERT INTO audit_log/i.test(sql)) {
      fakeDb.audits.push({ params });
      return { rows: [] };
    }

    return { rows: [] };
  }),
};

// ── Mock: Redis-Stub ───────────────────────────────────────────────────────

const fakeRedis = {
  xadd:        vi.fn(async () => '1-0'),
  disconnect:  vi.fn(),
  quit:        vi.fn(),
};

// ── Mock: Meta-Graph-Client ────────────────────────────────────────────────

const metaClient: MetaGraphClient = {
  getMediaMeta: vi.fn(async () => ({
    url:        'https://lookaside.fbsbx.com/test',
    mime_type:  'image/jpeg',
    sha256:     SAMPLE_SHA,
    file_size:  SAMPLE_BYTES.length,
  })),
  downloadMediaBytes:  vi.fn(async () => SAMPLE_BYTES),
  sendTemplateMessage: vi.fn(async () => ({ message_id: 'wamid.SENT' })),
};

// ── Test-Server ────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  // Minimaler Fastify-Server, um keinen DB/Redis-Connect zu erzwingen.
  app = Fastify({ logger: false });
  app.decorate('db',    fakeDb as never);
  app.decorate('redis', fakeRedis as never);
  app.decorate('s3',    {} as never);

  // rawBody-Parser wie in app.ts
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
      try {
        done(null, JSON.parse((body as Buffer).toString('utf-8')));
      } catch (err) {
        done(err as Error);
      }
    },
  );

  await app.register(m10WhatsAppRoutes, {
    prefix: '/api/v1/internal/whatsapp',
    metaClient,
    s3:     {} as never,
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  fakeDb.reset();
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('M10 E2E — kompletter Webhook-Flow', () => {
  it('verify → resolve → media → send-template', async () => {
    // 1) /verify
    const rawBody   = Buffer.from(JSON.stringify(WEBHOOK_PAYLOAD));
    const signature = 'sha256=' + createHmac('sha256', 'meta-app-secret-test').update(rawBody).digest('hex');

    const verifyRes = await app.inject({
      method: 'POST',
      url:    '/api/v1/internal/whatsapp/verify',
      headers: { 'content-type': 'application/json' },
      payload: { raw_body_b64: rawBody.toString('base64'), signature },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().ok).toBe(true);

    // Aus dem Payload extrahieren wie n8n es täte
    const message  = WEBHOOK_PAYLOAD.entry[0].changes[0].value.messages[0];
    const metadata = WEBHOOK_PAYLOAD.entry[0].changes[0].value.metadata;

    // 2) /resolve
    const resolveRes = await app.inject({
      method: 'POST',
      url:    '/api/v1/internal/whatsapp/resolve',
      headers: { 'content-type': 'application/json' },
      payload: { phone_number_id: metadata.phone_number_id, from: message.from },
    });
    expect(resolveRes.statusCode).toBe(200);
    const resolveBody = resolveRes.json();
    expect(resolveBody.data.allowed).toBe(true);
    expect(resolveBody.data.customer_id).toBe('cust_a3f4b2');
    expect(resolveBody.data.sender.name).toBe('Mario');

    // 3) /media — erster Aufruf, neue Datei
    const mediaRes1 = await app.inject({
      method: 'POST',
      url:    '/api/v1/internal/whatsapp/media',
      headers: { 'content-type': 'application/json' },
      payload: { media_id: message.image!.id, customer_id: resolveBody.data.customer_id },
    });
    expect(mediaRes1.statusCode).toBe(200);
    const mediaBody1 = mediaRes1.json();
    expect(mediaBody1.data.is_duplicate).toBe(false);
    expect(mediaBody1.data.sha256).toBe(SAMPLE_SHA);
    expect(mediaBody1.data.object_key).toMatch(/^cust_a3f4b2\/originals\/\d{4}\/\d{2}\/.*\.jpg$/);

    // Idempotenz: Receipt anlegen wie es WF-MASTER-RECEIPT täte
    fakeDb.receipts.push({
      receipt_id:      '01HVZTESTRECEIPT',
      file_object_key: mediaBody1.data.object_key,
      file_sha256:     mediaBody1.data.sha256,
      payload:         { file: { mime_type: 'image/jpeg', size_bytes: SAMPLE_BYTES.length } },
    });

    // 3b) /media — gleicher Beleg nochmal → is_duplicate:true, kein neuer Upload
    const mediaRes2 = await app.inject({
      method: 'POST',
      url:    '/api/v1/internal/whatsapp/media',
      headers: { 'content-type': 'application/json' },
      payload: { media_id: message.image!.id, customer_id: resolveBody.data.customer_id },
    });
    expect(mediaRes2.statusCode).toBe(200);
    expect(mediaRes2.json().data.is_duplicate).toBe(true);
    expect(mediaRes2.json().data.object_key).toBe(mediaBody1.data.object_key);

    // 4) /send-template — Bestätigung
    const sendRes = await app.inject({
      method: 'POST',
      url:    '/api/v1/internal/whatsapp/send-template',
      headers: { 'content-type': 'application/json' },
      payload: {
        customer_id:   resolveBody.data.customer_id,
        to:            '+4917612345678',
        template_name: 'confirmation_received_de',
      },
    });
    expect(sendRes.statusCode).toBe(200);
    expect(sendRes.json().data.message_id).toBe('wamid.SENT');
    expect(metaClient.sendTemplateMessage).toHaveBeenCalledOnce();
  });

  it('Sender nicht im allowed_senders → allowed:false, kein Media-Pull', async () => {
    const resolveRes = await app.inject({
      method: 'POST',
      url:    '/api/v1/internal/whatsapp/resolve',
      headers: { 'content-type': 'application/json' },
      payload: { phone_number_id: '123456789012345', from: '4915155555555' },
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().data.allowed).toBe(false);
    expect(resolveRes.json().data.reason).toBe('sender_not_whitelisted');

    // n8n bricht in diesem Branch ab, kein /media-Call
    expect(metaClient.getMediaMeta).not.toHaveBeenCalled();
    expect(metaClient.downloadMediaBytes).not.toHaveBeenCalled();
  });

  it('unbekannte phone_number_id → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/internal/whatsapp/resolve',
      headers: { 'content-type': 'application/json' },
      payload: { phone_number_id: 'unknown-id', from: '4917612345678' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('ungültige Webhook-Signatur → 401 INVALID_SIGNATURE', async () => {
    const rawBody = Buffer.from(JSON.stringify(WEBHOOK_PAYLOAD));
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/internal/whatsapp/verify',
      headers: { 'content-type': 'application/json' },
      payload: { raw_body_b64: rawBody.toString('base64'), signature: 'sha256=' + 'a'.repeat(64) },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_SIGNATURE');
  });
});
