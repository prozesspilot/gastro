/**
 * M02 — Dropbox-Adapter (M02 §8)
 *
 * Lädt Belege in Dropbox via Dropbox API v2 hoch und verwaltet sie.
 * OAuth2-Token kommt aus customer_credentials (kind='dropbox_oauth').
 * Token-Refresh: Bei 401 → refresh via dropbox-credentials.ts, einmalige
 * Wiederholung des Original-Calls.
 *
 * DECISION: Kein `dropbox` SDK — wir nutzen native fetch direkt gegen die
 * Dropbox API v2. Das hält den Adapter testbar via vi.spyOn(global, 'fetch').
 *
 * API-Endpunkte:
 *   - exists:   POST https://api.dropboxapi.com/2/files/get_metadata
 *   - upload:   POST https://content.dropboxapi.com/2/files/upload
 *   - delete:   POST https://api.dropboxapi.com/2/files/delete_v2
 *   - download: POST https://content.dropboxapi.com/2/files/download
 */

import type { Pool } from 'pg';

import { logger } from '../../logger';

import type {
  ArchiveProviderId,
  ArchiveStorageAdapter,
  UploadInput,
  UploadResult,
} from './adapter.interface';

import {
  loadDropboxCredential,
  refreshDropboxCredential,
  type DropboxCredential,
} from './dropbox-credentials';

// ── API-Endpunkte ─────────────────────────────────────────────────────────────

const DBX_API = 'https://api.dropboxapi.com';
const DBX_CONTENT = 'https://content.dropboxapi.com';

// ── Response-Types ────────────────────────────────────────────────────────────

interface DbxFileMetadata {
  '.tag': string;
  id: string;
  path_display: string;
  name: string;
}

interface DbxDeleteResult {
  metadata: DbxFileMetadata;
}

interface DbxSharedLink {
  url: string;
}

interface DbxUploadResult {
  id: string;
  path_display: string;
  name: string;
}

interface DbxErrorPayload {
  error_summary?: string;
  error?: { '.tag'?: string };
}

// ── Auth-Error ────────────────────────────────────────────────────────────────

class DropboxAuthExpiredError extends Error {
  constructor() {
    super('dropbox_auth_expired');
  }
}

// ── Fetch-Helpers ─────────────────────────────────────────────────────────────

async function dbxApiPost<T>(
  accessToken: string,
  path: string,
  body: unknown,
): Promise<T> {
  const resp = await fetch(`${DBX_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401) throw new DropboxAuthExpiredError();
  if (!resp.ok) {
    const errBody = (await resp.json().catch(() => ({}))) as DbxErrorPayload;
    throw new Error(
      `Dropbox API POST ${path} → ${resp.status}: ${errBody.error_summary ?? 'unknown'}`,
    );
  }

  return resp.json() as Promise<T>;
}

async function dbxContentPost<T>(
  accessToken: string,
  path: string,
  dropboxApiArg: Record<string, unknown>,
  body: Buffer | string | ArrayBuffer,
): Promise<T> {
  const resp = await fetch(`${DBX_CONTENT}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify(dropboxApiArg),
    },
    body,
  });

  if (resp.status === 401) throw new DropboxAuthExpiredError();
  if (!resp.ok) {
    const errBody = (await resp.json().catch(() => ({}))) as DbxErrorPayload;
    throw new Error(
      `Dropbox content POST ${path} → ${resp.status}: ${errBody.error_summary ?? 'unknown'}`,
    );
  }

  return resp.json() as Promise<T>;
}

