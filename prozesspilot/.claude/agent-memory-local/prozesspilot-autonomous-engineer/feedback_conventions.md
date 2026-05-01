---
name: ProzessPilot Coding Conventions & Pitfalls
description: Validated patterns, known pitfalls, test conventions in ProzessPilot
type: feedback
---

## Route Collision Pitfall

m04CategorizeRoutes and m03CategorizationRoutes both register `POST /:id/categorize`.
m04 was removed from app.ts to fix this. If adding new modules, always check for route conflicts.

**Why:** Fastify throws `Method 'POST' already declared for route` at startup, breaking all tests.
**How to apply:** Before registering a new module, grep for existing route patterns.

## Test Pattern: Integration Tests Need DB

Most tests in `tests/` (routing, receipts, customers, etc.) require a live PostgreSQL DB.
They are skipped when DB is unavailable. This is intentional.
Unit tests in `src/modules/*/tests/` use mocks and run without DB.

**Why:** Integration test reliability on CI.
**How to apply:** Don't be confused by "X tests skipped" — those are DB integration tests.

## M05 Push Handler Body Schema

The push handler (`POST /receipts/:id/exports/lexoffice`) expects:
```json
{ "customer_profile": { "customer_id": "...", "integrations": {...} }, "trace_id": "..." }
```
The customer_profile is passed from n8n (not loaded from DB in the handler itself).

## M08 PDF Renderer

Uses `pdf-lib` (NOT puppeteer/playwright). The pdf-renderer.ts creates PDFs directly without
a headless browser. This was a design choice to avoid puppeteer dependency issues.

## Migration Naming

Migrations in `backend/migrations/` are alphabetically sorted and applied in order.
Currently: 002_customer_profiles.sql, 003_phase2_tables.sql
New migrations should use the next number prefix.

## Webapp Receipt Schema Gap

The webapp `Receipt` type (types.ts) has a different shape from the backend receipt repository.
The api/receipts.ts `mapReceipt()` function bridges between them. When adding new fields,
update both the backend receipt.repository.ts Receipt interface AND the webapp types.ts.

## Stats Module

Created at `backend/src/modules/stats/` with handler at `handlers/stats.handler.ts`.
Registered in app.ts under prefix `/customers` → `/customers/:customerId/stats`.
Frontend calls it via `api/stats.ts → getCustomerStats()`.

## Lexoffice Category Map

Default mappings inserted in migration 003 with `customer_id='default'`.
Customer-specific overrides use the customer's UUID as `customer_id`.
Fallback UUID for unknown accounts: `00000000-0000-4000-8000-000000004980`.
