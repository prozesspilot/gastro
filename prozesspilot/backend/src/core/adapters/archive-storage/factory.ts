/**
 * M02 — Archive-Storage-Adapter-Factory (M02 §8).
 *
 * Wählt anhand der `customer_profile.integrations.archive.provider`-Angabe
 * den passenden Adapter aus. Das WebDAV-Slot ist als Provider-ID gelistet,
 * aktuell aber noch nicht implementiert (Phase 3 laut M02 §8).
 *
 * Singleton-Cache pro Provider, weil Adapter teure Setup-Kosten haben
 * (LRU-Folder-Cache, Auth-State).
 */

import type Redis from 'ioredis';
import type { Pool } from 'pg';
import type { ArchiveProviderId, ArchiveStorageAdapter } from './adapter.interface';
import { DropboxAdapter } from './dropbox.adapter';
import { GoogleDriveAdapter } from './google-drive.adapter';

export interface ArchiveStorageAdapterFactory {
  for(provider: ArchiveProviderId): ArchiveStorageAdapter;
}

export interface ArchiveStorageAdapterFactoryDeps {
  db: Pool;
  redis: Redis;
}

export function createArchiveStorageAdapterFactory(
  deps: ArchiveStorageAdapterFactoryDeps,
): ArchiveStorageAdapterFactory {
  let cachedDrive: GoogleDriveAdapter | null = null;
  let cachedDropbox: DropboxAdapter | null = null;

  return {
    for(provider: ArchiveProviderId): ArchiveStorageAdapter {
      switch (provider) {
        case 'google_drive':
          cachedDrive ??= new GoogleDriveAdapter(deps);
          return cachedDrive;
        case 'dropbox':
          cachedDropbox ??= new DropboxAdapter(deps.db);
          return cachedDropbox;
        case 'webdav':
          throw new Error('WEBDAV_NOT_IMPLEMENTED — Phase 3');
        default: {
          const exhaustiveCheck: never = provider;
          throw new Error(`Unbekannter Archive-Provider: ${exhaustiveCheck as string}`);
        }
      }
    },
  };
}

export type {
  ArchiveProviderId,
  ArchiveStorageAdapter,
  UploadInput,
  UploadResult,
} from './adapter.interface';
