/**
 * M01 — Claude-Fallback-Extraktor (M01 §9.1 Schritt 3)
 *
 * Wird vom field-extractor aufgerufen, wenn:
 *   - regex_confidence < 0.6  ODER
 *   - supplier_name leer
 *
 * Implementierung: @anthropic-ai/sdk Tool-Use (strict JSON-Schema-Tool).
 * Bei API-Fehler: loggen + { fields: {}, claude_confidence: 0 } zurückgeben
 * (kein Throw — Caller bleibt mit Regex-Result lebensfähig).
 *
 * Parameter:
 *   CLAUDE_API_KEY   aus ENV
 *   CLAUDE_MODEL     aus ENV (Default: claude-sonnet-4-6)
 */

import { config } from '../../../core/config';
import { logger } from '../../../core/logger';
import type { ExtractedFields } from './field-extractor';

export interface ClaudeExtractionResult {
  fields: Partial<ExtractedFields>;
  claude_confidence: number; // 0..1
}

const SYSTEM_PROMPT =
  'Du bist ein präziser Beleg-Extraktor. Antworte ausschließlich via Tool-Call.';

const TOOL_NAME = 'extract_receipt_fields';

// JSON-Schema des Tools — deckt alle extraction.fields.* aus 01 §2.1.
const TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    supplier_name: { type: 'string' },
    supplier_address: { type: 'string' },
    supplier_vat_id: { type: 'string' },
    document_number: { type: 'string' },
    document_date: { type: 'string', description: 'ISO 8601 YYYY-MM-DD' },
    document_type: { type: 'string', enum: ['invoice', 'receipt', 'credit_note', 'other'] },
    currency: { type: 'string', description: 'ISO 4217, z. B. EUR' },
    total_gross: { type: 'number' },
    total_net: { type: 'number' },
    tax_lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rate: { type: 'number', description: '0.19 / 0.07 / 0.0' },
          base: { type: 'number' },
          amount: { type: 'number' },
        },
        required: ['rate', 'base', 'amount'],
      },
    },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          qty: { type: 'number' },
          unit_price: { type: 'number' },
          total: { type: 'number' },
          tax_rate: { type: 'number' },
        },
        required: ['description'],
      },
    },
    payment_method: { type: 'string' },
    confidence: { type: 'number', description: 'Eigene Selbsteinschätzung 0..1' },
  },
  required: [],
} as const;

// Lazy-Import des SDK, damit das Modul auch ohne installiertes Paket
// (z. B. in Tests, die den Aufruf mocken) importiert werden kann.
type AnthropicCtor = new (opts: { apiKey: string }) => {
  messages: {
    create(req: unknown): Promise<unknown>;
  };
};

let cachedClient: InstanceType<AnthropicCtor> | null = null;

async function getClient(): Promise<InstanceType<AnthropicCtor> | null> {
  if (cachedClient) return cachedClient;
  if (!config.CLAUDE_API_KEY) return null;
  // Dynamischer Import — wird erst geladen, wenn ein CLAUDE_API_KEY gesetzt ist.
  const mod = await import('@anthropic-ai/sdk');
  // SDK exportiert Default und named — wir nehmen Default.
  const Anthropic =
    ((mod as { default?: AnthropicCtor }).default as AnthropicCtor) ??
    (mod as unknown as { Anthropic: AnthropicCtor }).Anthropic;
  cachedClient = new Anthropic({ apiKey: config.CLAUDE_API_KEY });
  return cachedClient;
}

export async function extractWithClaude(rawText: string): Promise<ClaudeExtractionResult> {
  const client = await getClient().catch((err) => {
    logger.warn({ err }, 'Anthropic SDK konnte nicht geladen werden');
    return null;
  });

  if (!client) {
    return { fields: {}, claude_confidence: 0 };
  }

  try {
    const response = (await client.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: 'Extrahiert strukturierte Belegfelder aus Rohtext.',
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: rawText.slice(0, 12000) /* sicheres Tokenlimit */ }],
    })) as {
      content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }>;
    };

    const toolUse = (response.content ?? []).find(
      (b) => b.type === 'tool_use' && b.name === TOOL_NAME,
    );
    if (!toolUse?.input) {
      return { fields: {}, claude_confidence: 0 };
    }
    const input = toolUse.input as ExtractedFields & { confidence?: number };
    const claude_confidence =
      typeof input.confidence === 'number'
        ? Math.max(0, Math.min(1, input.confidence))
        : estimateConfidenceFromFields(input);
    (input as { confidence?: number }).confidence = undefined;
    return { fields: input, claude_confidence };
  } catch (err) {
    logger.warn({ err }, 'Claude-API-Fehler im Field-Extractor — fahre ohne Claude fort');
    return { fields: {}, claude_confidence: 0 };
  }
}

function estimateConfidenceFromFields(fields: Partial<ExtractedFields>): number {
  const required: Array<keyof ExtractedFields> = ['supplier_name', 'document_date', 'total_gross'];
  const present = required.filter((k) => {
    const v = fields[k];
    return v !== undefined && v !== null && v !== '';
  }).length;
  return present / required.length;
}
