/**
 * T086/A2 — Öffentliche API der PDF-Engine (`core/pdf`).
 *
 * Ein Import-Punkt für Konsumenten (M08, DSGVO, GoBD-Doku):
 *   import { PdfDocumentBuilder, imageToPdf } from '../../core/pdf';
 */

export { PdfDocumentBuilder } from './document-builder';
export { imageToPdf, isPdf } from './image-to-pdf';
export { toWinAnsiSafe } from './text-encoding';
export type {
  KeyValueRow,
  KpiCard,
  PdfDocumentOptions,
  TableColumn,
  TableSpec,
} from './pdf.types';
