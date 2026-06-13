# T049 — F3: EIN n8n-Pilot-Workflow auf belege (Rest einfrieren)

**ID:** T049
**Verantwortlich:** Andreas
**Priorität:** P1 (Pilot-Finish F3)
**Branch:** `andreas/T049-n8n-pilot-belege`
**Geschätzt:** 1 Tag
**Dependencies:** T048 (categorize-Endpoint existiert)
**Ziel-Meilenstein:** Pilot — F3
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

**SCOPE-KORREKTUR (2026-06-13, beweisgestützt):** Die ursprüngliche Annahme „EIN n8n-Workflow ruft die belege-Endpoints" ist **architektonisch nicht umsetzbar**: alle belege-Endpoints (upload/categorize/lexware) sind **JWT-geschützt** (`m14StaffAuthHook` + `m14TenantContextHook`, Mitarbeiter/Webapp), n8n nutzt **HMAC** → n8n kann sie nicht aufrufen. Der OCR-Worker kettet zudem nicht automatisch weiter. Der Pilot-Pfad ist faktisch **Webapp-getrieben** (Upload → OCR-Worker → Categorize-Button → Lexware-Export-Button, alles JWT).

→ **Neuer Scope (Entscheidung Steve, 2026-06-13):** n8n **aufräumen** statt einen (nicht funktionsfähigen) Workflow zu bauen:
- Alle 17 toten Workflow-JSONs (rufen die in T047 entfernte `/receipts`-/`/customers`-Welt) nach `n8n/workflows/_eingefroren/` verschieben.
- `n8n/README.md` ehrlich umschreiben: Pilot ist Webapp/JWT-getrieben, n8n erst Post-Pilot bei Multi-Channel-Eingang (WhatsApp/IMAP) + dann mit HMAC-/Service-Token-Pfad zu belege.
- `n8n/deploy.sh`: 0 Workflows ist kein Fehler mehr (exit 0 statt exit 1).

n8n-Reaktivierung (HMAC-/Service-Pfad + belege-Workflow) ist Post-Pilot.

---

## Akzeptanz-Kriterien

- [x] Alle 17 toten Workflows nach `n8n/workflows/_eingefroren/` verschoben (+ `_eingefroren/README.md`)
- [x] `n8n/README.md` beschreibt den Webapp-getriebenen Pilot-Pfad + warum n8n inaktiv ist (JWT vs HMAC) + Post-Pilot-Bedingungen
- [x] `n8n/deploy.sh` behandelt 0 aktive Workflows graceful (exit 0, Hinweis) statt Fehler
- [x] Kein aktiver Workflow (top-level `n8n/workflows/`) ruft mehr `/receipts` oder `/customers`
- [ ] code-reviewer-Agent gibt OK (folgt via /review-pr)

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §3.1, §3.6 (F3)
- `Modulkonzept/Konzeptentwicklung/03_n8n_Workflows.md` — Workflow-Konventionen (`WF-<Domain>-<Variant>`)
- `backend/src/modules/m05-lexoffice/belege-routes.ts` — `exports/lexware/batch`-Signatur
- `backend/src/workers/ocr-worker.ts` — OCR ist async (kein `/extract`)

---

## Claude-Code-Start-Prompt

```
Lies zuerst:
- /tasks/_in_progress/T049-<owner>-n8n-pilot-belege.md (diese Task)
- .claude/CLAUDE.md §3.6
- Modulkonzept/Konzeptentwicklung/03_n8n_Workflows.md
- n8n/workflows/ (bestehende JSONs als Form-Vorlage, NICHT die Endpoints übernehmen)
- backend/src/app.ts (welche belege-Endpoints existieren wirklich)

Baue EINEN Pilot-Workflow auf die belege-Endpoints, verschiebe den Rest nach _eingefroren/.

Bei Unklarheiten: in dieser Task-Datei dokumentieren, NICHT raten.

Wenn fertig: /finish-task
```

---

## Notes

n8n-Function-Nodes > 20 Zeilen gehören ins Backend (CLAUDE.md §5.1). Routing/Branching bleibt in n8n, Business-Logik im Backend.
