/**
 * M04 — DATEV EXTF CSV-Renderer.
 *
 * Zeile 1: EXTF-Header (fixe Struktur §8.1)
 * Zeile 2: Spalten-Header (§8.2)
 * Ab Zeile 3: Datenzeilen (§8.3)
 *
 * Encoding: UTF-8 mit BOM (Standard).
 * Falls CustomerProfile.datev_encoding === 'windows-1252': iconv-lite Konvertierung.
 * Dezimaltrenner: Komma (1234,56) — kein Punkt!
 */

import { createHash } from 'node:crypto';
import type { Receipt } from '../../_shared/receipts/receipt.repository';
import { type CustomerProfileForDatev, resolveCounterAccount } from './counter-account-resolver';

// UTF-8 BOM
const BOM = '﻿';

// ── BU-Schlüssel Mapping ──────────────────────────────────────────────────────

const BU_KEY_MAP: Record<number, string> = {
  19: '9',
  7: '2',
  0: '40',
};

// ── DATEV EXTF Header-Konstanten ─────────────────────────────────────────────

const EXTF_FORMAT_VERSION = 700;
const EXTF_DATA_CATEGORY = 21; // Buchungsstapel
const EXTF_FORMAT_NAME = 'Buchungsstapel';
const EXTF_FORMAT_VERSION2 = 9;

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface DatevPeriod {
  year: number;
  month: number;
}

export interface RenderDatevCsvInput {
  receipts: Receipt[];
  profile: CustomerProfileForDatev & {
    datev_consultant_no?: string;
    datev_client_no?: string;
    datev_encoding?: 'utf-8' | 'windows-1252';
    skr_type?: 'skr03' | 'skr04';
    datev_importer?: string;
  };
  period: DatevPeriod;
}

export interface RenderDatevCsvResult {
  csv: Buffer;
  sha256: string;
  rows_count: number;
}

// ── Main Render Function ─────────────────────────────────────────────────────

