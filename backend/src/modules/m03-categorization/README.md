# M03 — Kategorisierung (belege-Pfad)

Kategorisiert einen Beleg nach OCR und bereitet die SKR-Buchung vor. Konzept-Anker: `Modulkonzept/Konzeptentwicklung/modules/M03_Kategorisierung.md`.

> **Stand T051 (2026-06-13):** Der alte `receipts`-Pfad (`routes.ts`, `categorize.handler.ts`, `claude-categorizer`, `master-data-resolver`, `skr-mapper`, `override-resolver`, `confidence-scorer` + `categorization_cache`/`suppliers_global`/`customer_categories`) wurde entfernt — er lief gegen die abgebaute Geister-Tabellen-Welt. **Live ist ausschließlich der belege-Pfad.**

## Endpoint (LIVE)

```
POST /api/v1/belege/:id/categorize
```

- Auth: M14-JWT-Cookie (`pp_auth`) + `X-PP-Tenant-ID`-Header (`m14StaffAuthHook` + `m14TenantContextHook`).
- Rolle: `support` darf nicht kategorisieren (403).
- Status-Gate: akzeptiert nur Belege mit `status='extracted'`. Bei anderem Status: 422 `INVALID_STATUS`.
- Body: leer (`{}`) — die OCR-Felder werden aus `payload.extraction.fields` gelesen.

Registrierung: `app.ts` → `belegeCategorizeRoutes` mit Prefix `/api/v1`.

## Logik

1. `extractOcrFields(payload)` liest die extrahierten Felder (`supplier_name`, `total_gross`, `document_date`, …).
2. `categorizeBeleg()` (`services/belege-categorizer.ts`) ruft **Claude** via Anthropic SDK Tool-Use mit den 14 Standardkategorien aus `system-categories.ts`.
   - **Ohne `CLAUDE_API_KEY`:** kein Client → Fallback `sonstige_aufwand`, `confidence=0` → `requires_review`.
3. Confidence-Threshold **0.75**: `engine='claude'` und `confidence ≥ 0.75` → `status='categorized'`, sonst `requires_review`.
4. `updateBelegCategorization()` schreibt `payload.categorization` (engine, category, SKR-Konto, confidence, rationale) transaktional + Audit-Event `beleg.categorized`.

## SKR-Konten

`system-categories.ts` liefert pro Kategorie SKR03/SKR04 (`skrAccountFor(id, chart)`). **Hinweis:** Die angezeigten Konten weichen aktuell vom real durch M05 gebuchten SKR ab → offen in **T052** (SKR-Divergenz T048 ↔ M05).

## Bewirtung

`services/bewirtungs-detector.ts` (von M01 `ocr.service` genutzt) erkennt Bewirtungsbelege (70 %-Regel). Overwrite-Schutz offen in **T053**.

## ENV-Variablen

| Variable | Zweck | Default |
|----------|-------|---------|
| `CLAUDE_API_KEY` | Anthropic API-Key | – (ohne Key → `requires_review`) |
| `CLAUDE_MODEL` | Modell-ID | `claude-sonnet-4-6` |

## Tests

```
npm test -- m03-categorization
```

- `tests/belege-categorize.handler.test.ts` — Endpoint (Auth, Status-Gate, Threshold)
- `tests/belege-categorizer.test.ts` — Claude-Tool-Use + Fallback
- `tests/bewirtungs-detector.test.ts` — Bewirtungs-Erkennung
