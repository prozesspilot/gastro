/**
 * M07 — Excel/OneDrive-Adapter (M07 §9.3)
 *
 * Schreibt Belegzeilen in eine Excel-Datei in OneDrive via MS Graph API.
 * OAuth2-Tokens kommen aus customer_credentials (kind='msgraph_oauth' oder
 * 'onedrive_oauth'). Token-Refresh erfolgt on-demand wenn expires_at < now+5min.
 *
 * DECISION: Kein @microsoft/microsoft-graph-client SDK — wir nutzen native
 * fetch mit dem Access-Token direkt. Das vermeidet heavyweight SDK-Abhängigkeiten
 * und hält den Adapter testbar via vi.spyOn(global, 'fetch').
 *
 * DECISION: Fallback für appendRow: wenn keine Excel-Table im Sheet vorhanden,
 * nutzen wir GET auf den benutzen Bereich + POST auf die nächste freie Zeile.
 *
 * Idempotenz-Cache: spreadsheet_row_index (Postgres) — identisch zur
 * Google-Sheets-Implementierung (M07 §9.2).
 */

import type { Pool } from 'pg';

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

// ── Constanten ────────────────────────────────────────────────────────────────

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 Minuten

// ── Credential-Types ─────────────────────────────────────────────────────────

interface MsGraphCredentialRow {
  credential_id: string;
  access_token: string;
  refresh_token: string;
  tenant_id: string | null;
  expires_at: Date | null;
}

interface MsGraphToken {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  expiresAt: Date | null;
  credentialId: string;
}

// ── Token-Loading & Refresh ───────────────────────────────────────────────────

async function loadMsGraphToken(db: Pool, customerId: string): Promise<MsGraphToken> {
  if (!config.PP_PGCRYPTO_KEY) {
    throw new Error('PP_PGCRYPTO_KEY nicht gesetzt — MS-Graph-Credential kann nicht entschlüsselt werden.');
  }

  const { rows } = await db.query<MsGraphCredentialRow>(
    `SELECT credential_id,
            (meta->>'access_token')                      AS access_token,
            pgp_sym_decrypt(ciphertext, $2)::text        AS refresh_token,
            (meta->>'tenant_id')                         AS tenant_id,
            (meta->>'expires_at')::timestamptz           AS expires_at
       FROM customer_credentials
      WHERE customer_id = $1
        AND kind IN ('msgraph_oauth', 'onedrive_oauth')
      ORDER BY (kind = 'msgraph_oauth') DESC,
               rotated_at DESC NULLS LAST,
               created_at DESC
      LIMIT 1`,
    [customerId, config.PP_PGCRYPTO_KEY],
  );

  const row = rows[0];
  if (!row) {
    throw new Error(`Kein MS-Graph-Credential für customer_id=${customerId}.`);
  }

  const tenantId = row.tenant_id ?? process.env.MSGRAPH_TENANT_ID ?? 'common';

  return {
    credentialId: row.credential_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tenantId,
    expiresAt: row.expires_at,
  };
}

