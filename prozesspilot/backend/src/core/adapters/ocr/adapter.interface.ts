/**
 * M01 — OCR-Adapter-Interface (M01 §8.1)
 *
 * Vereinheitlicht den Zugriff auf verschiedene OCR-Provider (Google Vision,
 * Mindee, ...). Konsumenten reden ausschließlich über dieses Interface;
 * der konkrete Provider wird über die Factory ausgewählt.
 */

export type OcrProviderId = 'google_vision' | 'mindee';

/** Bounding-Box [x, y, width, height] in Pixeln (top-left origin). */
export type BBox = [number, number, number, number];

export interface OcrBlock {
  text: string;
  bbox: BBox;
  conf: number; // 0..1
}

export interface OcrWord {
  text: string;
  bbox: BBox;
  conf: number; // 0..1
}

/**
 * Strukturierte Felder, wie sie ein Invoice-fähiger Provider (z. B. Mindee)
 * zurückgeben kann. Provider, die nur Rohtext liefern (Google Vision),
 * lassen das Feld undefined und überlassen die Extraktion einer
 * nachgelagerten Stufe.
 */
export interface OcrFields {
  supplier_name?: string;
  supplier_vat_id?: string;
  supplier_address?: string;
  document_number?: string;
  document_date?: string; // YYYY-MM-DD
  due_date?: string; // YYYY-MM-DD
  total_net?: number;
  total_gross?: number;
  total_tax?: number;
  tax_lines?: Array<{ rate: number; amount: number }>;
  currency?: string;
  payment_method?: string;
}

export interface OcrResult {
  /** Vollständiger Rohtext, blockweise getrennt durch \n. */
  raw_text: string;
  /** Durchschnittliche Konfidenz über alle Words (0..1). */
  confidence: number;
  blocks: OcrBlock[];
  words: OcrWord[];
  page_count: number;
  /** Optionale strukturierte Felder (Phase 3: Mindee-Adapter). */
  fields?: OcrFields;
}

export interface OcrAdapter {
  readonly id: OcrProviderId;
  readonly version: string;
  /**
   * Führt OCR auf den gegebenen Bytes aus.
   * @param bytes  Datei-Inhalt (Bild oder PDF)
   * @param config Provider-spezifische Konfiguration aus customer_profile.integrations.ocr.config
   */
  extract(bytes: Buffer, config?: Record<string, unknown>): Promise<OcrResult>;
}
