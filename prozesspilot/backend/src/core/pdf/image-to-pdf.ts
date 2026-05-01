/**
 * M02 — Image-to-PDF Konvertierung (M02 §10).
 *
 * Nimmt ein Bild (JPEG / PNG / TIFF / WebP), normalisiert es per `sharp`
 * (EXIF-Rotate, max. 2400×2400 inside, JPEG-Reencode q=88) und legt es
 * als einzelne Seite in ein neues PDF. Producer + CreationDate werden
 * für GoBD-Nachvollziehbarkeit gesetzt.
 *
 * Reine Buffer-API — bewusst kein File-IO, damit der Caller die Bytes
 * direkt aus MinIO/S3 reichen kann.
 */

import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

export async function imageToPdf(bytes: Buffer, _mime: string): Promise<Buffer> {
  // Bild ggf. rotieren (EXIF), max. 2400x2400 verkleinern, in JPEG re-encodieren
  const normalized = await sharp(bytes)
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();

  // updateMetadata: false → pdf-lib überschreibt unseren Producer beim
  // Save NICHT mit dem Default 'pdf-lib (...)'-String.
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const img = await pdf.embedJpg(normalized);
  const { width, height } = img.scale(1);
  const page = pdf.addPage([width, height]);
  page.drawImage(img, { x: 0, y: 0, width, height });

  // Metadata für GoBD-Nachvollziehbarkeit
  pdf.setProducer('ProzessPilot');
  pdf.setCreationDate(new Date());

  return Buffer.from(await pdf.save());
}

/** True, wenn der MIME-Typ ein bereits valides PDF beschreibt (kein Convert nötig). */
export function isPdf(mime: string): boolean {
  return mime.toLowerCase() === 'application/pdf';
}
