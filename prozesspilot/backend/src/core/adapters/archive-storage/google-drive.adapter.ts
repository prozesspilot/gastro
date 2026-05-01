/**
 * M02 — Google-Drive-Adapter (M02 §8.2)
 *
 * - OAuth2 mit Access- + Refresh-Token aus customer_credentials (kind = 'drive_oauth').
 * - Token-Refresh: bei 401 → refresh, neuer Access-Token wird in customer_credentials
 *   persistiert; einmalige Wiederholung des Original-Calls.
 * - Folder-Hierarchie wird on-demand angelegt (mkdir -p Verhalten).
 * - Folder-ID-Cache: Redis-Key `cust:{id}:drive:folder:{path_hash}` (TTL aus
 *   DRIVE_FOLDER_CACHE_TTL_SEC, Default 3600 s). Per-Process-LRU als zweite
 *   Stufe für sehr heiße Pfade.
 * - Upload: Multipart < 5 MB, Resumable Upload Session ≥ 5 MB.
 * - exists(): files.list mit name + parents → length > 0.
 * - Datei-Metadaten: `appProperties` { receipt_id, sha256, pp_version: '1' }.
 *
 * Das `googleapis`-Package liefert sowohl den OAuth2-Client als auch den
 * Drive-Service (v3). Wird lazy importiert, damit Tests den Adapter ohne
 * echtes SDK durch DI austauschen können.
 */

import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Pool } from 'pg';
import type Redis from 'ioredis';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { drive_v3 } from 'googleapis';

import { config } from '../../config';
import { logger } from '../../logger';
import {
  loadDriveCredential,
  saveDriveCredential,
  type DriveCredential,
} from './drive-credentials';
import type {
  ArchiveProviderId,
  ArchiveStorageAdapter,
  UploadInput,
  UploadResult,
} from './adapter.interface';

const DEFAULT_FOLDER_TTL_SEC = 3_600;
const RESUMABLE_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5 MB
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

const DRIVE_FOLDER_TTL_SEC = (() => {
  const raw = process.env.DRIVE_FOLDER_CACHE_TTL_SEC;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FOLDER_TTL_SEC;
})();

export interface GoogleDriveAdapterDeps {
  /** Postgres-Pool — fürs Credential-Lookup + Token-Refresh-Persistenz. */
  db: Pool;
  /** Redis-Client — fürs Folder-ID-Caching. */
  redis: Redis;
  /** Optional: Drive-Client-Factory (für Tests). */
  driveClientFactory?: (cred: DriveCredential) => DriveClientLike;
  /** Optional: OAuth2-Client-Factory (für Tests). */
  oauthClientFactory?: (cred: DriveCredential) => OAuth2Client;
}

/** Minimal-Interface — Adapter hängt nicht an `drive_v3.Drive`-Voll-Typ. */
export interface DriveClientLike {
  files: {
    list: drive_v3.Resource$Files['list'];
    create: drive_v3.Resource$Files['create'];
    get: drive_v3.Resource$Files['get'];
    delete: drive_v3.Resource$Files['delete'];
  };
}

/** Wirft bei 401, damit wir einen Refresh-Roundtrip machen können. */
class DriveAuthExpiredError extends Error {
  constructor() {
    super('drive_auth_expired');
  }
}

export class GoogleDriveAdapter implements ArchiveStorageAdapter {
  readonly id: ArchiveProviderId = 'google_drive';

  /** Per-Process-LRU für sehr heiße Pfad→Folder-ID-Mappings. */
  private readonly folderCacheLocal = new Map<string, string>();

