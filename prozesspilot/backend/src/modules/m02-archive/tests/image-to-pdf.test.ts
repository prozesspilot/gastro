/**
 * M02 — Tests für imageToPdf (M02 §10).
 *
 * Erzeugt ein 3×3 JPEG via sharp, schickt es durch imageToPdf,
 * prüft PDF-Magic + Producer-Metadata.
 */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { imageToPdf, isPdf } from '../../../core/pdf/image-to-pdf';

async function makeTestJpeg(): Promise<Buffer> {
  // 3×3 Pixel volles Rot, valide JPEG-Bytes
  return sharp({
    create: {
      width: 3,
      height: 3,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('M02 imageToPdf', () => {
  it('Konvertiert ein JPEG in ein valides 1-Page-PDF mit Producer=ProzessPilot', async () => {
    const jpeg = await makeTestJpeg();
    const pdfBytes = await imageToPdf(jpeg, 'image/jpeg');

    // PDF-Magic
    expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF');

    // Re-load PDF und Metadata prüfen.
    // updateMetadata: false → pdf-lib darf den Producer beim Re-Load
    // nicht durch seinen Default überschreiben.
    const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
    expect(pdf.getProducer()).toBe('ProzessPilot');
    expect(pdf.getCreationDate()).toBeInstanceOf(Date);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('isPdf() erkennt application/pdf case-insensitive', () => {
    expect(isPdf('application/pdf')).toBe(true);
    expect(isPdf('Application/PDF')).toBe(true);
    expect(isPdf('image/jpeg')).toBe(false);
    expect(isPdf('image/png')).toBe(false);
  });
});
