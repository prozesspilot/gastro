---
name: Module Conventions and Patterns
description: Module structure, n8n workflow patterns, test patterns, naming conventions
type: project
---

# Module Conventions

## Module Structure Pattern
```
src/modules/m0X-name/
  routes.ts                 — exports m0XRoutes(), m0XCustomerRoutes(), m0XIntegrationRoutes()
  schemas/push.input.ts     — Zod schema for push endpoint
  handlers/
    push.handler.ts         — main push logic with idempotency
    exports.handler.ts      — GET list of exports
    integration.handler.ts  — test + sync operations
  tests/
    push.handler.test.ts    — 5 standard tests: success, idempotency, module-disabled, wrong-status, no-skr
  services/                 — (if needed)
```

## Push Handler Pattern (M05/M06)
1. Parse Zod input schema (422 on fail)
2. Check module enabled (400 MODULE_NOT_ENABLED)
3. findById receipt (404 if not found)
4. Check status IN ['archived','categorized'] (422 INVALID_STATUS)
5. Check idempotency (exports array has existing push → return early)
6. Init client (412 if not configured)
7. Validate SKR account (422 VALIDATION_FAILED if empty)
8. Map account + tax rule IDs
9. Build voucher
10. Hook before_export.{module}
11. Push to external API
12. Upload + attach PDF (errors are non-fatal)
13. Patch receipt (status='exported', add export entry)
14. Hook after_export.{module}
15. Update DB (receipt + export log)
16. Audit log (best-effort)

## app.ts Registration Pattern
```ts
// Push (receipt-scoped)
await apiApp.register(m0XRoutes, { prefix: '/receipts' });
// List exports (customer-scoped)
await apiApp.register(m0XCustomerRoutes, { prefix: '/customers' });
// Integration ops
await apiApp.register(m0XIntegrationRoutes, { prefix: '/integrations/m0x' });
// Domain-specific customer routes
await apiApp.register(m0XDomainRoutes, { prefix: '/customers' });
```

## Test Pattern (Fake DB)
```ts
const fakeDb = {
  query: vi.fn(async (sql: string, params: unknown[]) => {
    if (/INSERT INTO receipts/i.test(sql)) { ... }
    if (/UPDATE\s+receipts/i.test(sql)) { ... }
    if (/SELECT[\s\S]*FROM\s+receipts/i.test(sql)) { ... }
    return { rows: [] };
  }),
};
// buildTestApp() sets up Fastify with fakeDb + fakeRedis decorators
// Uses app.inject() for all HTTP calls
```

## n8n Workflow Pattern
- Entry: executeWorkflowTrigger (passthrough)
- Assert/validate input in Code node
- HTTP request to backend (neverError: true)
- IF node checks response.ok
- True branch: Set build-ok result
- False branch: Set build-error result

## Migration Naming
backend/migrations/ naming:
- 002_customer_profiles.sql
- 003_phase2_tables.sql
- 011_sevdesk.sql (NEW)
- 012_datev.sql (NEW)

## Key Details

### sevDesk Auth
- Header: `Authorization: <raw_token>` — NO "Bearer" prefix!
- kind='sevdesk_api_token' in customer_credentials

### DATEV EXTF CSV
- Line 1: "EXTF";700;21;"Buchungsstapel";9;...
- Line 2: Column headers (110 columns)
- Line 3+: Data rows
- Decimal separator: COMMA (1234,56) NOT dot
- Belegdatum: DDMM (4 chars): "1504" for April 15
- BU-Schlüssel: 19%→"9", 7%→"2", 0%→"40"
- Encoding: UTF-8 with BOM (default); windows-1252 via iconv-lite
- Beleglink: BELEG://{receipt_id}.pdf
- All files in: backend/src/modules/m04-datev/

### vitest config
Include patterns: 
- tests/**/*.test.ts
- src/modules/**/tests/*.test.ts  
- src/__tests__/**/*.test.ts (added in Session 3)
