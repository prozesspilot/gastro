---
name: ProzessPilot Architecture
description: Module structure, DB schema patterns, routing conventions, and key codebase facts (updated 2026-05-01)
type: project
---

## Project Layout

```
prozesspilot/
  backend/          # Fastify + TypeScript
    src/
      app.ts        # Central registration of all routes (ALWAYS check here first)
      core/
        adapters/booking/lexoffice/  # lexoffice.client.ts, auth.ts, voucher.builder.ts, category.mapper.ts
        storage/storage.service.ts   # S3/MinIO upload/download/presign
        hooks/hook-runner.ts         # HookRunner — runs before_*/after_* hooks
        db/migrate.ts                # Migration runner (reads migrations/*.sql alphabetically)
      modules/
        _shared/receipts/receipt.repository.ts  # Central receipt repo (findById, update, findByHash)
        m03-categorization/          # Concept-compliant M03 (uses Claude API)
        m04-categorize/              # OLD m04 (kept in filesystem but removed from app.ts routing)
        m05-lexoffice/               # POST /receipts/:id/exports/lexoffice + customer exports + integration
        m06-sevdesk/                 # sevDesk integration (same pattern as m05)
        m06-advisor-portal/          # M06 Steuerberater-Portal (advisor routes)
        m07-spreadsheet/             # Google Sheets / Excel export
        m08-reporting/               # Monthly PDF reports
        m09-supplier-comm/           # M09 Lieferanten-Kommunikation
        m10-whatsapp/                # WhatsApp inbound processing
        plugin-system/               # Plugin-Registry + Dispatcher + Runner (Task 403)
        dsgvo/                       # DSGVO Art. 17/20 Loeschung + Datenexport (Task 504)
        stats/                       # GET /customers/:id/stats aggregations
    migrations/
      002_customer_profiles.sql
      003_phase2_tables.sql          # ALL Phase 2 tables: receipts, categories, customer_credentials,
                                     # lexoffice_category_map, monthly_reports, report_deliveries,
                                     # customer_hooks, hook_executions, suppliers_global, etc.
      011_sevdesk.sql
      012_datev.sql
      013_tax_advisor_portal.sql
      015_plugin_registry.sql        # plugin_registry + plugin_executions (Task 403)
      016_dsgvo.sql                  # deletion_requests (Task 504)
  webapp/           # React + Vite + TypeScript
    src/
      api/          # API clients (_client.ts, receipts.ts, customers.ts, reports.ts, stats.ts, plugins.ts, dsgvo.ts)
      pages/        # All page components (incl. PluginsPage.tsx, CommunicationsPage.tsx, AdvisorPortalPage.tsx)
      types.ts      # Shared TypeScript types
      data/tasks.ts # Task list for the dashboard (source of truth for done/todo)
  infra/
    backup/         # Backup scripts: backup-postgres.sh, backup-s3.sh, restore-test.sh, README.md
    security/       # security-checklist.md (OWASP Top 10 review)
  n8n/workflows/    # n8n workflow JSON files
```

## Receipt Schema (Backend)

Receipts use payload JSONB with nested structure:
- `payload.extraction.fields.total_gross` — Brutto-Betrag
- `payload.extraction.fields.total_net` — Netto-Betrag
- `payload.extraction.fields.document_date` — 'YYYY-MM-DD'
- `payload.extraction.fields.supplier_name` — Lieferantenname
- `payload.categorization.category` — Kategorie-ID
- `payload.categorization.category_label` — Kategorie-Label
- `payload.categorization.skr_account` — SKR-Konto (4-stellig)
- `payload.exports[]` — Array von Export-Einträgen ({target, status, external_id, pushed_at})
- Columns additionally: `receipt_id`, `customer_id`, `status`, `file_object_key`, `file_sha256`
- `processing_started_at`, `processing_completed_at` for timing metrics

## Tenant Header

The correct tenant header key is: `x-pp-tenant-id` (NOT `x-tenant-id`).
The webapp `_client.ts` sends this as the tenant header.
All handlers must read `req.headers['x-pp-tenant-id']`.

## Route Registration Pattern (app.ts)

Modules are registered in the HMAC-protected `/api/v1` plugin. Each module function:
```ts
await apiApp.register(moduleRoutes, { prefix: '/receipts' });
```

CRITICAL: m04CategorizeRoutes is NOT registered (conflict with m03CategorizationRoutes,
both use POST /:id/categorize). m03-categorization is the concept-correct implementation.

## Module Structure Convention

```
backend/src/modules/m0X-name/
  routes.ts          # Fastify route registrations
  handlers/          # Request handlers (buildXyzHandler() factory pattern)
  services/          # Business logic
  schemas/           # Zod validation schemas
  tests/             # Vitest test files
```

## Handler Factory Pattern

```ts
export function buildXyzHandler(deps = {}) {
  return async function xyzHandler(req, reply): Promise<void> {
    // ...
  };
}
```

## Idempotency Pattern (M05 example)

Check for existing export before pushing:
```ts
const existing = (receipt.exports ?? []).find(e => e.target === 'lexoffice' && e.status === 'pushed');
if (existing) return reply.send(apiOk({ already_pushed: true }));
```

## Plugin-System (Task 403) — Key Design Decisions

- Plugins registered per tenant via POST /api/v1/plugins
- Webhook must be HTTPS (except localhost in dev)
- HMAC-SHA256 signature in `X-ProzessPilot-Signature` header
- SSRF protection in production: blocks 127.x, 10.x, 192.168.x, 172.16-31.x
- Executions tracked in plugin_executions table (always)
- runPluginsForEvent() uses Promise.allSettled — plugin failures don't break pipeline

## DSGVO Module (Task 504) — Key Design Decisions

- Deletion requests tracked in deletion_requests table with state machine: pending → processing → completed/failed
- data-export is synchronous (MVP — production would use async jobs)
- PII inventory is hardcoded (no DB scan needed)
- pii-inventory returns all tables with encrypted fields highlighted

## Security Hardening (Task 503) — Changes Made

- @fastify/rate-limit installed: 100 req/min per tenant/IP (disabled in test mode)
- Production error handler: never leaks stack traces or DB error messages
- All existing queries already parameterized (no SQL injection found)
- HMAC already uses timingSafeEqual (no change needed)
- .env.example created at /backend/.env.example

## n8n Workflow Conventions

- WF-M05.json, WF-M08.json exist in n8n/workflows/
- Sub-workflows use Execute Workflow Trigger → assert_status → HTTP Request → IF ok → Respond
- WF-MASTER-RECEIPT.json orchestrates the main pipeline

## Webapp API Pattern

```ts
// api/reports.ts
export async function getReports(customerId: string): Promise<Report[]> {
  return unwrap(await apiRequest(`/customers/${customerId}/reports`));
}
```

The webapp linter auto-converts axios-style `.client.ts` imports to use `apiRequest`/`unwrap` from `_client.ts`.
When creating new api/*.ts files, use `apiRequest` + `unwrap` directly (not `client.get/post`).

## Key Config / ENV

- `PP_PGCRYPTO_KEY` — Used to decrypt customer credentials in DB
- `LEXOFFICE_API_BASE` — Lexoffice API base URL (default: https://api.lexoffice.io)
- `PP_AUTH_DISABLED` — Dev flag: skip HMAC auth when set to '1'
- `SMTP_ENABLED` — false skips mail delivery (dev feature flag)
- `NODE_ENV` — controls rate limiting (disabled in test), error handler verbosity
