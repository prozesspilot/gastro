/**
 * M01 — Mindee Adapter (Phase 3, Pro-Paket).
 *
 * Nutzt das offizielle `mindee` SDK (Client v1) und das InvoiceV4-Produkt,
 * um strukturierte Rechnungsdaten zu extrahieren. Das Resultat wird auf
 * die gemeinsame OcrResult-Form gemappt (raw_text + optional fields), so
 * dass der Konsument denselben Code wie für GoogleVisionAdapter verwenden
 * kann.
 *
 * Authentifizierung: API-Key aus ENV MINDEE_API_KEY.
 */

import { logger } from '../../logger';
import type { OcrAdapter, OcrFields, OcrResult } from './adapter.interface';

// ── Lazy SDK-Loader (analog zum Google-Vision-Adapter) ───────────────────────

interface MindeeFieldLike {
  value?: string | number | boolean | null;
  confidence?: number;
}

interface MindeeTaxLike {
  rate?: number | null;
  value?: number | null;
  confidence?: number;
}

interface MindeeInvoiceV4Document {
  supplierName?: MindeeFieldLike;
  supplierAddress?: MindeeFieldLike;
  supplierCompanyRegistrations?: MindeeFieldLike[];
  supplierPaymentDetails?: MindeeFieldLike[];
  invoiceNumber?: MindeeFieldLike;
  date?: MindeeFieldLike;
  dueDate?: MindeeFieldLike;
  totalNet?: MindeeFieldLike;
  totalAmount?: MindeeFieldLike;
  totalTax?: MindeeFieldLike;
  taxes?: MindeeTaxLike[];
  locale?: { currency?: string; confidence?: number };
}

interface MindeeInference {
  prediction?: MindeeInvoiceV4Document;
  pages?: Array<{ prediction?: MindeeInvoiceV4Document }>;
  product?: { name?: string; version?: string };
}

interface MindeeDocument {
  inference?: MindeeInference;
  ocr?: { mvisionV1?: { pages?: Array<{ allWords?: { content?: string } }> } };
}

interface MindeePredictResponse<_T> {
  document?: MindeeDocument;
}

interface MindeeBufferInputCtor {
  new (props: { buffer: Buffer; filename: string }): unknown;
}

interface MindeeClientLike {
  parse<T>(
    productClass: unknown,
    source: unknown,
    params?: unknown,
  ): Promise<MindeePredictResponse<T>>;
}

interface MindeeClientCtor {
  new (opts: { apiKey: string }): MindeeClientLike;
}

interface MindeeSdkModule {
  Client?: MindeeClientCtor;
  BufferInput?: MindeeBufferInputCtor;
  v1?: {
    Client: MindeeClientCtor;
    product: { InvoiceV4: unknown };
  };
  product?: { InvoiceV4?: unknown };
}

let cachedClient: MindeeClientLike | null = null;
let cachedSdk: MindeeSdkModule | null = null;

async function loadSdk(): Promise<MindeeSdkModule> {
  if (cachedSdk) return cachedSdk;
  cachedSdk = (await import('mindee')) as unknown as MindeeSdkModule;
  return cachedSdk;
}

function getApiKey(override?: string): string {
  // Priorität: 1) per-customer key aus ocrConfig, 2) globale ENV
  const key = override ?? process.env.MINDEE_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error(
      'Kein Mindee API-Key konfiguriert. ' +
        'Entweder MINDEE_API_KEY in .env setzen oder im Kundenprofil unter ' +
        '"OCR / Extraktion" → "Mindee API-Key" eintragen.',
    );
  }
  return key;
}

async function getMindeeClient(apiKeyOverride?: string): Promise<MindeeClientLike> {
  // Wenn ein kundeneigener Key übergeben wird, niemals den Cache nutzen
  if (apiKeyOverride) {
    const sdk = await loadSdk();
    const ClientCtor = sdk.v1?.Client ?? sdk.Client;
    if (!ClientCtor) throw new Error('Mindee-SDK liefert keinen Client.');
    return new ClientCtor({ apiKey: getApiKey(apiKeyOverride) });
  }
  if (cachedClient) return cachedClient;
  const sdk = await loadSdk();
  const ClientCtor = sdk.v1?.Client ?? sdk.Client;
  if (!ClientCtor) {
    throw new Error('Mindee-SDK liefert keinen Client — bitte `mindee` Paket prüfen.');
  }
  cachedClient = new ClientCtor({ apiKey: getApiKey() });
  return cachedClient;
}

function resolveInvoiceProduct(sdk: MindeeSdkModule): unknown {
  const candidate = sdk.v1?.product?.InvoiceV4 ?? sdk.product?.InvoiceV4 ?? null;
  if (!candidate) {
    throw new Error('Mindee-SDK: InvoiceV4 Produkt nicht gefunden.');
  }
  return candidate;
}

