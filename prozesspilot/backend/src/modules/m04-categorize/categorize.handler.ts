/**
 * M04 — POST /api/v1/receipts/:id/categorize
 *
 * Nutzt Anthropic Claude SDK, um aus dem OCR-Text Belege zu kategorisieren.
 * Falls CLAUDE_API_KEY leer ist, wird ein Mock-Ergebnis zurückgegeben.
 *
 * Ablauf:
 *  1) Receipt laden, prüfen, dass es zum Tenant gehört
 *  2) OCR-Text aus metadata.ocr_text holen
 *  3) Claude-Call mit System-Prompt (oder Mock)
 *  4) Ergebnis in metadata.categorization speichern
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import { config } from '../../core/config';
import { logger } from '../../core/logger';
import {
  apiError,
  apiOk,
  zodToApiError,
} from '../../core/schemas/common';
import { getReceipt } from '../receipts/receipt.repository';
import type { ReceiptResponse, ReceiptRow } from '../receipts/receipt.schema';
import {
  categorizationSchema,
  categorizeParamsSchema,
  type Category,
  type Categorization,
} from './categorize.schema';

const SYSTEM_PROMPT = `Du bist ein Buchhalter. Extrahiere aus dem Belegtext: category (eines von: Büromaterial, Reise, Bewirtung, Porto, Telekommunikation, Miete, Sonstiges), amount (Zahl), currency (EUR/USD etc), date (ISO), vendor (Lieferant). Antworte NUR als JSON ohne Erklärung.`;

const MOCK_RESULT: Categorization = {
  category:   'Büromaterial',
  amount:     0,
  currency:   'EUR',
  date:       null,
  vendor:     null,
  confidence: 0,
};

interface AnthropicLazyClient {
  messages: {
    create(req: unknown): Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

let cachedAnthropicClient: AnthropicLazyClient | null = null;

async function getAnthropicClient(): Promise<AnthropicLazyClient> {
  if (cachedAnthropicClient) return cachedAnthropicClient;
  const mod = await import('@anthropic-ai/sdk');
  const Ctor =
    (mod as { default?: new (opts: { apiKey: string }) => AnthropicLazyClient }).default ??
    (mod as { Anthropic?: new (opts: { apiKey: string }) => AnthropicLazyClient }).Anthropic;
  if (!Ctor) {
    throw new Error('Anthropic SDK kann nicht geladen werden.');
  }
  cachedAnthropicClient = new Ctor({ apiKey: config.CLAUDE_API_KEY });
  return cachedAnthropicClient;
}

const VALID_CATEGORIES: Category[] = [
  'Büromaterial',
  'Reise',
  'Bewirtung',
  'Porto',
  'Telekommunikation',
  'Miete',
  'Sonstiges',
];

function coerceCategorization(raw: unknown): Categorization {
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const rawCat = String(obj.category ?? 'Sonstiges');
  const category: Category = VALID_CATEGORIES.includes(rawCat as Category)
    ? (rawCat as Category)
    : 'Sonstiges';
  const amount = typeof obj.amount === 'number'
    ? obj.amount
    : Number.parseFloat(String(obj.amount ?? '0')) || 0;
  const currency = typeof obj.currency === 'string' ? obj.currency : 'EUR';
  const date = typeof obj.date === 'string' && obj.date.length > 0 ? obj.date : null;
  const vendor = typeof obj.vendor === 'string' && obj.vendor.length > 0 ? obj.vendor : null;
  const confidence = typeof obj.confidence === 'number'
    ? obj.confidence
    : 0.7;
  return { category, amount, currency, date, vendor, confidence };
}

function extractJsonBlock(text: string): unknown {
  // Versuche, ersten {...}-Block zu extrahieren
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Kein JSON-Objekt in Claude-Antwort gefunden.');
  }
  const jsonStr = text.slice(start, end + 1);
  return JSON.parse(jsonStr);
}

async function callClaude(ocrText: string): Promise<Categorization> {
  const client = await getAnthropicClient();
  const response = await client.messages.create({
    model:      config.CLAUDE_MODEL,
    max_tokens: 512,
    system:     SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: ocrText || '(kein Text verfügbar)' },
    ],
  });
  const textBlock = response.content.find((c) => c.type === 'text');
  const text = textBlock?.text ?? '';
  const parsed = extractJsonBlock(text);
  return coerceCategorization({ ...((parsed as object) ?? {}), confidence: 0.85 });
}

export function buildCategorizeHandler() {
  return async function categorizeHandler(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const parsed = categorizeParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send(zodToApiError(parsed.error));
    }
    const receiptId = parsed.data.id;
    const db: Pool = req.server.db;
    const tenantId = req.tenantId;

    const receipt = await getReceipt(db, tenantId, receiptId);
    if (!receipt) {
      return reply.code(404).send(
        apiError('NOT_FOUND', `Receipt ${receiptId} nicht gefunden.`),
      );
    }

    const ocrText = typeof receipt.metadata?.ocr_text === 'string'
      ? (receipt.metadata.ocr_text as string)
      : '';

    let categorization: Categorization = MOCK_RESULT;
    let mock = false;

    try {
      if (!config.CLAUDE_API_KEY) {
        categorization = MOCK_RESULT;
        mock = true;
      } else {
        categorization = await callClaude(ocrText);
      }
    } catch (err) {
      logger.error({ err, receiptId, tenantId }, 'M04 Categorize fehlgeschlagen');
      return reply.code(502).send(
        apiError('CATEGORIZE_FAILED', 'Kategorisierung fehlgeschlagen.', {
          message: (err as Error).message,
        }),
      );
    }

    // Validate before persisting
    const validated = categorizationSchema.parse(categorization);

    const newMetadata = {
      ...(receipt.metadata ?? {}),
      categorization: validated,
    };

    const { rows } = await db.query<ReceiptRow>(
      `
      UPDATE receipts
      SET metadata = $3, updated_at = now()
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, tenant_id, customer_id, status, original_name, mime_type,
                storage_key, file_size_bytes, file_sha256, source, metadata,
                error_message, created_at, updated_at
      `,
      [receiptId, tenantId, JSON.stringify(newMetadata)],
    );

    if (!rows[0]) {
      return reply.code(404).send(
        apiError('NOT_FOUND', `Receipt ${receiptId} nicht gefunden.`),
      );
    }

    const updated: ReceiptResponse = {
      id:              rows[0].id,
      tenant_id:       rows[0].tenant_id,
      customer_id:     rows[0].customer_id,
      status:          rows[0].status as ReceiptResponse['status'],
      original_name:   rows[0].original_name,
      mime_type:       rows[0].mime_type,
      storage_key:     rows[0].storage_key,
      file_size_bytes: rows[0].file_size_bytes,
      file_sha256:     rows[0].file_sha256,
      source:          rows[0].source as ReceiptResponse['source'],
      metadata:        rows[0].metadata,
      error_message:   rows[0].error_message,
      created_at:      rows[0].created_at.toISOString(),
      updated_at:      rows[0].updated_at.toISOString(),
    };

    return reply.send(
      apiOk({
        receipt:        updated,
        categorization: validated,
        mock,
      }),
    );
  };
}
