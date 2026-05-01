/**
 * M07 — Spalten-Schema (M07 §8).
 *
 * Verbindlich: Reihenfolge A..P, alle Provider erzeugen die gleichen Spalten.
 * Erweiterungen pro Kunde (`profile.custom.spreadsheet_extra_columns`) werden
 * vom row-builder rechts angehängt.
 */

import type { ColumnDef } from '../../../core/adapters/spreadsheet/factory';

export const COLUMNS: ColumnDef[] = [
  { header: 'Datum',         description: 'extraction.fields.document_date' },                  // A
  { header: 'Lieferant',     description: 'extraction.fields.supplier_name' },                  // B
  { header: 'Belegnummer',   description: 'extraction.fields.document_number' },                // C
  { header: 'Kategorie',     description: 'categorization.category_label (oder "–")' },          // D
  { header: 'SKR-Konto',     description: 'categorization.skr_account' },                       // E
  { header: 'Kostenstelle',  description: 'categorization.cost_center' },                       // F
  { header: 'Brutto',        description: 'extraction.fields.total_gross (Zahl)' },             // G
  { header: 'Netto',         description: 'extraction.fields.total_net (Zahl)' },               // H
  { header: 'MwSt-Betrag',   description: 'Σ extraction.fields.tax_lines.amount' },             // I
  { header: 'MwSt-Satz',     description: 'dominanter Satz × 100 (%)' },                        // J
  { header: 'Währung',       description: 'extraction.fields.currency' },                       // K
  { header: 'Zahlungsart',   description: 'extraction.fields.payment_method' },                 // L
  { header: 'Beleg-Datei',   description: 'archive.path als =HYPERLINK()-Formel' },             // M
  { header: 'Status',        description: 'status' },                                           // N
  { header: 'Receipt-ID',    description: 'receipt_id' },                                       // O
  { header: 'Eingang am',    description: 'audit.events[type=received].at' },                   // P
];

export const COLUMN_COUNT = COLUMNS.length; // = 16