export function renderDatevCsv(input: RenderDatevCsvInput): RenderDatevCsvResult {
  const { receipts, profile, period } = input;

  const consultantNo = profile.datev_consultant_no ?? '0';
  const clientNo = profile.datev_client_no ?? '0';
  const accountingYear = String(period.year);
  const dateFrom = formatDateYYYYMMDD(period.year, period.month, 1);
  const dateTo = formatDateYYYYMMDD(
    period.year,
    period.month,
    lastDayOfMonth(period.year, period.month),
  );
  const importer = profile.datev_importer ?? 'ProzessPilot';
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

  // Zeile 1: EXTF-Header
  const headerLine = [
    '"EXTF"',
    EXTF_FORMAT_VERSION,
    EXTF_DATA_CATEGORY,
    `"${EXTF_FORMAT_NAME}"`,
    EXTF_FORMAT_VERSION2,
    timestamp,
    '', // Leerfeld
    `"${importer}"`,
    '', // Leerfeld
    consultantNo,
    clientNo,
    accountingYear,
    dateFrom,
    dateTo,
    '', // Leerfeld
    '""', // Bezeichnung
    '', // Leerfeld
    '1', // Festschreibung
    '0', // Kennzeichen
    '"EUR"', // Währung
    '0', // Debitor/Kreditor-BU
    '""', // SKR
    '0', // Branchenlösung
    '', // Leerfeld
    '', // Leerfeld
    '""', // Anwendungsinformation
  ].join(';');

  // Zeile 2: Spalten-Header
  const columnHeader = [
    'Umsatz',
    'Soll/Haben-Kennzeichen',
    'WKZ Umsatz',
    'Kurs',
    'Basisumsatz',
    'WKZ Basisumsatz',
    'Konto',
    'Gegenkonto (ohne BU-Schluessel)',
    'BU-Schluessel',
    'Belegdatum',
    'Belegfeld 1',
    'Belegfeld 2',
    'Skonto',
    'Buchungstext',
    'Postensperre',
    'Diverse Adressnummer',
    'Geschaeftspartnerbank',
    'Sachverhalt',
    'Zinssperre',
    'Beleglink',
    'Beleginfo - Art 1',
    'Beleginfo - Inhalt 1',
    'Beleginfo - Art 2',
    'Beleginfo - Inhalt 2',
    'Beleginfo - Art 3',
    'Beleginfo - Inhalt 3',
    'Beleginfo - Art 4',
    'Beleginfo - Inhalt 4',
    'Beleginfo - Art 5',
    'Beleginfo - Inhalt 5',
    'Beleginfo - Art 6',
    'Beleginfo - Inhalt 6',
    'Beleginfo - Art 7',
    'Beleginfo - Inhalt 7',
    'Beleginfo - Art 8',
    'Beleginfo - Inhalt 8',
    'KOST1 - Kostenstelle',
    'KOST2 - Kostenstelle',
    'Kost-Menge',
    'EU-Land u. UStID',
    'EU-Steuersatz',
    'Abweichende Versteuerungsart',
    'Sachverhalt L+L',
    'Funktionsergaenzung L+L',
    'BU 49 Hauptfunktionstyp',
    'BU 49 Hauptfunktionsnummer',
    'BU 49 Funktionsergaenzung',
    'Zusatzinformation - Art 1',
    'Zusatzinformation - Inhalt 1',
    'Zusatzinformation - Art 2',
    'Zusatzinformation - Inhalt 2',
    'Zusatzinformation - Art 3',
    'Zusatzinformation - Inhalt 3',
    'Zusatzinformation - Art 4',
    'Zusatzinformation - Inhalt 4',
    'Zusatzinformation - Art 5',
    'Zusatzinformation - Inhalt 5',
    'Zusatzinformation - Art 6',
    'Zusatzinformation - Inhalt 6',
    'Zusatzinformation - Art 7',
    'Zusatzinformation - Inhalt 7',
    'Zusatzinformation - Art 8',
    'Zusatzinformation - Inhalt 8',
    'Zusatzinformation - Art 9',
    'Zusatzinformation - Inhalt 9',
    'Zusatzinformation - Art 10',
    'Zusatzinformation - Inhalt 10',
    'Zusatzinformation - Art 11',
    'Zusatzinformation - Inhalt 11',
    'Zusatzinformation - Art 12',
    'Zusatzinformation - Inhalt 12',
    'Zusatzinformation - Art 13',
    'Zusatzinformation - Inhalt 13',
    'Zusatzinformation - Art 14',
    'Zusatzinformation - Inhalt 14',
    'Zusatzinformation - Art 15',
    'Zusatzinformation - Inhalt 15',
    'Zusatzinformation - Art 16',
    'Zusatzinformation - Inhalt 16',
    'Zusatzinformation - Art 17',
    'Zusatzinformation - Inhalt 17',
    'Zusatzinformation - Art 18',
    'Zusatzinformation - Inhalt 18',
    'Zusatzinformation - Art 19',
    'Zusatzinformation - Inhalt 19',
    'Zusatzinformation - Art 20',
    'Zusatzinformation - Inhalt 20',
    'Stueck',
    'Gewicht',
    'Zahlweise',
    'Forderungsart',
    'Veranlagungsjahr',
    'Zugeordnete Faelligkeit',
    'Skontotyp',
    'Auftragsnummer',
    'Buchungstyp',
    'USt-Schluesselnummer',
    'USt-Sachverhalt L+L',
    'Erloskonto',
    'Herkunft-Kz',
    'Buchungs GUID',
    'KOST-Datum',
    'SEPA-Mandatsreferenz',
    'Skontosperre',
    'Gesellschaftername',
    'Beteiligtennummer',
    'Identifikationsnummer',
    'Zeichnernummer',
    'Postensperre bis',
    'Bezeichnung SoBil-Sachverhalt',
    'Kennzeichen SoBil-Buchung',
    'Festschreibung',
    'Leistungsdatum',
    'Datum Zuord. Steuerperiode',
    'Faelligkeit',
    'Generalumkehr (GU)',
    'Steuersatz',
    'Land',
    'Abrechnungsreferenz',
    'BVV-Position',
    'EU-Mitgliedstaat u. UStID Ursprungsland',
    'EU-Steuersatz Ursprungsland',
  ].join(';');

  // Zeile 3+: Datenzeilen
  const skrType = profile.skr_type ?? 'skr03';
  const dataRows = receipts.map((r) => toDatevRow(r, profile, skrType));

  // CSV zusammensetzen
  const lines = [headerLine, columnHeader, ...dataRows];
  const csvText = `${BOM + lines.join('\r\n')}\r\n`;

  let csvBuffer: Buffer;

  if (profile.datev_encoding === 'windows-1252') {
    // iconv-lite für Windows-1252 Konvertierung
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const iconv = require('iconv-lite') as {
        encode: (str: string, encoding: string) => Buffer;
      };
      csvBuffer = iconv.encode(csvText, 'win1252');
    } catch {
      // iconv-lite nicht installiert → UTF-8 Fallback
      csvBuffer = Buffer.from(csvText, 'utf-8');
    }
  } else {
    csvBuffer = Buffer.from(csvText, 'utf-8');
  }

  const sha256 = createHash('sha256').update(csvBuffer).digest('hex');

  return {
    csv: csvBuffer,
    sha256,
    rows_count: dataRows.length,
  };
}

// ── toDatevRow ────────────────────────────────────────────────────────────────

