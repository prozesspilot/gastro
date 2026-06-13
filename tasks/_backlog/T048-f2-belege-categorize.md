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

- [ ] `POST /api/v1/belege/:id/categorize` registriert im LIVE-Block, mit `m14StaffAuthHook` + `m14TenantContextHook`
- [ ] Handler lädt den Beleg aus `belege` (nicht `receipts`), kategorisiert, schreibt Kategorie/SKR-Konto zurück nach `belege`
- [ ] Kategorien-Quelle: In-Memory `SYSTEM_CATEGORIES` (`categories.routes.ts`) — **keine** Geister-Tabellen `categories`/`customer_categories`/`suppliers_global`/`categorization_cache`
- [ ] Audit via zentrales `core/audit/audit-log.ts` `logAuditEvent` (korrektes Schema), NICHT der alte `audit.service.ts`-Wrapper
- [ ] Status-Übergang dokumentiert: nach OCR `extracted` → nach categorize `categorized`/`requires_review`
- [ ] Unit- + Integrationstest (Happy-Path + Fehler-/requires_review-Pfad)
- [ ] CI grün (lint + typecheck + tests + build), Coverage ≥ 80%
- [ ] code-reviewer-Agent gibt OK

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