  constructor(private readonly deps: GoogleDriveAdapterDeps) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async exists(path: string, customerId: string): Promise<boolean> {
    const { dir, filename } = splitPath(path);
    const cred = await loadDriveCredential(this.deps.db, customerId);
    return this.withAuth(customerId, cred, async (drive) => {
      const parentId = await this.ensureFolderPath(drive, customerId, dir, cred.rootFolderId);
      const escaped = filename.replace(/'/g, "\\'");
      const res = await drive.files.list({
        q: `name = '${escaped}' and '${parentId}' in parents and trashed = false`,
        fields: 'files(id,name)',
        spaces: 'drive',
        pageSize: 2,
      });
      return (res.data.files?.length ?? 0) > 0;
    });
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const { dir, filename } = splitPath(input.path);
    const cred = await loadDriveCredential(this.deps.db, input.customerId);
    return this.withAuth(input.customerId, cred, async (drive) => {
      const parentId = await this.ensureFolderPath(drive, input.customerId, dir, cred.rootFolderId);
      const appProperties: Record<string, string> = {
        pp_version: '1',
        ...(input.metadata ?? {}),
      };

      const requestBody: drive_v3.Schema$File = {
        name: filename,
        parents: [parentId],
        mimeType: input.mime,
        appProperties,
      };

      // Multipart < 5 MB, Resumable ≥ 5 MB.
      const useResumable = input.bytes.length >= RESUMABLE_THRESHOLD_BYTES;
      const res = await drive.files.create(
        {
          requestBody,
          media: {
            mimeType: input.mime,
            body: Readable.from(input.bytes),
          },
          fields: 'id,name,webViewLink',
          ...(useResumable ? { uploadType: 'resumable' } : {}),
        } as drive_v3.Params$Resource$Files$Create,
        useResumable
          ? {
              // Streaming-Upload erforderlich — sonst lädt googleapis alles in RAM.
              onUploadProgress: (evt: { bytesRead: number }) => {
                if (evt.bytesRead % (1024 * 1024) === 0) {
                  logger.debug({ bytes: evt.bytesRead }, 'Drive resumable upload progress');
                }
              },
            }
          : undefined,
      );

      const file = res.data;
      if (!file?.id) {
        throw new Error('Drive upload: keine File-ID in Response');
      }
      return {
        path: input.path,
        external_id: file.id,
        url: file.webViewLink ?? undefined,
      };
    });
  }

  async delete(externalId: string, customerId: string): Promise<void> {
    const cred = await loadDriveCredential(this.deps.db, customerId);
    await this.withAuth(customerId, cred, async (drive) => {
      await drive.files.delete({ fileId: externalId });
      return undefined;
    });
  }

  async download(externalId: string, customerId: string): Promise<Buffer> {
    const cred = await loadDriveCredential(this.deps.db, customerId);
    return this.withAuth(customerId, cred, async (drive) => {
      const res = await drive.files.get(
        { fileId: externalId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(res.data as ArrayBuffer);
    });
  }

  // ── Auth-Wrapper (mit Refresh-Retry) ───────────────────────────────────────

  private async withAuth<T>(
    customerId: string,
    cred: DriveCredential,
    fn: (drive: DriveClientLike) => Promise<T>,
  ): Promise<T> {
    let current = cred;
    let drive = this.makeDriveClient(current);
    try {
      return await this.runMappingAuth(fn, drive);
    } catch (err) {
      if (!(err instanceof DriveAuthExpiredError)) throw err;
      const refreshed = await this.refreshAccessToken(customerId, current);
      current = refreshed;
      drive = this.makeDriveClient(current);
      return this.runMappingAuth(fn, drive);
    }
  }

  private async runMappingAuth<T>(
    fn: (drive: DriveClientLike) => Promise<T>,
    drive: DriveClientLike,
  ): Promise<T> {
    try {
      return await fn(drive);
    } catch (err) {
      if (isAuthError(err)) throw new DriveAuthExpiredError();
      throw err;
    }
  }

  private makeDriveClient(cred: DriveCredential): DriveClientLike {
    if (this.deps.driveClientFactory) return this.deps.driveClientFactory(cred);
    const auth = this.makeOAuthClient(cred);
    return google.drive({ version: 'v3', auth }) as unknown as DriveClientLike;
  }

  private makeOAuthClient(cred: DriveCredential): OAuth2Client {
    if (this.deps.oauthClientFactory) return this.deps.oauthClientFactory(cred);
    const oauth = new google.auth.OAuth2();
    oauth.setCredentials({
      access_token: cred.accessToken,
      refresh_token: cred.refreshToken,
      expiry_date: cred.expiryMs,
    });
    return oauth;
  }

  private async refreshAccessToken(
    customerId: string,
    cred: DriveCredential,
  ): Promise<DriveCredential> {
    const oauth = this.makeOAuthClient(cred);
    const { credentials } = await oauth.refreshAccessToken();
    const next: DriveCredential = {
      ...cred,
      accessToken: credentials.access_token ?? cred.accessToken,
      refreshToken: credentials.refresh_token ?? cred.refreshToken,
      expiryMs: credentials.expiry_date ?? undefined,
    };
    await saveDriveCredential(this.deps.db, customerId, cred.credentialId, {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      expiryMs: next.expiryMs,
    });
    logger.info({ customerId, credentialId: cred.credentialId }, 'Drive access-token refreshed');
    return next;
  }

  // ── Folder-Resolver (mkdir -p) ──────────────────────────────────────────────

  private async ensureFolderPath(
    drive: DriveClientLike,
    customerId: string,
    dir: string,
    rootFolderId: string | undefined,
  ): Promise<string> {
    // Leerer Pfad → Root (My Drive bzw. konfigurierter root_folder_id).
    const segments = dir.split('/').filter((s) => s.length > 0);
    if (segments.length === 0) return rootFolderId ?? 'root';

    // Cache-Lookup: vollständiger Pfad zuerst.
    const fullCacheKey = folderCacheKey(customerId, segments.join('/'));
    const cached = await this.cacheGet(fullCacheKey);
    if (cached) return cached;

    let parentId = rootFolderId ?? 'root';
    let walked = '';
    for (const seg of segments) {
      walked = walked ? `${walked}/${seg}` : seg;
      const cacheKey = folderCacheKey(customerId, walked);
      const cachedSeg = await this.cacheGet(cacheKey);
      if (cachedSeg) {
        parentId = cachedSeg;
        continue;
      }

      const folderId = await this.findOrCreateFolder(drive, seg, parentId);
      await this.cacheSet(cacheKey, folderId);
      parentId = folderId;
    }
    await this.cacheSet(fullCacheKey, parentId);
    return parentId;
  }

  private async findOrCreateFolder(
    drive: DriveClientLike,
    name: string,
    parentId: string,
  ): Promise<string> {
    const escapedName = name.replace(/'/g, "\\'");
    const list = await drive.files.list({
      q: `name = '${escapedName}' and '${parentId}' in parents and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`,
      fields: 'files(id,name)',
      spaces: 'drive',
      pageSize: 2,
    });
    const found = list.data.files?.[0]?.id;
    if (found) return found;

    const created = await drive.files.create({
      requestBody: {
        name,
        parents: [parentId],
        mimeType: DRIVE_FOLDER_MIME,
      },
      fields: 'id',
    });
    const id = created.data.id;
    if (!id) throw new Error(`Drive folder create: keine ID für ${name}`);
    return id;
  }

  // ── Cache-Helpers ───────────────────────────────────────────────────────────

  private async cacheGet(key: string): Promise<string | null> {
    const local = this.folderCacheLocal.get(key);
    if (local) return local;
    try {
      const v = await this.deps.redis.get(key);
      if (v) this.folderCacheLocal.set(key, v);
      return v;
    } catch (err) {
      logger.warn({ err, key }, 'Drive folder-cache GET fehlgeschlagen');
      return null;
    }
  }

  private async cacheSet(key: string, value: string): Promise<void> {
    this.folderCacheLocal.set(key, value);
    try {
      await this.deps.redis.set(key, value, 'EX', DRIVE_FOLDER_TTL_SEC);
    } catch (err) {
      logger.warn({ err, key }, 'Drive folder-cache SET fehlgeschlagen');
    }
  }
}

// ── Modul-Helpers ────────────────────────────────────────────────────────────

export function splitPath(path: string): { dir: string; filename: string } {
  // Erlaubt sowohl "/2026/04/Wareneinkauf/foo.pdf" als auch ohne führenden Slash.
  const trimmed = path.replace(/^\/+/, '');
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash === -1) return { dir: '', filename: trimmed };
  return { dir: trimmed.slice(0, lastSlash), filename: trimmed.slice(lastSlash + 1) };
}

export function folderCacheKey(customerId: string, dirPath: string): string {
  const hash = createHash('sha256').update(dirPath).digest('hex').slice(0, 16);
  return `cust:${customerId}:drive:folder:${hash}`;
}

function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status =
    (err as { code?: number; status?: number; response?: { status?: number } }).code ??
    (err as { code?: number; status?: number; response?: { status?: number } }).status ??
    (err as { response?: { status?: number } }).response?.status;
  return status === 401;
}
