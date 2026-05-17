# M05 — Lexoffice-Integration

Vollständige Implementierung von M05 nach `Modulkonzept/Konzeptentwicklung/modules/M05_Lexoffice_Integration.md`.

## Endpoint

```
POST /api/v1/receipts/:receipt_id/exports/lexoffice
```

Body:
```json
{ "customer_profile": { "...vollständiges Profil..." }, "trace_id": "trc_..." }
```

Akzeptierte Status: `archived`, `categorized`. Idempotent — wenn bereits gepusht, wird `already_pushed: true` zurückgegeben, kein neuer Voucher.

## Architektur

```
backend/src/modules/m05-lexoffice/
├── routes.ts
├── handlers/push.handler.ts            ← Workflow nach §7.1
├── services/
│   ├── contact-resolver.ts             ← findByVatId / createContact / Sammel-Kreditor
│   ├── attachment-picker.ts            ← MinIO-Original (Drive-Adapter folgt)
│   ├── audit.service.ts
│   └── event-emitter.ts
├── schemas/push.input.ts
└── tests/push.handler.test.ts

backend/src/core/adapters/booking/lexoffice/
├── lexoffice.client.ts                 ← Bearer-Auth, Retry (5xx + 429), Token-Bucket
├── lexoffice.types.ts
├── voucher.builder.ts                  ← Receipt → Voucher exakt nach §8
├── category.mapper.ts                  ← SKR → categoryId mit DB + API-Heuristik
├── auth.ts                             ← API-Key aus customer_credentials (pgcrypto)
└── rate-limiter.ts                     ← 2 Req/s Token-Bucket (Redis Lua)
```

## ENV-Variablen

| Variable | Default |
|----------|---------|
| `LEXOFFICE_API_BASE` | `https://api.lexoffice.io` |
| `LEXOFFICE_DEFAULT_TIMEOUT_MS` | `15000` |
| `PP_PGCRYPTO_KEY` | erforderlich (Decrypt customer_credentials) |

## Hooks

- `before_export.lexoffice` — kann Voucher-Memo via `receipt.meta.lexoffice_voucher_memo` setzen
- `after_export.lexoffice` — Side-Effects nach erfolgreichem Push

## Tests

```
npm test -- m05-lexoffice
```
