/**
 * M07 — Spreadsheet-Adapter-Interface (M07 §9.1)
 *
 * Vereinheitlicht den Zugriff auf verschiedene Spreadsheet-Provider
 * (Google Sheets, Excel/OneDrive). Konsumenten reden ausschließlich über
 * dieses Interface; der konkrete Provider wird über die Factory ausgewählt.
 *
 * Alle Methoden werden mit `customerId` aufgerufen, weil der Adapter
 * Credentials je Kunde lädt (M07 §9.2).
 */

import type { Pool } from 'pg';

export type SpreadsheetProviderId = 'google_sheets' | 'excel_onedrive';

/** Zellwert. `null` schreibt eine leere Zelle; Formeln (z. B. =HYPERLINK(...))
 *  funktionieren, weil der Adapter `valueInputOption=USER_ENTERED` nutzt. */
export type RowValue = string | number | boolean | null;

export interface ColumnDef {
  /** Header-Beschriftung (Zeile 1). */
  header: string;
  /** Optionaler Hinweis für Tooling/Doku. */
  description?: string;
}

export interface RowRef {
  /** 1-basierte Zeilennummer im Tab (Header = Zeile 1, erste Datenzeile = 2). */
  row_index: number;
}

export interface RowResult {
  /** 1-basierte Zeilennummer der zuletzt geschriebenen Zeile. */
  row_index: number;
  /** Direkt anklickbare URL auf die Zelle. */
  url: string;
}

/**
 * Kontext, den der Adapter zur DB-Persistenz braucht. Wird vom Handler beim
 * Aufruf injected — der Adapter selbst ist stateless gegenüber HTTP-Requests.
 */
export interface SpreadsheetAdapterContext {
  db: Pool;
}

export interface SpreadsheetAdapter {
  readonly id: SpreadsheetProviderId;

  /**
   * Stellt sicher, dass der Tab im Sheet existiert. Legt ihn an, wenn nicht.
   * Idempotent: zweimaliger Aufruf hat keine Nebenwirkung.
   */
  ensureTabExists(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
  ): Promise<void>;

  /**
   * Stellt sicher, dass die erste Zeile dem erwarteten Header entspricht.
   * - Leere Zeile → schreibt Header.
   * - Header passt → no-op.
   * - Header divergent → wirft `HeaderConflictError` (M07 §12: keine
   *   Auto-Korrektur, Operator-Alert ist Aufgabe des Aufrufers).
   */
  ensureHeader(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
    columns: ColumnDef[],
  ): Promise<void>;

  /**
   * Idempotenz-Lookup: Wenn der Beleg bereits in das Sheet exportiert wurde,
   * gibt {row_index} zurück. Sonst null.
   *
   * Implementations-Hinweis: Lookup erfolgt primär über `spreadsheet_row_index`
   * (schneller, kein API-Call); ein Fallback auf einen Sheet-Scan ist möglich
   * aber im MVP nicht zwingend.
   */
  findRowByReceiptId(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
    receiptId: string,
  ): Promise<RowRef | null>;

  /**
   * Hängt eine neue Zeile am Tab-Ende an und persistiert
   * (customer_id, sheet_id, tab, receipt_id, row_index) in spreadsheet_row_index.
   */
  appendRow(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
    receiptId: string,
    row: RowValue[],
  ): Promise<RowResult>;

  /**
   * Überschreibt eine bekannte Zeile (z. B. nach Re-Run derselben receipt_id).
   * Aktualisiert auch updated_at in spreadsheet_row_index.
   */
  updateRow(
    ctx: SpreadsheetAdapterContext,
    customerId: string,
    sheetId: string,
    tab: string,
    receiptId: string,
    rowIndex: number,
    row: RowValue[],
  ): Promise<RowResult>;
}

// ── Adapter-spezifische Fehler ───────────────────────────────────────────────

/**
 * Header in Sheet weicht vom erwarteten Schema ab. M07 §12 verlangt
 * Operator-Alert statt Auto-Korrektur — der Handler fängt diesen Fehler ab.
 */
export class HeaderConflictError extends Error {
  readonly code = 'HEADER_CONFLICT';
  constructor(
    public readonly sheetId: string,
    public readonly tab: string,
    public readonly expected: string[],
    public readonly actual: string[],
  ) {
    super(
      `Header-Konflikt in ${sheetId}/${tab}: erwartet [${expected.join(', ')}], gefunden [${actual.join(', ')}]`,
    );
    this.name = 'HeaderConflictError';
  }
}

/** Spreadsheet existiert nicht oder Credential hat keinen Zugriff darauf. */
export class SpreadsheetNotFoundError extends Error {
  readonly code = 'SPREADSHEET_NOT_FOUND';
  constructor(public readonly sheetId: string) {
    super(`Spreadsheet ${sheetId} nicht gefunden oder keine Berechtigung.`);
    this.name = 'SpreadsheetNotFoundError';
  }
}
