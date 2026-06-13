/**
 * T048/F2 — Pilot-Kategorisierung für die belege-Welt.
 *
 * Schlanker KI-Categorizer (Pilot-Minimal, CLAUDE.md §3.3/§3.6): ordnet einen
 * Beleg anhand seiner OCR-Felder genau EINER System-Kategorie + SKR-Konto zu.
 *
 * Bewusst OHNE die alte 3-Strategien-M03-Logik (Overrides/Stammdaten/DB-Cache) —
 * die hängt an Geister-Tabellen (suppliers_global, customer_categories,
 * categorization_cache) und ist Post-Pilot (CLAUDE.md §3.4).
 *
 * - Kategorien-Quelle: SYSTEM_CATEGORIES (in-memory).
 * - Claude via @anthropic-ai/sdk (tool-use, Modell CLAUDE_MODEL).
 * - Ohne konfigurierten API-Key → deterministischer Fallback (confidence 0 →
 *   der Handler setzt den Beleg auf 'requires_review', Mensch entscheidet).
 * - `client` ist injizierbar (Tests mocken ohne echten API-Call).
 */

import { config } from '../../../core/config';
import { logger } from '../../../core/logger';
import {
  FALLBACK_CATEGORY_ID,
  SYSTEM_CATEGORIES,
  type SkrChart,
  findCategory,
  isKnownCategory,
  skrAccountFor,
} from '../system-categories';

// ── Anthropic-Client-Abstraktion (für Mock-Injection in Tests) ────────────────
export interface AnthropicMessageResponse {
  content: Array<{ type: string; name?: string; input?: unknown }>;
}
export interface AnthropicLikeClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system?: string;
      tools?: unknown[];
      tool_choice?: unknown;
      messages: Array<{ role: 'user'; content: string }>;
    }): Promise<AnthropicMessageResponse>;
  };
}

export interface BelegCategorizerInput {
  supplierName?: string | null;
  documentDate?: string | null;
  totalGross?: number | null;
  currency?: string | null;
  taxLines?: Array<{ rate: number; amount: number }>;
  lineItems?: Array<{ description?: string; total?: number }>;
  /** Hinweis aus dem OCR-Bewirtungs-Detektor (payload.bewirtung). */
  isBewirtung?: boolean;
}

export type CategorizerEngine = 'claude' | 'fallback';

export interface BelegCategorizationResult {
  categoryId: string;
  categoryLabel: string;
  skrAccount: string | null;
  skrChart: SkrChart;
  confidence: number;
  rationale: string;
  engine: CategorizerEngine;
}

const CATEGORY_IDS = SYSTEM_CATEGORIES.map((c) => c.id);

const SYSTEM_PROMPT = [
  'Du bist ein Buchhaltungs-Assistent für deutsche Gastronomie-Kleinunternehmer.',
  'Ordne den Eingangsbeleg GENAU EINER der vorgegebenen Kategorien zu (category_id).',
  'Gastro-Spezialfälle: Lebensmittel/Getränke-Einkauf = wareneinkauf_food;',
  'Restaurant-/Bewirtungsbelege = bewirtung; Strom/Gas/Wasser = betriebskosten_energie.',
  'Gib eine realistische confidence (0..1) und eine kurze rationale (1 Satz, deutsch).',
  'Wenn du unsicher bist, wähle sonstige_aufwand mit niedriger confidence.',
].join(' ');

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    category_id: { type: 'string', enum: CATEGORY_IDS },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    rationale: { type: 'string' },
  },
  required: ['category_id', 'confidence', 'rationale'],
} as const;

function buildUserMessage(input: BelegCategorizerInput): string {
  const lines: string[] = ['Beleg-Daten:'];
  if (input.supplierName) lines.push(`Lieferant: ${input.supplierName}`);
  if (input.documentDate) lines.push(`Datum: ${input.documentDate}`);
  if (typeof input.totalGross === 'number')
    lines.push(`Bruttobetrag: ${input.totalGross} ${input.currency ?? 'EUR'}`);
  if (input.taxLines?.length)
    lines.push(`MwSt-Sätze: ${input.taxLines.map((t) => `${t.rate}%`).join(', ')}`);
  if (input.lineItems?.length) {
    const items = input.lineItems
      .slice(0, 15)
      .map((i) => `- ${i.description ?? '?'}${typeof i.total === 'number' ? ` (${i.total})` : ''}`)
      .join('\n');
    lines.push(`Positionen:\n${items}`);
  }
  if (input.isBewirtung)
    lines.push(
      'Hinweis: Der OCR-Bewirtungs-Detektor hat einen Restaurant-/Bewirtungsbeleg erkannt.',
    );
  lines.push('\nVerfügbare Kategorien:');
  for (const c of SYSTEM_CATEGORIES) lines.push(`- ${c.id}: ${c.name}`);
  return lines.join('\n');
}

