/**
 * M01 — Google Cloud Vision Adapter (M01 §8.2)
 *
 * Phase 1: nutzt `@google-cloud/vision` SDK mit Feature DOCUMENT_TEXT_DETECTION.
 * - Bilder (jpg/png/...): documentTextDetection({ image: { content } })
 * - PDFs (1-seitig):       batchAnnotateFiles mit inputConfig (mimeType:'application/pdf')
 *
 * Konfiguration:
 *   language_hints:    string[] — z. B. ["de", "it"]
 *   feature:           'DOCUMENT_TEXT_DETECTION' | 'TEXT_DETECTION' (Default: DOCUMENT_TEXT_DETECTION)
 *
 * Authentifizierung: keyFilename aus ENV GOOGLE_VISION_KEY_FILE
 * Timeout:           OCR_TIMEOUT_MS (Default 15000)
 *
 * Confidence: Durchschnitt aller Words. Falls Words fehlen → fallback Page.confidence.
 */

import type { OcrAdapter, OcrBlock, OcrResult, OcrWord } from './adapter.interface';
import { config } from '../../config';
import { logger } from '../../logger';

// Lazy-Import: Vision SDK nur laden, wenn der Adapter wirklich benutzt wird.
// So kann das Modul auch in Tests/CI ohne installiertes SDK importiert werden.
type VisionClientCtor = new (opts: { keyFilename?: string }) => {
  documentTextDetection(req: unknown, opts?: unknown): Promise<unknown[]>;
  batchAnnotateFiles(req: unknown, opts?: unknown): Promise<unknown[]>;
  close(): Promise<void>;
};

let cachedClient: InstanceType<VisionClientCtor> | null = null;

async function getVisionClient(): Promise<InstanceType<VisionClientCtor>> {
  if (cachedClient) return cachedClient;
  // Dynamischer Import — Paket steht nur in Production zur Verfügung,
  // damit Tests/CI ohne installiertes SDK importieren können.
  const mod = await import('@google-cloud/vision');
  const ImageAnnotatorClient = (mod as { ImageAnnotatorClient: VisionClientCtor })
    .ImageAnnotatorClient;
  const opts = config.GOOGLE_VISION_KEY_FILE
    ? { keyFilename: config.GOOGLE_VISION_KEY_FILE }
    : {};
  cachedClient = new ImageAnnotatorClient(opts);
  return cachedClient;
}

// ── Vertex/BBox-Helfer ────────────────────────────────────────────────────────

interface Vertex { x?: number | null; y?: number | null }