function resolveBufferInput(sdk: MindeeSdkModule): MindeeBufferInputCtor {
  const ctor = sdk.BufferInput;
  if (!ctor) {
    throw new Error('Mindee-SDK: BufferInput-Konstruktor nicht gefunden.');
  }
  return ctor;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

/** Test-Hook: erlaubt Tests, einen Fake-SDK-Modul zu injizieren. */
export function __setMindeeSdkForTests(mod: MindeeSdkModule | null): void {
  cachedSdk = mod;
  cachedClient = null;
}

/** Test-Hook: erlaubt Tests, einen Client direkt zu setzen. */
export function __setMindeeClientForTests(client: MindeeClientLike | null): void {
  cachedClient = client;
}

interface MindeeAdapterConfig {
  filename?: string;
  /** Per-Kundenspezifischer API-Key (überschreibt globales MINDEE_API_KEY). */
  api_key?: string;
}

export class MindeeAdapter implements OcrAdapter {
  readonly id = 'mindee' as const;
  readonly version = 'v1';

  async extract(bytes: Buffer, cfg: Record<string, unknown> = {}): Promise<OcrResult> {
    const adapterCfg = cfg as MindeeAdapterConfig;
    const filename = adapterCfg.filename ?? 'document.pdf';
    const apiKeyOverride = adapterCfg.api_key;

    // API-Key prüfen, bevor wir das SDK laden — saubere Fehlermeldung.
    getApiKey(apiKeyOverride);

    const sdk = await loadSdk();
    const InvoiceV4 = resolveInvoiceProduct(sdk);
    const BufferInput = resolveBufferInput(sdk);
    const client = await getMindeeClient(apiKeyOverride);

    const source = new BufferInput({ buffer: bytes, filename });

    logger.debug({ size: bytes.length, filename }, 'Mindee: parse Invoice');
    const response = await client.parse(InvoiceV4, source);

    const prediction = response.document?.inference?.prediction;
    if (!prediction) {
      throw new Error('Mindee: leere Antwort — keine Prediction enthalten.');
    }

    const fields = mapMindeeToOcrFields(prediction);
    const confidence = computeAverageConfidence(prediction);
    const rawText = collectRawText(response.document);

    return {
      raw_text: rawText,
      confidence,
      blocks: [],
      words: [],
      page_count: response.document?.inference?.pages?.length ?? 1,
      fields,
    };
  }
}

// ── Mapper ───────────────────────────────────────────────────────────────────

function strField(f: MindeeFieldLike | undefined): string | undefined {
  if (!f) return undefined;
  const v = f.value;
  if (v === null || v === undefined) return undefined;
  return typeof v === 'string' ? v : String(v);
}

function numField(f: MindeeFieldLike | undefined): number | undefined {
  if (!f) return undefined;
  const v = f.value;
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return v;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateField(f: MindeeFieldLike | undefined): string | undefined {
  // Mindee gibt Dates bereits als YYYY-MM-DD.
  return strField(f);
}

function firstField<T extends MindeeFieldLike>(arr?: T[]): T | undefined {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr[0];
}

export function mapMindeeToOcrFields(p: MindeeInvoiceV4Document): OcrFields {
  const taxesRaw = Array.isArray(p.taxes) ? p.taxes : [];
  const taxLines = taxesRaw
    .map((t) => ({
      rate: typeof t.rate === 'number' ? t.rate : 0,
      amount: typeof t.value === 'number' ? t.value : 0,
    }))
    .filter((t) => t.rate > 0 || t.amount > 0);

  const candidate: Record<string, unknown> = {
    supplier_name: strField(p.supplierName),
    supplier_vat_id: strField(firstField(p.supplierCompanyRegistrations)),
    supplier_address: strField(p.supplierAddress),
    document_number: strField(p.invoiceNumber),
    document_date: dateField(p.date),
    due_date: dateField(p.dueDate),
    total_net: numField(p.totalNet),
    total_gross: numField(p.totalAmount),
    total_tax: numField(p.totalTax),
    tax_lines: taxLines.length > 0 ? taxLines : undefined,
    currency: p.locale?.currency ?? undefined,
    payment_method: strField(firstField(p.supplierPaymentDetails)),
  };

  // null/undefined-Werte rausfiltern (Tests erwarten "undefined statt null").
  const fields: OcrFields = {};
  for (const [k, v] of Object.entries(candidate)) {
    if (v !== null && v !== undefined) {
      (fields as Record<string, unknown>)[k] = v;
    }
  }
  return fields;
}

function computeAverageConfidence(p: MindeeInvoiceV4Document): number {
  const candidates: number[] = [];
  const push = (f?: MindeeFieldLike): void => {
    if (f && typeof f.confidence === 'number') candidates.push(f.confidence);
  };
  push(p.supplierName);
  push(p.supplierAddress);
  push(p.invoiceNumber);
  push(p.date);
  push(p.dueDate);
  push(p.totalNet);
  push(p.totalAmount);
  push(p.totalTax);
  if (Array.isArray(p.supplierCompanyRegistrations)) p.supplierCompanyRegistrations.forEach(push);
  if (Array.isArray(p.supplierPaymentDetails)) p.supplierPaymentDetails.forEach(push);
  if (Array.isArray(p.taxes)) {
    for (const t of p.taxes) {
      if (typeof t.confidence === 'number') candidates.push(t.confidence);
    }
  }
  if (p.locale && typeof p.locale.confidence === 'number') candidates.push(p.locale.confidence);

  if (candidates.length === 0) return 0;
  return candidates.reduce((a, b) => a + b, 0) / candidates.length;
}

function collectRawText(doc?: MindeeDocument): string {
  const pages = doc?.ocr?.mvisionV1?.pages;
  if (!Array.isArray(pages)) return '';
  return pages
    .map((pg) => pg.allWords?.content ?? '')
    .filter((s) => s.length > 0)
    .join('\n');
}
