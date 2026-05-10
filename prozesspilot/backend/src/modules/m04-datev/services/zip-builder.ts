/**
 * M04 — ZIP-Builder.
 * Erstellt ein ZIP-Archiv mit den Receipt-PDFs.
 */

import { logger } from '../../../core/logger';
import type { Receipt } from '../../_shared/receipts/receipt.repository';

const MAX_PDFS_PER_ZIP = 100;
const MAX_ZIP_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface ZipBuildResult {
  zips: Array<{ name: string; buffer: Buffer }>;
}

/**
 * Erstellt ein oder mehrere ZIP-Archive mit den Receipt-PDFs.
 * Falls > 100 PDFs oder > 25 MB → aufteilen in belege_1.zip, belege_2.zip, ...
 *
 * ACHTUNG: archiver ist optional. Falls nicht installiert → gibt leere ZIPs zurück.
 * In Production: npm install archiver --save
 */
export async function zipReceipts(
  receipts: Receipt[],
  getFileBytes?: (objectKey: string) => Promise<Buffer>,
): Promise<ZipBuildResult> {
  // Teile Receipts in Batches à MAX_PDFS_PER_ZIP auf
  const batches: Receipt[][] = [];
  for (let i = 0; i < receipts.length; i += MAX_PDFS_PER_ZIP) {
    batches.push(receipts.slice(i, i + MAX_PDFS_PER_ZIP));
  }

  const zips: Array<{ name: string; buffer: Buffer }> = [];
  let zipIndex = 1;

  for (const batch of batches) {
    const name = batches.length === 1 ? 'belege.zip' : `belege_${zipIndex}.zip`;
    const buffer = await buildSingleZip(batch, getFileBytes);

    // Wenn ZIP zu groß → aufteilen (rekursiv, max 1 Ebene)
    if (buffer.length > MAX_ZIP_SIZE_BYTES && batch.length > 1) {
      const half = Math.floor(batch.length / 2);
      const firstHalf = await buildSingleZip(batch.slice(0, half), getFileBytes);
      const secondHalf = await buildSingleZip(batch.slice(half), getFileBytes);
      zips.push({ name: `belege_${zipIndex}a.zip`, buffer: firstHalf });
      zips.push({ name: `belege_${zipIndex}b.zip`, buffer: secondHalf });
    } else {
      zips.push({ name, buffer });
    }

    zipIndex += 1;
  }

  return { zips };
}

async function buildSingleZip(
  receipts: Receipt[],
  getFileBytes?: (objectKey: string) => Promise<Buffer>,
): Promise<Buffer> {
  try {
    // Versuche archiver zu laden
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const archiver = require('archiver') as (format: string, opts?: unknown) => any;
    const { PassThrough } = await import('node:stream');
    const { Readable } = await import('node:stream');

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const output = new PassThrough();

      output.on('data', (chunk: Buffer) => chunks.push(chunk));
      output.on('end', () => resolve(Buffer.concat(chunks)));
      output.on('error', reject);

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.pipe(output);
      archive.on('error', reject);

      const appendFiles = async () => {
        for (const receipt of receipts) {
          const fileName = buildPdfFileName(receipt);
          if (getFileBytes && receipt.file?.object_key) {
            try {
              const bytes = await getFileBytes(receipt.file.object_key);
              archive.append(Readable.from(bytes), { name: fileName });
            } catch (err) {
              logger.warn(
                { err, receipt_id: receipt.receipt_id },
                'PDF-Laden für ZIP fehlgeschlagen — überspringe',
              );
            }
          } else {
            // Platzhalter-PDF falls kein Storage-Zugriff
            archive.append(Buffer.from(`PDF:${receipt.receipt_id}`), { name: fileName });
          }
        }
        await archive.finalize();
      };

      appendFiles().catch(reject);
    });
  } catch (err) {
    // archiver nicht installiert → leeres ZIP-Dummy zurückgeben
    logger.warn(
      { err },
      'archiver nicht verfügbar — leeres ZIP zurückgegeben. npm install archiver --save',
    );
    return Buffer.from(`PK\x05\x06${'\x00'.repeat(18)}`); // Minimal leeres ZIP
  }
}

/**
 * Generiert einen DATEV-konformen Dateinamen für ein Receipt-PDF.
 * Format: YYYY-MM-DD_Lieferant_Rechnungsnummer.pdf
 */
export function buildPdfFileName(receipt: Receipt): string {
  const fields = ((receipt.extraction as { fields?: Record<string, unknown> } | undefined)
    ?.fields ?? {}) as {
    document_date?: string;
    vendor_name?: string;
    document_number?: string;
  };

  const date = fields.document_date ?? 'undatiert';
  const vendor = sanitizeFileName(fields.vendor_name ?? 'unbekannt');
  const docNo = sanitizeFileName(fields.document_number ?? receipt.receipt_id);

  return `${date}_${vendor}_${docNo}.pdf`.slice(0, 100);
}

function sanitizeFileName(s: string): string {
  return s
    .replace(/[^\w\-\.]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}
