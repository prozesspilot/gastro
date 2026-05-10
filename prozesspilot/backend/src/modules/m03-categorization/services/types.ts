/**
 * M03 — gemeinsame Typen für Categorization-Engine, Override-Resolver,
 * Master-Data-Resolver, Claude-Categorizer und SKR-Mapper.
 */

export type CategorizationEngine =
  | 'override'
  | 'master_data'
  | 'claude_sonnet_4_6'
  | 'claude_cached'
  | 'fallback_after_error';

export interface CategorizationFields {
  category: string;
  category_label: string;
  skr_account: string;
  tax_key: string;
  cost_center?: string | null;
  rationale?: string;
  confidence: number;
}

export interface CategorizationResult extends CategorizationFields {
  engine: CategorizationEngine;
  engine_version?: string;
}

export interface CategorizationContext {
  customerId: string;
  supplierName?: string;
  supplierVatId?: string | null;
  /** Ohne Override-Mapping ableitbare Felder vom Receipt. */
  taxRate?: number;
  totalGross?: number;
  totalNet?: number;
  documentDate?: string;
  lineItems?: Array<{
    description?: string;
    total?: number;
    tax_rate?: number;
    qty?: number;
    unit_price?: number;
  }>;
  taxLines?: Array<{ rate: number; base: number; amount: number }>;
  currency?: string;
}