interface RefreshedTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function refreshMsGraphToken(
  db: Pool,
  customerId: string,
  token: MsGraphToken,
): Promise<MsGraphToken> {
  const clientId = process.env.MSGRAPH_CLIENT_ID ?? '';
  const clientSecret = process.env.MSGRAPH_CLIENT_SECRET ?? '';
  const tokenUrl = `https://login.microsoftonline.com/${token.tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refreshToken,
    scope: 'https://graph.microsoft.com/.default offline_access',
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`MS-Graph token refresh fehlgeschlagen (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as RefreshedTokenResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  const newRefreshToken = data.refresh_token ?? token.refreshToken;

  // Persistiere neuen Access-Token in customer_credentials
  await db.query(
    `UPDATE customer_credentials
        SET meta = meta
              || jsonb_build_object(
                   'access_token', $3::text,
                   'expires_at',   $4::text
                 ),
            rotated_at = now()
      WHERE credential_id = $1
        AND customer_id   = $2`,
    [token.credentialId, customerId, data.access_token, expiresAt.toISOString()],
  );

  // Wenn ein neuer Refresh-Token geliefert wurde, ciphertext aktualisieren
  if (data.refresh_token) {
    await db.query(
      `UPDATE customer_credentials
          SET ciphertext = pgp_sym_encrypt($3, $4)::bytea
        WHERE credential_id = $1
          AND customer_id   = $2`,
      [token.credentialId, customerId, newRefreshToken, config.PP_PGCRYPTO_KEY],
    );
  }

  logger.info({ customerId, credentialId: token.credentialId }, 'MS-Graph access-token refreshed');

  return {
    ...token,
    accessToken: data.access_token,
    refreshToken: newRefreshToken,
    expiresAt,
  };
}

/**
 * Gibt einen frischen Access-Token zurück. Refresht on-demand wenn
 * expires_at < now + 5 Minuten (TOKEN_REFRESH_BUFFER_MS).
 */
async function loadMsGraphClient(
  db: Pool,
  customerId: string,
): Promise<{ accessToken: string; baseUrl: string }> {
  let token = await loadMsGraphToken(db, customerId);

  const needsRefresh =
    !token.expiresAt ||
    token.expiresAt.getTime() < Date.now() + TOKEN_REFRESH_BUFFER_MS;

  if (needsRefresh) {
    token = await refreshMsGraphToken(db, customerId, token);
  }

  return { accessToken: token.accessToken, baseUrl: GRAPH_BASE };
}

// ── Graph-API-Helpers ─────────────────────────────────────────────────────────

interface GraphError {
  error?: { code?: string; message?: string };
}

async function graphRequest<T>(
  accessToken: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    let errMsg = `MS Graph ${method} ${url} → ${resp.status}`;
    try {
      const errBody = (await resp.json()) as GraphError;
      if (errBody?.error?.message) errMsg += `: ${errBody.error.message}`;
    } catch {
      // ignore parse error
    }
    throw new Error(errMsg);
  }

  // 204 No Content
  if (resp.status === 204) return undefined as unknown as T;

  return resp.json() as Promise<T>;
}

/** Bei Sheets-Spalten nutzen wir A..Z (max 26 Spalten). M07 hat 16 Pflicht-Spalten. */
function colLetter(idx0: number): string {
  if (idx0 < 0 || idx0 >= 26) {
    throw new Error(`Spaltenindex ${idx0} außerhalb des unterstützten Bereichs A..Z.`);
  }
  return String.fromCharCode(65 + idx0);
}

function endColLetter(numCols: number): string {
  return colLetter(numCols - 1);
}

function buildOneDriveUrl(sheetId: string): string {
  return `https://onedrive.live.com/edit.aspx?resid=${sheetId}`;
}

// ── Worksheet-Response-Types ──────────────────────────────────────────────────

interface WorksheetItem {
  id: string;
  name: string;
}

interface WorksheetsResponse {
  value: WorksheetItem[];
}

interface RangeResponse {
  values: RowValue[][];
  rowCount: number;
  columnCount: number;
}

interface TableRowAddResponse {
  index: number;
}

interface UsedRangeResponse {
  rowCount: number;
  address: string;
}

// ── Adapter-Implementation ────────────────────────────────────────────────────

export class ExcelOneDriveAdapter implements SpreadsheetAdapter {
  readonly id = 'excel_onedrive' as const;

  async ensureTabExists(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
  ): Promise<void> {
    const { accessToken, baseUrl } = await loadMsGraphClient(ctx.db, customerId);
    const worksheetsUrl = `${baseUrl}/drives/me/items/${sheetId}/workbook/worksheets`;

    let listResp: WorksheetsResponse;
    try {
      listResp = await graphRequest<WorksheetsResponse>(
        accessToken,
        'GET',
        worksheetsUrl,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('itemNotFound')) {
        throw new SpreadsheetNotFoundError(sheetId);
      }
      throw err;
    }

    const exists = listResp.value.some((ws) => ws.name === tab);
    if (exists) return;

    await graphRequest<WorksheetItem>(
      accessToken,
      'POST',
      worksheetsUrl,
      { name: tab },
    );
    logger.info({ sheetId, tab, customerId }, 'M07 Excel ensureTabExists: Tab angelegt');
  }

