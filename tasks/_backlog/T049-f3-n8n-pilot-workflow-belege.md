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

**Alle** n8n-Workflows rufen heute die toten `/receipts`- bzw. `/customers`-Endpoints (CLAUDE.md §3.1) → die Pipeline bricht. Schreibe **EINEN** sauberen Pilot-Workflow, der die lebenden belege-Endpoints kettet:

```
Upload → (OCR-Worker, async) → POST /api/v1/belege/:id/categorize → POST /api/v1/exports/lexware/batch
```

Alle anderen Workflow-JSONs nach `n8n/workflows/_eingefroren/` verschieben und das `n8n/README.md` entsprechend kürzen. **Wichtig:** Es gibt KEINEN `/extract`-Endpoint — OCR läuft automatisch über den Worker beim Upload (`/belege/:id/reprocess` re-runnt).

---

## Akzeptanz-Kriterien

- [ ] Genau ein neuer Pilot-Workflow (`WF-PILOT-BELEGE.json` o.ä.) ruft nur `/api/v1/belege/...`-Endpoints (HMAC-Header)
- [ ] Workflow-Kette: Upload-Trigger → warte auf OCR-Status → `categorize` → `exports/lexware/batch`
- [ ] Alle übrigen `n8n/workflows/*.json` nach `n8n/workflows/_eingefroren/` verschoben
- [ ] `n8n/README.md` beschreibt nur noch den Pilot-Workflow + den `_eingefroren/`-Hinweis
- [ ] Kein aktiver Workflow ruft mehr `/receipts` oder `/customers` (`grep` über `n8n/workflows/*.json`)
- [ ] code-reviewer-Agent gibt OK

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
