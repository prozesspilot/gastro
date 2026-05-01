/**
 * M07 — Spreadsheet-Adapter-Factory (M07 §9)
 *
 * Single-Entry für die Modul-Schicht: gibt für eine Provider-ID den passenden
 * Adapter zurück. Der konkrete Provider wird pro Customer in
 * profile.integrations.spreadsheet.provider gesetzt.
 */

import {
  type SpreadsheetAdapter,
  type SpreadsheetProviderId,
} from './adapter.interface';
import { ExcelOneDriveAdapter } from './excel-onedrive.adapter';
import { GoogleSheetsAdapter } from './google-sheets.adapter';

export interface SpreadsheetAdapterFactory {
  for(provider: SpreadsheetProviderId): SpreadsheetAdapter;
}

let cachedGoogle: GoogleSheetsAdapter | null = null;
let cachedExcel:  ExcelOneDriveAdapter | null = null;

export const spreadsheetAdapterFactory: SpreadsheetAdapterFactory = {
  for(provider: SpreadsheetProviderId): SpreadsheetAdapter {
    switch (provider) {
      case 'google_sheets':
        cachedGoogle ??= new GoogleSheetsAdapter();
        return cachedGoogle;
      case 'excel_onedrive':
        cachedExcel ??= new ExcelOneDriveAdapter();
        return cachedExcel;
      default: {
        const exhaustive: never = provider;
        throw new Error(`Unbekannter Spreadsheet-Provider: ${exhaustive as string}`);
      }
    }
  },
};

export type {
  SpreadsheetAdapter,
  SpreadsheetProviderId,
  RowValue,
  ColumnDef,
  RowRef,
  RowResult,
} from './adapter.interface';

export {
  HeaderConflictError,
  SpreadsheetNotFoundError,
} from './adapter.interface';