  async ensureHeader(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
    columns: ColumnDef[],
  ): Promise<void> {
    const { accessToken, baseUrl } = await loadMsGraphClient(ctx.db, customerId);
    const expected = columns.map((c) => c.header);
    const endCol = endColLetter(columns.length);
    const rangeAddr = `A1:${endCol}1`;
    const rangeUrl =
      `${baseUrl}/drives/me/items/${sheetId}/workbook/worksheets/${encodeURIComponent(tab)}/range(address='${rangeAddr}')`;

    const rangeResp = await graphRequest<RangeResponse>(accessToken, 'GET', rangeUrl);
    const actualRow = (rangeResp.values?.[0] ?? []) as (string | null)[];
    const isEmpty =
      actualRow.length === 0 || actualRow.every((v) => v === null || v === '');

    if (isEmpty) {
      await graphRequest<unknown>(accessToken, 'PATCH', rangeUrl, {
        values: [expected],
      });
      logger.info({ sheetId, tab, columns: expected.length }, 'M07 Excel ensureHeader: Header geschrieben');
      return;
    }

    // M07 §12: KEINE Auto-Korrektur bei divergentem Header.
    const actualStrings = actualRow.map((v) => (v === null ? '' : String(v)));
    const matches =
      actualStrings.length === expected.length &&
      expected.every((h, i) => actualStrings[i] === h);
    if (!matches) {
      throw new HeaderConflictError(sheetId, tab, expected, actualStrings);
    }
  }

  async findRowByReceiptId(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
    receiptId: string,
  ): Promise<RowRef | null> {
    // Primär: DB-Cache (spreadsheet_row_index)
    const { rows } = await ctx.db.query<{ row_index: number }>(
      `SELECT row_index
         FROM spreadsheet_row_index
        WHERE customer_id = $1 AND sheet_id = $2 AND tab = $3 AND receipt_id = $4
        LIMIT 1`,
      [customerId, sheetId, tab, receiptId],
    );
    if (rows[0]) return { row_index: rows[0].row_index };

    // Fallback: Sheet-Scan via Graph API (Spalte O = Index 14, 0-basiert)
    const { accessToken, baseUrl } = await loadMsGraphClient(ctx.db, customerId);
    const rangeUrl =
      `${baseUrl}/drives/me/items/${sheetId}/workbook/worksheets/${encodeURIComponent(tab)}/range(address='A:O')`;

    let rangeResp: RangeResponse;
    try {
      rangeResp = await graphRequest<RangeResponse>(accessToken, 'GET', rangeUrl);
    } catch {
      return null;
    }

    const values = rangeResp.values ?? [];
    // Zeile 0 = Header (1-basierter row_index 1), Daten starten bei Index 1 (row_index 2)
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      // Spalte O ist Index 14
      if (row && row[14] !== undefined && String(row[14]) === receiptId) {
        const rowIndex = i + 1; // 1-basiert
        // Cache schreiben
        await ctx.db.query(
          `INSERT INTO spreadsheet_row_index (customer_id, sheet_id, tab, receipt_id, row_index)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (customer_id, sheet_id, tab, receipt_id)
             DO UPDATE SET row_index = EXCLUDED.row_index, updated_at = now()`,
          [customerId, sheetId, tab, receiptId, rowIndex],
        );
        return { row_index: rowIndex };
      }
    }

