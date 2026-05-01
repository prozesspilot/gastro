/**
 * M02 — Archive-Storage-Adapter (M02 §8.1)
 *
 * UNTERSCHIEDLICH vom MinIO-StorageAdapter (D8):
 *   - D8 / core/storage   → ProzessPilot-eigener Object-Store für Original-
 *                           Belege (immutable, intern, AWS-S3-kompatibel).
 *   - dieses Interface    → Cloud-Ablage des Kunden (Google Drive, Dropbox,
 *                           ggf. WebDAV) für GoBD-konforme Endablage.
 *
 * Caller (m02-archive/handlers/archive.handler.ts) reden ausschließlich
 * über dieses Interface; der konkrete Provider wird über die Factory
 * (`factory.ts`) basierend auf `customer_profile.integrations.archive.provider`
 * ausgewählt.
 */
export type ArchiveProviderId = 'google_drive' | 'dropbox' | 'webdav';

export interface UploadInput {
  /** Customer-Kontext — adapter nutzt ihn fürs Credential-Lookup + Cache-Key. */
  customerId: string;
  /** Vollständiger Zielpfad inkl. Dateiname (z. B. "/2026/04/Wareneinkauf/foo.pdf"). */
  path: string;
  /** Datei-Bytes (PDF). */
  bytes: Buffer;
  /** MIME-Typ — M02 lädt immer als 'application/pdf' hoch. */
  mime: string;
  /** Optionale Metadaten — bei Drive landen sie in `appProperties`. */
  metadata?: Record<string, string>;
}

export interface UploadResult {
  /** Tatsächlich verwendeter Pfad (kann nach Sanitizing abweichen). */
  path: string;
  /** Provider-spezifische ID (Drive-File-ID, Dropbox-Path, …). */
  external_id: string;
  /** Optionale Web-URL (Drive `webViewLink`, Dropbox `link`). */
  url?: string;
}

export interface ArchiveStorageAdapter {
  readonly id: ArchiveProviderId;
  /**
   * Existiert eine Datei unter `path` für diesen Customer?
   * Wird vom Kollisions-Resolver aufgerufen.
   */
  exists(path: string, customerId: string): Promise<boolean>;
  /** Lädt eine Datei hoch. Folder-Hierarchie wird on-demand angelegt. */
  upload(input: UploadInput): Promise<UploadResult>;
  /**
   * Löscht eine Datei. NUR via Operator-Endpoint zu rufen — System
   * darf nicht ungeprüft löschen (GoBD-Aufbewahrungspflicht).
   */
  delete(externalId: string, customerId: string): Promise<void>;
  /** Lädt eine Datei für Re-Verifizierung / Audit zurück. */
  download(externalId: string, customerId: string): Promise<Buffer>;
}
