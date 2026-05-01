/**
 * M07 — Google-Sheets-Adapter (M07 §9.2)
 *
 * Schreibt Belegzeilen in eine Google-Sheets-Tabelle des Kunden via
 * `googleapis`. OAuth2-Refresh-Token kommt aus customer_credentials
 * (kind='gdrive_oauth' oder 'sheets_oauth' — siehe loadOAuthClient()).
 *
 * Schlüsselentscheidungen:
 *  - `valueInputOption=USER_ENTERED`: Sheets parst Datums-Strings, Hyperlinks
 *    und Formeln client-seitig. Damit funktioniert `=HYPERLINK(...)` aus
 *    Spalte M out-of-the-box.
 *  - `insertDataOption=INSERT_ROWS`: Append schiebt Daten unter dem letzten
 *    befüllten Bereich ein (statt OVERWRITE). Verhindert Kollisionen wenn
 *    der Kunde manuell Notizen unter der Tabelle hat.
 *  - Idempotenz-Cache `spreadsheet_row_index`: ohne diesen Cache müsste
 *    findRowByReceiptId() das gesamte Sheet scannen — bei großen Sheets teuer.
 */

import type { Pool } from 'pg';
import { google, type sheets_v4 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

import { logger } from '../../logger';
import { config } from '../../config';

import {
  HeaderConflictError,
  SpreadsheetNotFoundError,
  type ColumnDef,
  type RowRef,
  type RowResult,
  type RowValue,
  type SpreadsheetAdapter,
  type SpreadsheetAdapterContext,
} from './adapter.interface';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

interface OAuthRow {
  credential_id: string;
  refresh_token: string;
  access_token:  string | null;
  expires_at:    Date | null;
  scope:         string | null;
}

/**
 * Lädt OAuth-Credential für den Kunden. M07-Vorgabe:
 * Drive- und Sheets-Token können geteilt sein (gleicher OAuth2-Client) oder
 * getrennt vorliegen. Wir bevorzugen 'sheets_oauth'; wenn nicht vorhanden,
 * fallen wir auf 'gdrive_oauth' zurück, sofern dessen Scope auch Sheets
 * abdeckt.
 */
async function loadOAuthClient(db: Pool, customerId: string): Promise<OAuth2Client> {
  if (!config.PP_PGCRYPTO_KEY) {
    throw new Error('PP_PGCRYPTO_KEY ist nicht gesetzt — Sheets-Credential kann nicht entschlüsselt werden.');
  }

  const { rows } = await db.query<OAuthRow>(
    `SELECT credential_id,
            pgp_sym_decrypt(ciphertext, $2)::text     AS refresh_token,
            (meta->>'access_token')                    AS access_token,
            (meta->>'expires_at')::timestamptz         AS expires_at,
            (meta->>'scope')                           AS scope
       FROM customer_credentials
      WHERE customer_id = $1
        AND kind IN ('sheets_oauth', 'gdrive_oauth')
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY (kind = 'sheets_oauth') DESC,
               rotated_at DESC NULLS LAST,
               created_at DESC
      LIMIT 1`,
    [customerId, config.PP_PGCRYPTO_KEY],
  );

  const row = rows[0];
  if (!row) {
    throw new Error(`Kein OAuth-Credential für Sheets gefunden (customer_id=${customerId}).`);
  }

  // Wenn nur gdrive_oauth vorliegt: prüfen, dass Sheets-Scope abgedeckt ist.
  if (row.scope && !SHEETS_SCOPES.some((s) => row.scope!.includes(s)) && !row.scope.includes('drive')) {
    throw new Error(
      `OAuth-Credential für customer_id=${customerId} hat keinen Sheets-Scope (scope='${row.scope}'). ` +
        `Bitte separates Credential mit kind='sheets_oauth' anlegen.`,
    );
  }

  const oauth2 = new google.auth.OAuth2(
    config.GOOGLE_OAUTH_CLIENT_ID,
    config.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    refresh_token: row.refresh_token,
    access_token:  row.access_token ?? undefined,
    expiry_date:   row.expires_at ? row.expires_at.getTime() : undefined,
    scope:         row.scope ?? SHEETS_SCOPES.join(' '),
  });
  return oauth2;
}

