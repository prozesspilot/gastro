# T048 — F2: `POST /api/v1/belege/:id/categorize` bauen (M03 auf belege)

**ID:** T048
**Verantwortlich:** Andreas
**Priorität:** P1 (Pilot-Finish F2 — die EINZIGE funktionale Bau-Lücke)
**Branch:** `andreas/T048-belege-categorize`
**Geschätzt:** 1–2 Tage
**Dependencies:** T047 (Legacy raus — sauberer `app.ts`)
**Ziel-Meilenstein:** Pilot — F2
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Der Pilot-Pfad bricht an **genau einer** Stelle: Kategorisieren. Die M03-Logik (`m03-categorization/handlers/categorize.handler.ts`) läuft heute gegen die **Geister-`receipts`-Welt** (+ Geister `categories`/`customer_categories`/`suppliers_global`/`categorization_cache`) und einen `audit_log`-Spalten-Mismatch (CLAUDE.md §3.3).

Baue `POST /api/v1/belege/:id/categorize` (JWT-geschützt, LIVE-Block), das die KI-Kategorisierung mit den Gastro-Spezialfällen (Bewirtung, MwSt-Splitting, Pfand) auf die **reale `belege`-Tabelle** anwendet und das Ergebnis dort persistiert. Audit über das zentrale `logAuditEvent` (richtige Spalten).

---

## Akzeptanz-Kriterien

- [x] `POST /api/v1/belege/:id/categorize` registriert im LIVE-Block (`belege-categorize.routes.ts`, app.ts), mit `m14StaffAuthHook` + `m14TenantContextHook`
- [x] Handler lädt den Beleg aus `belege` (`getBelegById`), kategorisiert, schreibt category/SKR + `payload.categorization` zurück (`updateBelegCategorization`)
- [x] Kategorien-Quelle: In-Memory `SYSTEM_CATEGORIES` (nach `system-categories.ts` extrahiert) — **keine** Geister-Tabellen
- [x] Audit via zentrales `logAuditEvent` (`beleg.categorized`), NICHT der alte `audit.service.ts`-Wrapper
- [x] Status-Übergang `extracted` → `categorized` (confidence ≥ 0.75 + KI) / `requires_review` (sonst, inkl. Fallback ohne KI-Key)
- [x] Unit- + Handler-Tests (10: Categorizer 4 + Handler 6 — Happy/SKR04/Fallback/404/422/403)
- [x] CI grün lokal (`npm run build` ✓, `npm run lint` ✓ 218 Files, `npm test` 626 passed/0 failed)
- [ ] code-reviewer-Agent gibt OK (folgt via /review-pr)

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §3.3 (Bau-Lücke), §3.6 (F2)
- `Modulkonzept/Konzeptentwicklung/modules/M03_Kategorisierung.md` — Kategorisier-Logik + Spezialfälle
- `backend/src/modules/m03-categorization/handlers/categorize.handler.ts` — bestehende Logik (umhängen, nicht neu erfinden)
- `backend/src/modules/m01-receipt-intake/belege.routes.ts` — LIVE-Routen-Muster (belege)
- `backend/src/core/audit/audit-log.ts` — korrektes `logAuditEvent`

---

## Claude-Code-Start-Prompt

```
Lies zuerst:
- /tasks/_in_progress/T048-<owner>-belege-categorize.md (diese Task)
- .claude/CLAUDE.md §3.2/§3.3
- Modulkonzept/Konzeptentwicklung/modules/M03_Kategorisierung.md
- backend/src/modules/m03-categorization/handlers/categorize.handler.ts (Logik als Vorlage)
- backend/src/modules/m01-receipt-intake/belege.routes.ts + beleg.repository.ts (belege-Muster)
- backend/src/core/audit/audit-log.ts

Implementiere POST /api/v1/belege/:id/categorize gegen die belege-Tabelle.
Keine Geister-Tabellen. Audit über logAuditEvent.

Nutze test-writer-Agent für die Tests.
Bei Unklarheiten: in dieser Task-Datei dokumentieren, NICHT raten.

Wenn fertig: /finish-task
```

---

## Notes

Optional/Folgefrage: Soll der OCR-Worker nach `extracted` automatisch zu categorize weiterketten, oder triggert n8n (T049) den Schritt? Pilot-Default: n8n triggert (T049). Auto-Verkettung ist Post-Pilot-Komfort.