async function dbxContentDownload(
  accessToken: string,
  dropboxApiArg: Record<string, unknown>,
): Promise<Buffer> {
  const resp = await fetch(`${DBX_CONTENT}/2/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify(dropboxApiArg),
    },
  });

  if (resp.status === 401) throw new DropboxAuthExpiredError();
  if (!resp.ok) {
    const errBody = (await resp.json().catch(() => ({}))) as DbxErrorPayload;
    throw new Error(
      `Dropbox download → ${resp.status}: ${errBody.error_summary ?? 'unknown'}`,
    );
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Adapter-Implementation ────────────────────────────────────────────────────

export class DropboxAdapter implements ArchiveStorageAdapter {
  readonly id: ArchiveProviderId = 'dropbox';

  constructor(private readonly db?: Pool) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async exists(path: string, customerId: string): Promise<boolean> {
    const cred = await this.loadCred(customerId);
    return this.withAuth(customerId, cred, async (token) => {
      try {
        await dbxApiPost<DbxFileMetadata>(token, '/2/files/get_metadata', { path });
        return true;
      } catch (err) {
        // Dropbox gibt 409 zurück wenn path_not_found
        if (err instanceof Error && err.message.includes('409')) return false;
        if (err instanceof Error && err.message.includes('path_not_found')) return false;
        if (err instanceof DropboxAuthExpiredError) throw err;
        // Andere Fehler (z.B. 409 mit not_found) → false
        return false;
      }
    });
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const cred = await this.loadCred(input.customerId);
    return this.withAuth(input.customerId, cred, async (token) => {
      const uploadResult = await dbxContentPost<DbxUploadResult>(
        token,
        '/2/files/upload',
        {
          path: input.path,
          mode: 'overwrite',
          autorename: false,
          mute: false,
        },
        input.bytes,
      );

      // Share-Link erstellen
      let shareUrl: string | undefined;
      try {
        const linkResult = await dbxApiPost<DbxSharedLink>(
          token,
          '/2/sharing/create_shared_link_with_settings',
          {
            path: uploadResult.path_display,
            settings: {
              requested_visibility: { '.tag': 'public' },
              audience: { '.tag': 'public' },
              access: { '.tag': 'viewer' },
            },
          },
        );
        shareUrl = linkResult.url;
      } catch (err) {
        // Share-Link ist optional — kein hard fail
        logger.warn({ err, path: input.path }, 'Dropbox: Share-Link konnte nicht erstellt werden');
      }

      logger.info(
        { path: input.path, customerId: input.customerId, id: uploadResult.id },
        'M02 Dropbox upload: Datei hochgeladen',
      );

      return {
        path: uploadResult.path_display,
        external_id: uploadResult.id,
        url: shareUrl,
      };
    });
  }

  async delete(externalId: string, customerId: string): Promise<void> {
    const cred = await this.loadCred(customerId);
    await this.withAuth(customerId, cred, async (token) => {
      await dbxApiPost<DbxDeleteResult>(token, '/2/files/delete_v2', {
        path: externalId,
      });
      logger.info({ externalId, customerId }, 'M02 Dropbox delete: Datei gelöscht');
      return undefined;
    });
  }

  async download(externalId: string, customerId: string): Promise<Buffer> {
    const cred = await this.loadCred(customerId);
    return this.withAuth(customerId, cred, async (token) => {
      const buf = await dbxContentDownload(token, { path: externalId });
      logger.info({ externalId, customerId, bytes: buf.length }, 'M02 Dropbox download: Datei geladen');
      return buf;
    });
  }

  // ── Auth-Wrapper (mit Refresh-Retry) ───────────────────────────────────────

  private async withAuth<T>(
    customerId: string,
    cred: DropboxCredential,
    fn: (token: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await fn(cred.accessToken);
    } catch (err) {
      if (!(err instanceof DropboxAuthExpiredError)) throw err;

      // Einmaliger Refresh-Versuch
      if (!this.db) throw new Error('DropboxAdapter: db-Pool nicht verfügbar für Token-Refresh');
      const refreshed = await refreshDropboxCredential(this.db, customerId, cred);
      return fn(refreshed.accessToken);
    }
  }

  private async loadCred(customerId: string): Promise<DropboxCredential> {
    if (!this.db) {
      throw new Error('DropboxAdapter: db-Pool nicht initialisiert');
    }
    return loadDropboxCredential(this.db, customerId);
  }
}
