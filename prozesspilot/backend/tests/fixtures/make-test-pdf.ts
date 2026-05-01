/**
 * Erzeugt eine minimale gültige PDF-Datei für Tests.
 *
 * Wird im E2E-Test-Setup einmalig aufgerufen, falls
 * `backend/tests/fixtures/test-receipt.pdf` noch nicht existiert.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

export const TEST_RECEIPT_PDF_PATH = join(__dirname, 'test-receipt.pdf');

export async function ensureTestReceiptPdf(): Promise<string> {
  if (existsSync(TEST_RECEIPT_PDF_PATH)) {
    return TEST_RECEIPT_PDF_PATH;
  }
  const dir = dirname(TEST_RECEIPT_PDF_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const doc = await PDFDocument.create();
  doc.setProducer('ProzessPilot Test');
  doc.setCreator('test-fixture');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('ProzessPilot Test-Beleg', { x: 50, y: 780, size: 18, font });
  page.drawText('Lieferant: Test Lieferant GmbH', { x: 50, y: 740, size: 11, font });
  page.drawText('Datum: 2026-04-28', { x: 50, y: 720, size: 11, font });
  page.drawText('Brutto: 142,85 EUR', { x: 50, y: 700, size: 11, font });

  const bytes = await doc.save();
  writeFileSync(TEST_RECEIPT_PDF_PATH, bytes);
  return TEST_RECEIPT_PDF_PATH;
}
