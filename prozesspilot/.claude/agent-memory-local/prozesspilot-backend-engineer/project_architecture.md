---
name: ProzessPilot Architecture
description: Two-world schema, migration numbering, key tables and tenant isolation patterns
type: project
---

# ProzessPilot Architecture

## Two Parallel Worlds

**Welt A (Konzept-konform)** — used by M01/M02/M03/M05/M07/M08/M10:
- TEXT customer_id, TEXT tenant_id
- Migration 010_m10_minimal.sql creates TEXT-receipts
- `_shared/receipts/receipt.repository.ts` is the canonical receipt repo
- CustomerProfile uses TEXT customer_id with JSONB integrations/routing/custom/modules_enabled

**Welt B (legacy UUID)** — used by customers/, tenants/, documents/, routing-jobs:
- UUID customers + tenants
- Migration 013_receipts.sql (drops and rebuilds receipts as UUID variant)
- WARNING: Running migration 013 after 010 breaks Welt A

## Migration Numbering (as of 2026-05-01)
- 001: initial_schema (tenants, UUID customers)
- 002: rls policies
- 003: suppliers_global
- 004: spreadsheet_row_index
- 010: m10_minimal (TEXT receipts — Welt A)
- 011: customer_profiles (UUID variant)
- 012: customer_profiles_alter
- 013: receipts (UUID — Welt B, conflicts with 010)
- 014: audit_log
- 015: receipts_search
- 016: receipt_dedup
- 017: webhook_queue
- 018: customer_hooks
- 019: m03_kategorisierung
- 020: m05_lexoffice
- 021: m08_reports
- 022: error_log_and_hook_executions
- **Next free: 023**

Note: backend/migrations/ has only: 002_customer_profiles.sql, 003_phase2_tables.sql
The 003_phase2_tables.sql already includes customers, tenants, receipts, audit_log, categories, customer_credentials, lexoffice_category_map, monthly_reports, customer_hooks, hook_executions tables.
The other migrations (001, 010-022) appear to be in the root migrations/ directory, not backend/migrations/.

Why: The backend/migrations directory only has 2 files; the actual live migrations are elsewhere.

## Key Tables (from 003_phase2_tables.sql)
- customers (UUID id, UUID tenant_id, name TEXT)
- tenants (UUID id, slug TEXT, name TEXT)
- receipts (receipt_id TEXT, customer_id TEXT, tenant_id TEXT, status TEXT, payload JSONB)
- categories, customer_categories, customer_cost_centers
- suppliers_global
- categorization_cache
- customer_credentials (customer_id TEXT, kind TEXT, encrypted_value BYTEA)
- lexoffice_category_map
- monthly_reports, report_deliveries
- customer_hooks, hook_executions
- processed_events, audit_log