function bboxFromVertices(verts: Vertex[] | undefined | null): [number, number, number, number] {
  if (!verts || verts.length === 0) return [0, 0, 0, 0];
  const xs = verts.map((v) => v.x ?? 0);
  const ys = verts.map((v) => v.y ?? 0);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  return [x, y, w, h];
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ── Mime-Detection ────────────────────────────────────────────────────────────

function isPdf(bytes: Buffer): boolean {
  // %PDF-
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

interface VisionConfig {
  language_hints?: string[];
  feature?: 'DOCUMENT_TEXT_DETECTION' | 'TEXT_DETECTION';
}

export class GoogleVisionAdapter implements OcrAdapter {
  readonly id = 'google_vision' as const;
  readonly version = 'v1';

  async extract(bytes: Buffer, cfg: Record<string, unknown> = {}): Promise<OcrResult> {
    const visionCfg = cfg as VisionConfig;
    const languageHints = visionCfg.language_hints ?? ['de'];
    const feature = visionCfg.feature ?? 'DOCUMENT_TEXT_DETECTION';

    const client = await getVisionClient();
    const timeoutMs = config.OCR_TIMEOUT_MS;

    return Promise.race([
      isPdf(bytes)
        ? this.extractPdf(client, bytes, languageHints, feature)
        : this.extractImage(client, bytes, languageHints, feature),
      new Promise<OcrResult>((_, reject) => {
        setTimeout(() => reject(new Error(`OCR_TIMEOUT (${timeoutMs}ms)`)), timeoutMs);
      }),
    ]);
  }

  private async extractImage(
    client: InstanceType<VisionClientCtor>,
    bytes: Buffer,
    languageHints: string[],
    feature: 'DOCUMENT_TEXT_DETECTION' | 'TEXT_DETECTION',
  ): Promise<OcrResult> {
    logger.debug({ size: bytes.length, languageHints, feature }, 'Vision: documentTextDetection');

    const [response] = await client.documentTextDetection({
      image:        { content: bytes },
      imageContext: { languageHints },
      features:     [{ type: feature }],
    });

    return parseFullTextAnnotation(response, /* page_count */ 1);
  }

  private async extractPdf(
    client: InstanceType<VisionClientCtor>,
    bytes: Buffer,
    languageHints: string[],
    feature: 'DOCUMENT_TEXT_DETECTION' | 'TEXT_DETECTION',
  ): Promise<OcrResult> {
    logger.debug({ size: bytes.length, languageHints }, 'Vision: batchAnnotateFiles (PDF)');

    // Phase 1: nur 1-seitige PDFs synchron via batchAnnotateFiles.
    const [resp] = await client.batchAnnotateFiles({
      requests: [{
        inputConfig: { content: bytes, mimeType: 'application/pdf' },
        features:    [{ type: feature }],
        imageContext: { languageHints },
        // pages:    [1] — Default ist erste Seite, explizit hier zur Klarheit
        pages:       [1],
      }],
    });

    type FileResp = {
      responses?: Array<{
        fullTextAnnotation?: unknown;
        textAnnotations?:    unknown[];
        error?:              { message?: string };
      }>;
      totalPages?: number;
    };
    const fileResp = ((resp as { responses?: FileResp[] }).responses ?? [])[0];
    const pageResp = (fileResp?.responses ?? [])[0];
    if (pageResp?.error?.message) {
      throw new Error(`Vision PDF error: ${pageResp.error.message}`);
    }
    return parseFullTextAnnotation(pageResp ?? {}, fileResp?.totalPages ?? 1);
  }
}

// ── Response-Parser ───────────────────────────────────────────────────────────

interface FullTextAnnotation {
  text?: string;
  pages?: Array<{
    confidence?: number;
    blocks?: Array<{
      confidence?: number;
      boundingBox?: { vertices?: Vertex[] };
      paragraphs?: Array<{
        words?: Array<{
          confidence?: number;
          boundingBox?: { vertices?: Vertex[] };
          symbols?:    Array<{ text?: string }>;
        }>;
      }>;
    }>;
  }>;
}

interface VisionResponse {
  fullTextAnnotation?: FullTextAnnotation;
  textAnnotations?:    Array<{ description?: string }>;
}

function parseFullTextAnnotation(resp: unknown, pageCount: number): OcrResult {
  const r = resp as VisionResponse;
  const ann = r.fullTextAnnotation ?? {};
  const rawText = ann.text ?? r.textAnnotations?.[0]?.description ?? '';

  const blocks: OcrBlock[] = [];
  const words:  OcrWord[]  = [];
  const wordConfs: number[] = [];
  const pageConfs: number[] = [];

  for (const page of ann.pages ?? []) {
    if (typeof page.confidence === 'number') pageConfs.push(page.confidence);
    for (const block of page.blocks ?? []) {
      const blockConf = typeof block.confidence === 'number' ? block.confidence : 0;
      const blockBBox = bboxFromVertices(block.boundingBox?.vertices);
      const blockWords: string[] = [];
      for (const para of block.paragraphs ?? []) {
        for (const w of para.words ?? []) {
          const wordText = (w.symbols ?? []).map((s) => s.text ?? '').join('');
          const wordConf = typeof w.confidence === 'number' ? w.confidence : 0;
          if (typeof w.confidence === 'number') wordConfs.push(w.confidence);
          words.push({
            text: wordText,
            bbox: bboxFromVertices(w.boundingBox?.vertices),
            conf: wordConf,
          });
          blockWords.push(wordText);
        }
      }
      blocks.push({
        text: blockWords.join(' '),
        bbox: blockBBox,
        conf: blockConf,
      });
    }
  }

  const confidence = wordConfs.length > 0
    ? avg(wordConfs)
    : pageConfs.length > 0
      ? avg(pageConfs)
      : 0;

  return {
    raw_text: rawText,
    confidence,
    blocks,
    words,
    page_count: pageCount,
  };
}
