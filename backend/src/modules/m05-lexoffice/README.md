# M05 — Lexware-Office-Export (belege-Pfad)

Pusht einen kategorisierten Beleg als Voucher nach Lexware Office. Konzept-Anker: `Modulkonzept/Konzeptentwicklung/modules/M05_Lexoffice_Integration.md`.

> **Stand T051 (2026-06-13):** Der alte `receipts`-Pfad (`routes.ts`, `handlers/push.handler.ts`, `contact-resolver`, `attachment-picker`, `schemas/push.input.ts` + `core/adapters/booking/lexoffice/auth.ts` gegen `customer_credentials`) wurde in T047/T051 entfernt. **Live ist ausschließlich der belege-Pfad** mit Token aus `booking_credentials` (T009).

## Endpoints (LIVE)

```
POST /api/v1/belege/:id/exports/lexware   — Single-Push (mitarbeiter+)
POST /api/v1/exports/lexware/batch         — Tenant-Batch (geschaeftsfuehrer only)
```

- Auth: M14-JWT-Cookie (`pp_auth`) + `X-PP-Tenant-ID`-Header.
- Export-Kandidaten (`findBelegIdsPendingExport`): Belege mit `status ∈ {extracted, categorized, archived, exported}`.
- Idempotent: bereits gepushte Belege → `status='skipped'` + bestehende `external_id` (via `export_log`).
- Batch-Body (optional): `{ "limit": <1–500, default 50> }` → Response `{ pushed, skipped, failed, results }`.

Registrierung: `app.ts` → `belegeLexwareRoutes` mit Prefix `/api/v1`.

## Architektur (aktiv)

```
backend/src/modules/m05-lexoffice/
├── belege-routes.ts                       ← die zwei LIVE-Routen + M14-Hooks
├── handlers/belege-push.handler.ts        ← Single-Push
├── handlers/belege-batch.handler.ts       ← Tenant-Batch (gf-only)
├── services/belege-lexware-exporter.ts    ← Orchestrierung; baut Client aus booking_credentials-Token
├── services/booking-credentials.repository.ts ← Token-Storage (T009, pgcrypto-verschlüsselt)
├── services/category-skr-map.ts           ← Kategorie → SKR-Konto (siehe T052)
└── services/export-log.repository.ts      ← Idempotenz + Pending-Kandidaten

backend/src/core/adapters/booking/lexoffice/
├── lexoffice.client.ts                    ← Bearer-Auth, Retry (5xx + 429), Token-Bucket
├── lexoffice.types.ts
├── category.mapper.ts                     ← SKR ↔ categoryId (DB + API-Heuristik)
└── rate-limiter.ts                        ← 2 Req/s Token-Bucket (Redis Lua)
```

## ENV-Variablen

| Variable | Default |
|----------|---------|
| `LEXOFFICE_API_BASE` | `https://api.lexoffice.io` |
| `LEXOFFICE_DEFAULT_TIMEOUT_MS` | `15000` |
| `PP_PGCRYPTO_KEY` | erforderlich (Decrypt des `booking_credentials`-Tokens) |

Der Lexware-Office-Token wird manuell pro Tenant hinterlegt → `tasks/MANUELLE_AUFGABEN.md` (T009, `bootstrap-lexware-token.js`).

## Offene Qualitäts-Punkte

- **T052:** Der von `category-skr-map.ts` real gebuchte SKR weicht vom in M03 (`system-categories.ts`) angezeigten ab — eine Single-Source nötig.

## Tests

```
npm test -- m05-lexoffice
```
