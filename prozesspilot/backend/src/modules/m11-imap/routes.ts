/**
 * M11 — IMAP-Polling-Routen
 *
 * Interner Endpunkt (n8n → Backend):
 *   POST /api/v1/internal/imap/poll
 *
 * Ablauf:
 *   1. Alle Kunden-Profile mit IMAP-Konfiguration laden
 *   2. Pro Kunde: neue Anhänge via IMAP abrufen
 *   3. Anhänge nach MinIO hochladen
 *   4. Receipt-Datensatz anlegen (status: 'received')
 *   5. Ergebnisliste zurückgeben → n8n startet pro Datei WF-MASTER-RECEIPT
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID }          from 'crypto';
import { logger }              from '../../core/logger';
import { apiError, apiOk }    from '../../core/schemas/common';
import { createS3Client, uploadObject } from '../../core/storage/storage.service';
import { fetchNewAttachments, type ImapConfig } from './imap.service';

interface ImapPollResult {
  customer_id:  string;
  receipt_id:   string;
  storage_key:  string;
  mime_type:    string;
  filename:     string;
  trace_id:     string;
  email_from:   string;
  email_subject: string;
}

export async function m11ImapRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/internal/imap/poll
  app.post('/poll', async (req, reply) => {
    const s3 = createS3Client();
    const results: ImapPollResult[] = [];
    const errors: { customer_id: string; error: string }[] = [];

    // 1. Alle Profile mit IMAP-Konfiguration laden
    const { rows } = await app.db.query<{
      customer_id: string;
      tenant_id:   string;
      integrations: Record<string, unknown>;
    }>(
      `SELECT cp.customer_id, c.tenant_id, cp.integrations
         FROM customer_profiles cp
         JOIN customers c ON c.id = cp.customer_id
        WHERE cp.integrations->>'imap' IS NOT NULL
          AND cp.integrations->'imap'->>'host' != ''
          AND cp.integrations->'imap'->>'user' != ''
          AND cp.integrations->'imap'->>'password' != ''`,
    );

    logger.info({ count: rows.length }, 'IMAP: Polling für Kunden');

    for (const row of rows) {
      const imapCfg = row.integrations['imap'] as ImapConfig;
      if (!imapCfg?.host || !imapCfg?.user || !imapCfg?.password) continue;

      try {
        // 2. Neue Anhänge abrufen
        const attachments = await fetchNewAttachments(imapCfg);
        logger.info({ customer_id: row.customer_id, count: attachments.length }, 'IMAP: Anhänge gefunden');

        for (const att of attachments) {
          const traceId    = randomUUID();
          const receiptId  = randomUUID();
          const storageKey = `${row.tenant_id}/${row.customer_id}/imap/${receiptId}/${att.filename}`;

          // 3. Anhang nach MinIO hochladen
          await uploadObject(s3, storageKey, att.buffer, att.mimeType);

          // 4. Receipt anlegen (status: received)
          await app.db.query(
            `INSERT INTO receipts
               (id, tenant_id, customer_id, status, file_name, mime_type,
                file_size_bytes, storage_key, source, created_at, updated_at)
             VALUES ($1, $2, $3, 'received', $4, $5, $6, $7, $8::jsonb, now(), now())
             ON CONFLICT (id) DO NOTHING`,
            [
              receiptId,
              row.tenant_id,
              row.customer_id,
              att.filename,
              att.mimeType,
              att.buffer.length,
              storageKey,
              JSON.stringify({
                channel:     'email',
                external_id: att.messageUid,
                email_from:  att.emailFrom,
                trace_id:    traceId,
              }),
            ],
          );

          results.push({
            customer_id:   row.customer_id,
            receipt_id:    receiptId,
            storage_key:   storageKey,
            mime_type:     att.mimeType,
            filename:      att.filename,
            trace_id:      traceId,
            email_from:    att.emailFrom,
            email_subject: att.emailSubject,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err, customer_id: row.customer_id }, 'IMAP: Polling-Fehler');
        errors.push({ customer_id: row.customer_id, error: msg });
      }
    }

    return reply.send(apiOk({
      processed: results.length,
      customers_checked: rows.length,
      receipts: results,
      errors,
    }));
  });

  // GET /api/v1/internal/imap/status — Übersicht welche Kunden IMAP haben
  app.get('/status', async (req, reply) => {
    const { rows } = await app.db.query<{
      customer_id:   string;
      display_name:  string;
      imap_host:     string;
      imap_user:     string;
    }>(
      `SELECT cp.customer_id,
              cp.custom->>'display_name'      AS display_name,
              cp.integrations->'imap'->>'host' AS imap_host,
              cp.integrations->'imap'->>'user' AS imap_user
         FROM customer_profiles cp
        WHERE cp.integrations->>'imap' IS NOT NULL
          AND cp.integrations->'imap'->>'host' != ''`,
    );

    return reply.send(apiOk({ customers: rows }));
  });
}