function sheetsClient(auth: OAuth2Client): sheets_v4.Sheets {
  return google.sheets({ version: 'v4', auth });
}

/** Bei Sheets-Spalten nutzen wir A..Z (max 26 Spalten). M07 hat 16 Pflicht-
 *  Spalten + Extra-Columns; wir gehen von <26 aus, sonst Fehler. */
function colLetter(idx0: number): string {
  if (idx0 < 0 || idx0 >= 26) {
    throw new Error(`Spaltenindex ${idx0} außerhalb des unterstützten Bereichs A..Z.`);
  }
  return String.fromCharCode(65 + idx0);
}

function endColLetter(numCols: number): string {
  return colLetter(numCols - 1);
}

/** Parst "Belege 2026!A157:P157" → 157. */
function parseRowFromUpdatedRange(updatedRange: string | null | undefined): number {
  if (!updatedRange) throw new Error('Sheets-API hat kein updatedRange zurückgegeben.');
  // Beispiel: "Belege 2026!A157:P157" oder "'Belege 2026'!A157:P157"
  const match = updatedRange.match(/!([A-Z]+)(\d+)(?::[A-Z]+(\d+))?/);
  if (!match) throw new Error(`updatedRange '${updatedRange}' konnte nicht geparst werden.`);
  return Number.parseInt(match[2], 10);
}