    return null;
  }

  async appendRow(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
    receiptId: string,
    row: RowValue[],
  ): Promise<RowResult> {
    const { accessToken, baseUrl } = await loadMsGraphClient(ctx.db, customerId);
    const worksheetBase =
      `${baseUrl}/drives/me/items/${sheetId}/workbook/worksheets/${encodeURIComponent(tab)}`;

    // Versuche zuerst über Excel-Table
    const tablesUrl = `${worksheetBase}/tables`;
    let rowIndex: number;

    try {
      const tablesResp = await graphRequest<{ value: Array<{ id: string; name: string }> }>(
        accessToken,
        'GET',
        tablesUrl,
      );

      if (tablesResp.value.length > 0) {
        // Erste Tabelle im Sheet verwenden
        const tableId = tablesResp.value[0].id;
        const addRowUrl = `${worksheetBase}/tables/${tableId}/rows/add`;
        const addResp = await graphRequest<TableRowAddResponse>(
          accessToken,
          'POST',
          addRowUrl,
          { values: [row] },
        );
        // addResp.index ist 0-basiert; +2 wegen Header + 1-Basierung
        rowIndex = addResp.index + 2;
      } else {
        // Fallback: usedRange holen, nächste freie Zeile berechnen
        rowIndex = await appendViaRange(accessToken, baseUrl, sheetId, tab, row);
      }
    } catch (err) {
      // Wenn Tables-Endpoint 404 wirft → direkt über Range
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('itemNotFound') || msg.includes('tables')) {
        rowIndex = await appendViaRange(accessToken, baseUrl, sheetId, tab, row);
      } else {
        throw err;
      }
    }

    // Idempotenz-Cache schreiben
    await ctx.db.query(
      `INSERT INTO spreadsheet_row_index (customer_id, sheet_id, tab, receipt_id, row_index)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (customer_id, sheet_id, tab, receipt_id)
         DO UPDATE SET row_index = EXCLUDED.row_index, updated_at = now()`,
      [customerId, sheetId, tab, receiptId, rowIndex],
    );

    const url = buildOneDriveUrl(sheetId);
    logger.info({ sheetId, tab, customerId, rowIndex }, 'M07 Excel appendRow: Zeile geschrieben');
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
    const { accessToken, baseUrl } = await loadMsGraphClient(ctx.db, customerId);
    const endCol = endColLetter(row.length);
    const rangeAddr = `A${rowIndex}:${endCol}${rowIndex}`;
    const rangeUrl =
      `${baseUrl}/drives/me/items/${sheetId}/workbook/worksheets/${encodeURIComponent(tab)}/range(address='${rangeAddr}')`;

    await graphRequest<unknown>(accessToken, 'PATCH', rangeUrl, {
      values: [row],
    });

    await ctx.db.query(
      `UPDATE spreadsheet_row_index
          SET updated_at = now()
        WHERE customer_id = $1 AND sheet_id = $2 AND tab = $3 AND receipt_id = $4`,
      [customerId, sheetId, tab, receiptId],
    );

    const url = buildOneDriveUrl(sheetId);
    logger.info({ sheetId, tab, customerId, rowIndex }, 'M07 Excel updateRow: Zeile aktualisiert');
    return { row_index: rowIndex, url };
  }
}

// ── Range-Fallback für appendRow (ohne Excel-Table) ──────────────────────────

async function appendViaRange(
  accessToken: string,
  baseUrl: string,
  sheetId: string,
  tab: string,
  row: RowValue[],
): Promise<number> {
  const worksheetBase =
    `${baseUrl}/drives/me/items/${sheetId}/workbook/worksheets/${encodeURIComponent(tab)}`;

  // Benutzten Bereich abfragen um nächste freie Zeile zu ermitteln
  const usedRangeUrl = `${worksheetBase}/usedRange(valuesOnly=true)`;
  let nextRow = 2; // Default: Zeile 2 (nach Header)

  try {
    const used = await graphRequest<UsedRangeResponse>(accessToken, 'GET', usedRangeUrl);
    if (used.rowCount > 0) {
      nextRow = used.rowCount + 1;
    }
  } catch {
    // usedRange wirft wenn leer — Default 2 verwenden
  }

  const endCol = endColLetter(row.length);
  const rangeAddr = `A${nextRow}:${endCol}${nextRow}`;
  const insertUrl = `${worksheetBase}/range(address='${rangeAddr}')`;

  await graphRequest<unknown>(accessToken, 'PATCH', insertUrl, {
    values: [row],
  });

  return nextRow;
}
