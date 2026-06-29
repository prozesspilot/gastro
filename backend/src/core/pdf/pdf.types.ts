/**
 * T086/A2 — Typen der generischen PDF-Dokument-Engine (`core/pdf`).
 *
 * Konsumenten: M08-Monatsreporting, DSGVO-Auskunft, GoBD-Doku. Reine
 * Daten-Typen, damit Caller Berichte deklarativ beschreiben, ohne `pdf-lib`
 * direkt zu kennen.
 */

/** Eine einzelne KPI-Karte (Label oben, großer Wert darunter). */
export interface KpiCard {
  label: string;
  value: string;
}

/** Label/Wert-Zeile für kompakte Kennzahlen-Blöcke. */
export interface KeyValueRow {
  label: string;
  value: string;
}

/** Spaltendefinition einer Tabelle. `width` ist ein relatives Gewicht (wird auf die Inhaltsbreite normalisiert). */
export interface TableColumn {
  header: string;
  /** Relatives Breiten-Gewicht (z. B. 3 vs. 1). Absolute Punkte sind NICHT erforderlich — wird normalisiert. */
  width: number;
  align?: 'left' | 'right';
}

/** Vollständige Tabellen-Spezifikation. `rows` sind bereits formatierte Strings (Zahlen-Formatierung macht der Caller). */
export interface TableSpec {
  columns: TableColumn[];
  rows: string[][];
  /** Zebra-Hintergrund für gerade Zeilen (Default: true). */
  zebra?: boolean;
}

/** Optionen beim Anlegen eines Dokuments. */
export interface PdfDocumentOptions {
  /** Dokument-Titel (GoBD-Metadata + ist NICHT automatisch sichtbar im Body). */
  title: string;
  /** Autor/Producer-Zusatz (Default-Producer ist immer 'ProzessPilot'). */
  author?: string;
  /** Seitengröße (aktuell nur A4). */
  pageSize?: 'A4';
  /**
   * Injizierbarer Zeitstempel für CreationDate + Fußzeile — macht Golden-Tests
   * deterministisch. Default: `new Date()` zur Build-Zeit.
   */
  now?: Date;
}
