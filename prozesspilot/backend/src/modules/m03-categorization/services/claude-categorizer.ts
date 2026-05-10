/**
 * M03 — claude-categorizer.ts
 *
 * Strategie 3 nach M03-Spec §7.1: Claude-Fallback.
 * Implementierung exakt nach M03-Spec §8 (Tool-Use mit `categorize_receipt`).
 *
 * Caching nach §8.5:
 *   1. Cache-Key = sha256(system_prompt + user_message)
 *   2. Lookup: Redis  GET  pp:cat:cache:{key}
 *   3. Fallback DB:   SELECT result FROM categorization_cache WHERE cache_key = $1 AND expires_at > now()
 *   4. Cache-Hit  → engine = 'claude_cached', kein API-Call
 *   5. Cache-Miss → API-Call, Ergebnis in beiden Caches ablegen (TTL 30 Tage)
 *
 * Fehlerbehandlung nach §12:
 *   - 5xx / Timeout → 2× Retry (200ms, 800ms), dann Fallback:
 *       { category: 'sonstige_aufwand', confidence: 0.5, engine: 'fallback_after_error' }
 *   - Ungültiges Tool-Use JSON → 1× Re-Prompt mit "respond ONLY via tool",
 *     sonst Receipt → requires_review (Handler entscheidet das).
 *
 * Modell: CLAUDE_MODEL aus ENV, Default 'claude-sonnet-4-6'.
 *
 * Hinweis zur Test-Injektion:
 *   Diese Datei exportiert eine Factory `createClaudeCategorizer({...})`,
 *   damit Tests einen Mock-Anthropic-Client und Mock-Redis übergeben können.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Redis from 'ioredis';
import type { Pool } from 'pg';

import { logger } from '../../../core/logger';
import type { CategorizationContext, CategorizationResult } from './types';

// ── Konstanten ───────────────────────────────────────────────────────────────

const CACHE_TTL_DAYS = Number(process.env.M03_CACHE_TTL_DAYS ?? '30');
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
const REDIS_KEY_PREFIX = 'pp:cat:cache:';
const DEFAULT_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';

const SYSTEM_PROMPT = (() => {
  // Prompt liegt als .md neben den Services.
  // __dirname zur Laufzeit (tsx) ist src/modules/m03-categorization/services
  try {
    return readFileSync(join(__dirname, '..', 'prompts', 'categorize.system.md'), 'utf-8');
  } catch {
    // Fallback inline (Test-Sicherheit, falls Datei nicht erreichbar)
    return [
      'Du bist ein Buchhaltungs-Assistent. Du kategorisierst Belege für ein Gastronomieunternehmen',
      'nach den vorgegebenen Kategorien und SKR-Konten.',
      '',
      'Antworte AUSSCHLIESSLICH über das Tool `categorize_receipt`.',
      'Wenn du dir unsicher bist, gib eine niedrigere Confidence (< 0.75) zurück und schreibe in',
      '`rationale`, was unklar ist.',
    ].join('\n');
  }
})();

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: [
        'wareneinkauf_food',
        'wareneinkauf_drink',
        'betriebskosten_energie',
        'betriebskosten_wasser',
        'miete',
        'reinigung',
        'wartung',
        'personal',
        'fortbildung',
        'versicherung',
        'kfz',
        'werbung',
        'beratung',
        'sonstige_aufwand',
      ],
    },
    category_label: { type: 'string' },
    skr_account: { type: 'string', pattern: '^\\d{3,5}$' },
    tax_key: { type: 'string' },
    cost_center: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    rationale: { type: 'string', maxLength: 500 },
  },
  required: ['category', 'category_label', 'skr_account', 'tax_key', 'confidence', 'rationale'],
} as const;

const FALLBACK_RESULT: CategorizationResult = {
  engine: 'fallback_after_error',
  confidence: 0.5,
  category: 'sonstige_aufwand',
  category_label: 'Sonstige Betriebskosten',
  skr_account: '4980',
  tax_key: '',
  cost_center: null,
  rationale: 'Claude-API nicht verfügbar — Fallback auf sonstige_aufwand.',
};

// ── Anthropic-Client-Abstraktion (für Mock-Injection) ────────────────────────

export interface AnthropicMessageInput {
  model: string;
  max_tokens: number;
  system: string;
  tools: Array<{ name: string; description?: string; input_schema: unknown }>;
  tool_choice?: { type: 'tool'; name: string };
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AnthropicMessageResponse {
  content: Array<
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'text'; text: string }
  >;
  stop_reason?: string;
}

export interface AnthropicLikeClient {
  messages: { create(params: AnthropicMessageInput): Promise<AnthropicMessageResponse> };
}

// ── Service ──────────────────────────────────────────────────────────────────

export interface ClaudeCategorizerDeps {
  pool: Pool;
  redis?: Redis;
  client?: AnthropicLikeClient;
  /** Override für Tests (sonst CLAUDE_MODEL aus ENV). */
  model?: string;
  /** Sleep-Funktion für Tests injizierbar. */
  sleepMs?: (ms: number) => Promise<void>;
}