export function toDatevRow(
  receipt: Receipt,
  profile: CustomerProfileForDatev,
  skrType: 'skr03' | 'skr04' = 'skr03',
): string {
  const fields = ((receipt.extraction as { fields?: Record<string, unknown> } | undefined)
    ?.fields ?? {}) as {
    total_gross?: number;
    document_date?: string;
    document_number?: string;
    vendor_name?: string;
    tax_lines?: Array<{ rate: number; amount: number }>;
  };

  const cat = (receipt.categorization as Record<string, unknown> | undefined) ?? {};

  // Umsatz: Komma als Dezimaltrenner (DATEV-Format)
  const totalAmount = Number(fields.total_gross ?? 0);
  const umsatz = formatDecimalDE(totalAmount);

  // Soll/Haben: immer 'S' für Aufwand
  const soll_haben = 'S';

  // WKZ: Währung (leer = EUR)
  const wkz = '';

  // Kurs, Basisumsatz, WKZ Basisumsatz (leer)
  const kurs = '';
  const basisumsatz = '';
  const wkz_basis = '';

  // Konto: SKR03 oder SKR04 aus Kategorisierung
  const konto =
    skrType === 'skr04'
      ? String(cat.skr04_konto ?? cat.skr_account ?? '4980')
      : String(cat.skr03_konto ?? cat.skr_account ?? '4980');

  // Gegenkonto
  const gegenkonto = resolveCounterAccount(receipt, profile);

  // BU-Schlüssel: aus dominantem Steuersatz
  const taxLines = fields.tax_lines ?? [];
  const dominantTaxPct = getDominantTaxPct(taxLines);
  const bu_key = BU_KEY_MAP[dominantTaxPct] ?? '';

  // Belegdatum: DDMM (4 Zeichen)
  const docDateRaw = fields.document_date ?? '';
  const belegdatum = docDateRaw ? formatBelegdatum(docDateRaw) : '';

  // Belegfeld 1: Rechnungsnummer, max 12 Zeichen
  const belegfeld1 = truncate(sanitizeText(fields.document_number ?? receipt.receipt_id), 12);

  // Belegfeld 2 (leer)
  const belegfeld2 = '';

  // Skonto (leer)
  const skonto = '';

  // Buchungstext: Lieferantenname, max 60 Zeichen, Sonderzeichen entfernen
  const buchungstext = truncate(sanitizeText(fields.vendor_name ?? ''), 60);

  // Beleglink
  const beleglink = `BELEG://${receipt.receipt_id}.pdf`;

  // Alle weiteren Felder leer lassen (Pflichtfelder haben leere Defaults)
  const emptyFields = Array(110).fill('').join(';');

  return `${[
    umsatz,
    soll_haben,
    wkz,
    kurs,
    basisumsatz,
    wkz_basis,
    konto,
    gegenkonto,
    bu_key,
    belegdatum,
    belegfeld1,
    belegfeld2,
    skonto,
    buchungstext,
    // Postensperre
    '',
    // Diverse Adressnummer
    '',
    // Geschaeftspartnerbank
    '',
    // Sachverhalt
    '',
    // Zinssperre
    '',
    // Beleglink
    beleglink,
  ].join(';')};${emptyFields}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formatiert eine Dezimalzahl mit Komma als Dezimaltrenner (DATEV-Format).
 * Beispiel: 1234.56 → "1234,56"
 */
export function formatDecimalDE(n: number): string {
  const rounded = Math.abs(Math.round(n * 100) / 100);
  return rounded.toFixed(2).replace('.', ',');
}

/**
 * Belegdatum: DDMM (4 Zeichen) aus ISO-Datum YYYY-MM-DD.
 */
export function formatBelegdatum(isoDate: string): string {
  // Unterstützt "YYYY-MM-DD" oder "DD.MM.YYYY"
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [, mm, dd] = isoDate.split('-');
    return `${dd}${mm}`;
  }
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(isoDate)) {
    const [dd, mm] = isoDate.split('.');
    return `${dd}${mm}`;
  }
  return isoDate.replace(/\D/g, '').slice(0, 4);
}

/**
 * Entfernt unerlaubte Sonderzeichen für DATEV-Felder.
 * Erlaubt: Buchstaben, Ziffern, Leerzeichen, - / ( ) + = , . : ;
 */
export function sanitizeText(s: string): string {
  return s
    .replace(/[^\w\s\-\/\(\)\+\=\,\.\:\;\&üäöÜÄÖß]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function getDominantTaxPct(taxLines: Array<{ rate: number; amount: number }>): number {
  if (!taxLines.length) return 19;
  const sorted = [...taxLines].sort((a, b) => b.amount - a.amount);
  const rate = sorted[0].rate;
  // rate kann als Dezimalzahl (0.19) oder Prozent (19) angegeben sein
  return rate <= 1 ? Math.round(rate * 100) : Math.round(rate);
}

function formatDateYYYYMMDD(year: number, month: number, day: number): string {
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
