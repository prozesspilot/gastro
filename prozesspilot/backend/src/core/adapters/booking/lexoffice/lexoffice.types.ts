/**
 * Lexoffice REST API — TypeScript-Interfaces.
 *
 * Quelle: Lexoffice Public API v1 (https://developers.lexoffice.io/docs/).
 * Nur die für M05 (Voucher-Push) relevanten Felder.
 */

export type LexofficeUuid = string;

export interface LexofficeVoucherItem {
  amount: number; // Brutto-Betrag dieser Position
  taxAmount: number; // Steuerbetrag
  taxRatePercent: number; // 19, 7, 0
  categoryId: LexofficeUuid; // Lexoffice-categoryId
}

export interface LexofficeVoucher {
  type: 'expense'; // M05 immer 'expense' (eingehende Rechnung)
  voucherNumber: string;
  voucherDate: string; // YYYY-MM-DD
  shippingDate?: string; // optional
  dueDate?: string; // optional
  totalGrossAmount: number;
  totalTaxAmount: number;
  taxType: 'gross';
  useCollectiveContact: boolean;
  contactId?: LexofficeUuid | null;
  voucherItems: LexofficeVoucherItem[];
  memo?: string;
}

export interface LexofficeCreateResponse {
  id: LexofficeUuid;
  resourceUri: string;
  createdDate: string;
  updatedDate: string;
  version: number;
}

export interface LexofficeContact {
  id: LexofficeUuid;
  version: number;
  roles: { customer?: unknown; vendor?: unknown };
  company?: {
    name?: string;
    vatRegistrationId?: string;
  };
}

export interface LexofficeCategory {
  id: LexofficeUuid;
  type: string;
  name: string;
}
