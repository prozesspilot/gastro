---
name: ProzessPilot Code Patterns
description: Hook system, auth, response helpers, database patterns for ProzessPilot backend
type: project
---

# ProzessPilot Code Patterns

## Auth
- All /api/v1/* routes are behind `hmacMiddleware` in app.ts
- HMAC bypass: `PP_AUTH_DISABLED=1` env var
- Customer credentials stored encrypted: `customer_credentials(customer_id TEXT, kind TEXT, encrypted_value BYTEA)`
- Decrypt with pgcrypto: `pgp_sym_decrypt(ciphertext, $key)::text`
- M05 uses `kind='lexoffice_api_key'`; M06 uses `kind='sevdesk_api_token'`
- The auth.ts pattern: LexofficeNotConfiguredError thrown when no key found

## Response Helpers (core/schemas/common.ts)
- `apiOk(data)` → `{ok: true, data}`
- `apiError(code, message, details?)` → `{ok: false, error: {code, message, details}}`
- `zodToApiError(err)` → validation error wrapper

## Hook System
- `hookRunner.run(point, ctx)` returns modified Receipt
- Requires `setHookRunnerDeps({pool, pgcryptoKey})` called in app.ts
- No deps = no-op (backwards compatible)
- Hook points follow pattern: `before_export.{module}`, `after_export.{module}`

## Receipt Repository Pattern
- `findById(db, receiptId, customerId)` — tenant-isolated
- `create(db, input)` — creates with payload JSONB
- `update(db, receipt)` — full update of status + payload
- Receipt exports array in `payload.exports[]`

## n8n Workflow Pattern
- All workflows use executeWorkflowTrigger as entry node
- HTTP requests use `neverError: true` so n8n doesn't throw on non-2xx
- All sub-workflows return `{ok: boolean, module: 'MXX', ...}`
- Error handling: IF ok → finalize, else → classify + error-handler webhook

## Module Registration (app.ts pattern)
```ts
await apiApp.register(m06SevdeskRoutes, { prefix: '/receipts' });
await apiApp.register(m06CustomerSevdeskRoutes, { prefix: '/customers' });
await apiApp.register(m06IntegrationRoutes, { prefix: '/integrations/sevdesk' });
```