export interface CategorizeRequest {
  context: CategorizationContext;
  customerId: string;
  skrChart: 'SKR03' | 'SKR04';
  industryHint?: string;
  examples?: Array<{ supplier: string; category: string; skr?: string; items_pattern?: string }>;
}

export class ClaudeCategorizer {
  private readonly pool: Pool;
  private readonly redis?: Redis;
  private readonly client?: AnthropicLikeClient;
  private readonly model: string;
  private readonly sleepMs: (ms: number) => Promise<void>;

  constructor(deps: ClaudeCategorizerDeps) {
    this.pool = deps.pool;
    this.redis = deps.redis;
    this.client = deps.client;
    this.model = deps.model ?? DEFAULT_MODEL;
    this.sleepMs = deps.sleepMs ?? defaultSleep;
  }

  async categorize(req: CategorizeRequest): Promise<CategorizationResult> {
    const userMessage = buildUserMessage(req);
    const cacheKey = sha256Hex(`${SYSTEM_PROMPT}\n---\n${userMessage}\n---\nmodel=${this.model}`);

    // 1) Cache-Lookup (Redis → DB)
    const cached = await this.lookupCache(cacheKey);
    if (cached) {
      return { ...cached, engine: 'claude_cached' };
    }

    // 2) Wenn kein Anthropic-Client konfiguriert, Fallback (Tests / Dev ohne Key)
    if (!this.client) {
      logger.warn(
        'Kein Anthropic-Client konfiguriert — Claude-Categorizer fällt auf Fallback zurück',
      );
      return FALLBACK_RESULT;
    }

    // 3) API-Call mit Retry-Logik
    const result = await this.callClaudeWithRetry(userMessage);

    // 4) Speichern bei Erfolg (nicht bei Fallback)
    if (result.engine !== 'fallback_after_error') {
      await this.storeCache(cacheKey, result).catch((err) =>
        logger.warn({ err }, 'Categorization-Cache schreiben fehlgeschlagen'),
      );
    }

    return result;
  }

  private async callClaudeWithRetry(userMessage: string): Promise<CategorizationResult> {
    const RETRY_DELAYS_MS = [200, 800];
    let attempt = 0;
    let lastErr: Error | undefined;

    while (attempt <= RETRY_DELAYS_MS.length) {
      try {
        if (!this.client) throw new Error('Anthropic client nicht initialisiert');
        const resp = await this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: [
            {
              name: 'categorize_receipt',
              description: 'Kategorisiert einen Beleg und liefert das passende SKR-Konto.',
              input_schema: TOOL_INPUT_SCHEMA,
            },
          ],
          tool_choice: { type: 'tool', name: 'categorize_receipt' },
          messages: [{ role: 'user', content: userMessage }],
        });

        const parsed = parseToolUse(resp);
        if (parsed) {
          return {
            engine: 'claude_sonnet_4_6',
            engine_version: this.model,
            category: parsed.category,
            category_label: parsed.category_label,
            skr_account: parsed.skr_account,
            tax_key: parsed.tax_key,
            cost_center: parsed.cost_center ?? null,
            confidence: parsed.confidence,
            rationale: parsed.rationale,
          };
        }

        // Ungültige Antwort → 1× Re-Prompt
        const reResp = await this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: `${SYSTEM_PROMPT}\n\nRespond ONLY via the tool 'categorize_receipt'.`,
          tools: [
            {
              name: 'categorize_receipt',
              description: 'Kategorisiert einen Beleg und liefert das passende SKR-Konto.',
              input_schema: TOOL_INPUT_SCHEMA,
            },
          ],
          tool_choice: { type: 'tool', name: 'categorize_receipt' },
          messages: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: 'Bitte respond ONLY via tool.' },
            { role: 'user', content: userMessage },
          ],
        });
        const reParsed = parseToolUse(reResp);
        if (reParsed) {
          return {
            engine: 'claude_sonnet_4_6',
            engine_version: this.model,
            category: reParsed.category,
            category_label: reParsed.category_label,
            skr_account: reParsed.skr_account,
            tax_key: reParsed.tax_key,
            cost_center: reParsed.cost_center ?? null,
            confidence: reParsed.confidence,
            rationale: reParsed.rationale,
          };
        }
        // Spec: zweiter Fehlversuch → requires_review (Handler entscheidet
        // das später aufgrund der low confidence). Wir geben Fallback zurück.
        return FALLBACK_RESULT;
      } catch (err) {
        lastErr = err as Error;
        const httpStatus =
          (err as { status?: number; statusCode?: number }).status ??
          (err as { status?: number; statusCode?: number }).statusCode;
        const isRetryable = !httpStatus || httpStatus >= 500 || httpStatus === 429;
        if (!isRetryable) {
          logger.warn({ err, status: httpStatus }, 'Claude-API: nicht-retryable Fehler');
          return FALLBACK_RESULT;
        }
        if (attempt === RETRY_DELAYS_MS.length) break;
        await this.sleepMs(RETRY_DELAYS_MS[attempt]);
        attempt += 1;
      }
    }

    logger.warn({ err: lastErr }, 'Claude-API nach Retries fehlgeschlagen — Fallback');
    return FALLBACK_RESULT;
  }

  private async lookupCache(cacheKey: string): Promise<CategorizationResult | null> {
    // 1) Redis
    if (this.redis) {
      try {
        const v = await this.redis.get(`${REDIS_KEY_PREFIX}${cacheKey}`);
        if (v) return JSON.parse(v) as CategorizationResult;
      } catch (err) {
        logger.warn({ err }, 'Categorization-Cache (Redis) lesen fehlgeschlagen');
      }
    }
    // 2) DB-Fallback
    try {
      const { rows } = await this.pool.query<{ result: CategorizationResult }>(
        `SELECT result FROM categorization_cache
          WHERE cache_key = $1 AND expires_at > now()
          LIMIT 1`,
        [cacheKey],
      );
      if (rows[0]?.result) return rows[0].result;
    } catch (err) {
      logger.warn({ err }, 'Categorization-Cache (DB) lesen fehlgeschlagen');
    }
    return null;
  }

  private async storeCache(cacheKey: string, result: CategorizationResult): Promise<void> {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
    if (this.redis) {
      try {
        await this.redis.set(
          `${REDIS_KEY_PREFIX}${cacheKey}`,
          JSON.stringify(result),
          'PX',
          CACHE_TTL_MS,
        );
      } catch (err) {
        logger.warn({ err }, 'Categorization-Cache (Redis) schreiben fehlgeschlagen');
      }
    }
    try {
      await this.pool.query(
        `INSERT INTO categorization_cache (cache_key, result, expires_at)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (cache_key) DO UPDATE
           SET result = EXCLUDED.result, expires_at = EXCLUDED.expires_at, created_at = now()`,
        [cacheKey, JSON.stringify(result), expiresAt],
      );
    } catch (err) {
      logger.warn({ err }, 'Categorization-Cache (DB) schreiben fehlgeschlagen');
    }
  }
}