function buildResult(
  categoryId: string,
  confidence: number,
  rationale: string,
  skrChart: SkrChart,
  engine: CategorizerEngine,
): BelegCategorizationResult {
  const cat = findCategory(categoryId) ?? findCategory(FALLBACK_CATEGORY_ID);
  const id = cat?.id ?? FALLBACK_CATEGORY_ID;
  return {
    categoryId: id,
    categoryLabel: cat?.name ?? 'Sonstige Aufwendungen',
    skrAccount: skrAccountFor(id, skrChart),
    skrChart,
    confidence: Math.max(0, Math.min(1, confidence)),
    rationale,
    engine,
  };
}

function parseToolUse(
  resp: AnthropicMessageResponse,
): { category_id: string; confidence: number; rationale: string } | null {
  const block = resp.content?.find((c) => c.type === 'tool_use' && c.name === 'categorize_beleg');
  const input = block?.input as
    | { category_id?: unknown; confidence?: unknown; rationale?: unknown }
    | undefined;
  if (!input || typeof input.category_id !== 'string') return null;
  return {
    category_id: input.category_id,
    confidence: typeof input.confidence === 'number' ? input.confidence : 0.5,
    rationale: typeof input.rationale === 'string' ? input.rationale : '',
  };
}

export interface CategorizeBelegOpts {
  /** Injizierbarer Anthropic-Client (Tests). Ohne → echter Client via createAnthropicClient(). */
  client?: AnthropicLikeClient;
  skrChart?: SkrChart;
  model?: string;
}

/**
 * Kategorisiert einen Beleg. Wirft NICHT — bei jedem Problem (kein Key, API-Fehler,
 * ungültige Antwort) kommt ein Fallback mit confidence 0 zurück, den der Handler
 * in 'requires_review' übersetzt.
 */
export async function categorizeBeleg(
  input: BelegCategorizerInput,
  opts: CategorizeBelegOpts = {},
): Promise<BelegCategorizationResult> {
  const skrChart = opts.skrChart ?? 'SKR03';
  const client = opts.client ?? (await createAnthropicClient());

  if (!client) {
    logger.warn(
      'belege-categorizer: kein Anthropic-Client (CLAUDE_API_KEY fehlt) — Fallback → requires_review',
    );
    return buildResult(
      FALLBACK_CATEGORY_ID,
      0,
      'Keine KI konfiguriert — manuelle Prüfung nötig.',
      skrChart,
      'fallback',
    );
  }

  try {
    const resp = await client.messages.create({
      model: opts.model ?? config.CLAUDE_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'categorize_beleg',
          description: 'Ordnet den Beleg einer System-Kategorie zu.',
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'categorize_beleg' },
      messages: [{ role: 'user', content: buildUserMessage(input) }],
    });
    const parsed = parseToolUse(resp);
    if (!parsed || !isKnownCategory(parsed.category_id)) {
      logger.warn(
        { parsed },
        'belege-categorizer: ungültige KI-Antwort — Fallback → requires_review',
      );
      return buildResult(
        FALLBACK_CATEGORY_ID,
        0,
        'KI-Antwort unbrauchbar — manuelle Prüfung nötig.',
        skrChart,
        'fallback',
      );
    }
    return buildResult(parsed.category_id, parsed.confidence, parsed.rationale, skrChart, 'claude');
  } catch (err) {
    logger.error(
      { err },
      'belege-categorizer: Claude-Aufruf fehlgeschlagen — Fallback → requires_review',
    );
    return buildResult(
      FALLBACK_CATEGORY_ID,
      0,
      'KI-Aufruf fehlgeschlagen — manuelle Prüfung nötig.',
      skrChart,
      'fallback',
    );
  }
}

/**
 * Erstellt den echten Anthropic-Client (lazy import, damit Tests/CI ohne SDK
 * importieren können). Gibt null zurück, wenn kein CLAUDE_API_KEY gesetzt ist.
 */
let cachedClient: AnthropicLikeClient | null | undefined;
export async function createAnthropicClient(): Promise<AnthropicLikeClient | null> {
  if (cachedClient !== undefined) return cachedClient;
  if (!config.CLAUDE_API_KEY) {
    cachedClient = null;
    return null;
  }
  const mod = await import('@anthropic-ai/sdk');
  const Anthropic = (mod as { default: new (opts: { apiKey: string }) => AnthropicLikeClient })
    .default;
  cachedClient = new Anthropic({ apiKey: config.CLAUDE_API_KEY });
  return cachedClient;
}

/** Test-Only: Client-Cache zurücksetzen. */
export function __resetCategorizerClientForTests(): void {
  cachedClient = undefined;
}
