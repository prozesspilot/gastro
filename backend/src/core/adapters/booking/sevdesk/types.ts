/**
 * sevDesk API — Type-Definitionen.
 * Exakt die Typen, die wir für M06 benötigen.
 */

// ── Voucher-Typen ─────────────────────────────────────────────────────────────

export interface SevDeskSupplier {
  id: string;
  objectName: 'Contact';
}

export interface SevDeskTaxRuleRef {
  id: number;
  objectName: 'TaxRule';
}

export interface SevDeskAccountingTypeRef {
  id: number;
  objectName: 'AccountingType';
}

export interface SevDeskVoucherPos {
  objectName: 'VoucherPos';
  mapAll: true;
  /** Gross amount for this position */
  sumGross: number;
  /** Net amount */
  sumNet: number;
  /** Tax amount */
  sumTax: number;
  /** Accounting type (SKR-Konto-Mapping) */
  accountingType: SevDeskAccountingTypeRef;
  /** Tax rate in percent (19, 7, 0) */
  taxRate: number;
}

export interface SevDeskVoucherFactory {
  objectName: 'Voucher';
  mapAll: true;
  /** ISO date string YYYY-MM-DD */
  voucherDate: string;
  /** Lieferant als Contact-Objekt (optional) */
  supplier?: SevDeskSupplier | null;
  /** Supplier-Name als String (Fallback wenn kein Contact) */
  supplierName: string;
  /** Status: 50 = offen */
  status: 50;
  /** Beleg-Nummer (max 12 Zeichen) */
  description: string;
  /** C = Eingangsrechnung (Credit) */
  creditDebit: 'C';
  /** Beleg-Typ */
  voucherType: 'VOU';
  /** Brutto-Summe aller Positionen */
  sumGross: number;
  /** Netto-Summe */
  sumNet: number;
  /** Steuer-Summe */
  sumTax: number;
  /** Steuer-Regel */
  taxRule: SevDeskTaxRuleRef;
  /** Währung */
  currency: string;
  /** Positions-Array */
  voucherPosSave: SevDeskVoucherPos[];
}

// ── API Response-Typen ────────────────────────────────────────────────────────

export interface SevDeskSaveVoucherResponse {
  objects: {
    voucher: {
      id: number;
      objectName: 'Voucher';
      [key: string]: unknown;
    };
    voucherPos?: unknown[];
  };
}

export interface SevDeskAccountingType {
  id: number;
  objectName: 'AccountingType';
  /** Kurzbezeichnung z. B. "3100" */
  name: string;
  /** DATEV-Konto-Nummer */
  accountNumber?: string;
  [key: string]: unknown;
}

export interface SevDeskTaxRule {
  id: number;
  objectName: 'TaxRule';
  /** Steuersatz in Prozent */
  taxRate: number;
  name?: string;
  [key: string]: unknown;
}

export interface SevDeskTempFile {
  filename: string;
  [key: string]: unknown;
}

export interface SevDeskOrganization {
  organizationName?: string;
  [key: string]: unknown;
}