function buildCellUrl(sheetId: string, gid: number, rowIndex: number): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}&range=A${rowIndex}`;
}

// ── Adapter-Implementation ───────────────────────────────────────────────────

export class GoogleSheetsAdapter implements SpreadsheetAdapter {
  readonly id = 'google_sheets' as const;

  async ensureTabExists(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
  ): Promise<void> {
    const auth = await loadOAuthClient(ctx.db, customerId);
    const sheets = sheetsClient(auth);

    let meta: sheets_v4.Schema$Spreadsheet;
    try {
      const res = await sheets.spreadsheets.get({
        spreadsheetId: sheetId,
        fields:        'sheets(properties(sheetId,title))',
      });
      meta = res.data;
    } catch (err) {
      if (isNotFoundError(err)) throw new SpreadsheetNotFoundError(sheetId);
      throw err;
    }

    const sheetList: SheetMeta[] = (meta.sheets ?? []) as SheetMeta[];
    const exists = sheetList.some((s) => s.properties?.title === tab);
    if (exists) return;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tab } } }],
      },
    });
    logger.info({ sheetId, tab, customerId }, 'M07 ensureTabExists: Tab angelegt');
  }

  async ensureHeader(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
    columns: ColumnDef[],
  ): Promise<void> {
    const auth = await loadOAuthClient(ctx.db, customerId);
    const sheets = sheetsClient(auth);

    const headerRange = `${quoteTab(tab)}!A1:${endColLetter(columns.length)}1`;
    const expected = columns.map((c) => c.header);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range:         headerRange,
    });
    const actualRow = (res.data.values?.[0] as string[] | undefined) ?? [];

    const isEmpty = actualRow.length === 0 || actualRow.every((v) => !v || v === '');
    if (isEmpty) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range:         headerRange,
        valueInputOption: 'USER_ENTERED',
        requestBody:   { values: [expected] },
      });
      logger.info({ sheetId, tab, columns: expected.length }, 'M07 ensureHeader: Header geschrieben');
      return;
    }

    // Vorhanden: Strikt vergleichen. M07 §12: KEINE Auto-Korrektur.
    const matches =
      actualRow.length === expected.length &&
      expected.every((h, i) => actualRow[i] === h);
    if (!matches) {
      throw new HeaderConflictError(sheetId, tab, expected, actualRow);
    }
  }

  async findRowByReceiptId(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
    receiptId: string,
  ): Promise<RowRef | null> {
    const { rows } = await ctx.db.query<{ row_index: number }>(
      `SELECT row_index
         FROM spreadsheet_row_index
        WHERE customer_id = $1 AND sheet_id = $2 AND tab = $3 AND receipt_id = $4
        LIMIT 1`,
      [customerId, sheetId, tab, receiptId],
    );
    return rows[0] ? { row_index: rows[0].row_index } : null;
  }

  async appendRow(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
    receiptId: string,
    row: RowValue[],
  ): Promise<RowResult> {
    const auth = await loadOAuthClient(ctx.db, customerId);
    const sheets = sheetsClient(auth);

    const range = `${quoteTab(tab)}!A1:${endColLetter(row.length)}1`;
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId:    sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody:      { values: [row] },
    });

    const rowIndex = parseRowFromUpdatedRange(res.data.updates?.updatedRange);
    const gid      = await getGidByTab(sheets, sheetId, tab);
    const url      = buildCellUrl(sheetId, gid, rowIndex);

    await ctx.db.query(
      `INSERT INTO spreadsheet_row_index (customer_id, sheet_id, tab, receipt_id, row_index)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (customer_id, sheet_id, tab, receipt_id)
         DO UPDATE SET row_index = EXCLUDED.row_index, updated_at = now()`,
      [customerId, sheetId, tab, receiptId, rowIndex],
    );

    return { row_index: rowIndex, url };
  }

  async updateRow(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
    receiptId: string,
    rowIndex: number,
    row: RowValue[],
  ): Promise<RowResult> {
    const auth = await loadOAuthClient(ctx.db, customerId);
    const sheets = sheetsClient(auth);

    const endCol = endColLetter(row.length);
    const range  = `${quoteTab(tab)}!A${rowIndex}:${endCol}${rowIndex}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId:    sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody:      { values: [row] },
    });

    await ctx.db.query(
      `UPDATE spreadsheet_row_index
          SET updated_at = now()
        WHERE customer_id = $1 AND sheet_id = $2 AND tab = $3 AND receipt_id = $4`,
      [customerId, sheetId, tab, receiptId],
    );

    const gid = await getGidByTab(sheets, sheetId, tab);
    const url = buildCellUrl(sheetId, gid, rowIndex);
    return { row_index: rowIndex, url };
  }
}

// ── Sheets-Helpers ───────────────────────────────────────────────────────────

/** Tab-Namen mit Leerzeichen müssen für A1-Notation in Single-Quotes. */
function quoteTab(tab: string): string {
  return tab.includes(' ') ? `'${tab.replace(/'/g, "''")}'` : tab;
}

const gidCache = new Map<string, number>();

async function getGidByTab(
  sheets: sheets_v4.Sheets,
  sheetId: string,
  tab: string,
): Promise<number> {
  const key = `${sheetId}::${tab}`;
  const cached = gidCache.get(key);
  if (cached !== undefined) return cached;

  const res = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields:        'sheets(properties(sheetId,title))',
  });
  const sheetList: SheetMeta[] = (res.data.sheets ?? []) as SheetMeta[];
  const found = sheetList.find((s) => s.properties?.title === tab);
  const gid = found?.properties?.sheetId ?? 0;
  gidCache.set(key, gid);
  return gid;
}

/** Schmaler Subset von sheets_v4.Schema$Sheet, damit der Code auch typecheckt,
 *  wenn `googleapis` zur Build-Zeit nicht installiert ist. */
interface SheetMeta {
  properties?: {
    sheetId?: number;
    title?:   string;
  };
}

interface MaybeApiError {
  code?:     number;
  response?: { status?: number };
}

function isNotFoundError(err: unknown): boolean {
  const e = err as MaybeApiError;
  return e?.code === 404 || e?.response?.status === 404;
}