export function createClaudeCategorizer(deps: ClaudeCategorizerDeps): ClaudeCategorizer {
  return new ClaudeCategorizer(deps);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ToolInput {
  category: string;
  category_label: string;
  skr_account: string;
  tax_key: string;
  cost_center?: string | null;
  confidence: number;
  rationale: string;
}

function parseToolUse(resp: AnthropicMessageResponse): ToolInput | null {
  for (const block of resp.content ?? []) {
    if (block.type === 'tool_use' && block.name === 'categorize_receipt') {
      const input = block.input as Partial<ToolInput>;
      if (
        typeof input.category === 'string' &&
        typeof input.category_label === 'string' &&
        typeof input.skr_account === 'string' &&
        typeof input.tax_key === 'string' &&
        typeof input.confidence === 'number' &&
        typeof input.rationale === 'string'
      ) {
        return input as ToolInput;
      }
    }
  }
  return null;
}

export function buildUserMessage(req: CategorizeRequest): string {
  const c = req.context;
  const taxRatesPart =
    c.taxLines && c.taxLines.length > 0
      ? c.taxLines
          .map(
            (t) =>
              `${(t.rate * 100).toFixed(0)}% Anteil=${t.amount.toFixed(2)} (Basis ${t.base.toFixed(2)})`,
          )
          .join(', ')
      : 'keine MwSt-Angaben';

  const itemsPart =
    c.lineItems && c.lineItems.length > 0
      ? c.lineItems
          .slice(0, 20)
          .map((i) => {
            const desc = i.description ?? '–';
            const qty = i.qty ?? '?';
            const unit = i.unit_price ?? '?';
            return `  - ${desc} (${qty}x ${unit})`;
          })
          .join('\n')
      : '  - keine Positions-Daten';

  const examplesPart =
    req.examples && req.examples.length > 0
      ? req.examples
          .slice(0, 5)
          .map((e) => {
            const itemsPart = e.items_pattern ? ` mit Artikeln wie "${e.items_pattern}"` : '';
            const skrPart = e.skr ? ` / SKR ${e.skr}` : '';
            return `  - Lieferant "${e.supplier}"${itemsPart} → ${e.category}${skrPart}`;
          })
          .join('\n')
      : '  - Lieferant "Metro AG" → wareneinkauf_food / SKR03 3100\n  - Lieferant "Stadtwerke" → betriebskosten_energie / SKR03 4240';

  return [
    `Lieferant: ${c.supplierName ?? 'unbekannt'}`,
    `USt-ID: ${c.supplierVatId ?? '–'}`,
    `Datum: ${c.documentDate ?? '–'}`,
    `Brutto: ${c.totalGross ?? '–'} ${c.currency ?? 'EUR'}`,
    `MwSt-Sätze: ${taxRatesPart}`,
    'Positionen:',
    itemsPart,
    '',
    `Kontenrahmen: ${req.skrChart}`,
    `Branche: ${req.industryHint ?? '–'}`,
    req.examples && req.examples.length > 0
      ? 'Zusätzliche Beispiele für diesen Kunden:'
      : 'Bekannte Mappings für ähnliche Lieferanten:',
    examplesPart,
    '',
    'Bitte kategorisiere.',
  ].join('\n');
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
