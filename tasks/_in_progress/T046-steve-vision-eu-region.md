# T046 — Google-Vision-API zwingend EU-Region (DSGVO)

**ID:** T046
**Verantwortlich:** Andreas
**Priorität:** P0 (DSGVO — vor dem ersten echten Beleg-Bild)
**Branch:** `andreas/T046-vision-eu-region`
**Geschätzt:** 0,5 Tag
**Dependencies:** keine
**Ziel-Meilenstein:** Pilot — P0-Sicherheit/Compliance
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Der Google-Vision-OCR-Adapter muss die **EU-Region** (`europe-west3` / Endpoint `eu-vision.googleapis.com`) erzwingen, damit Beleg-Bilder DSGVO-konform in der EU verarbeitet werden (CLAUDE.md §5.4). Aktuell setzt `core/adapters/ocr/google-vision.adapter.ts` **keine** Region → Default-US-Endpoint.

**Basis:** Die Arbeit liegt fertig auf Branch `andreas/p0-vision-eu-region` (PR #99, offen). **Aber:** PR #99 ändert zusätzlich `m03-ocr/ocr.handler.ts`, der in PR #105 (main) **gelöscht** wurde → Merge-Konflikt. Übernimm nur den **Adapter- + Config-Teil**, lass die Handler-Änderung weg (OCR läuft heute über den BullMQ-Worker + Adapter-Factory, nicht über einen `/ocr`-Handler).

---

## Akzeptanz-Kriterien

- [x] `core/adapters/ocr/google-vision.adapter.ts` nutzt einen konfigurierbaren EU-Endpoint (Default EU)
- [x] Neue ENV-Variable `VISION_API_ENDPOINT` (Default `eu-vision.googleapis.com`) in `core/config.ts` + `.env.example`
- [x] Adapter wird vom OCR-Worker/`ocr.service.ts` korrekt mit EU-Endpoint konsumiert (Adapter liest `config.VISION_API_ENDPOINT` direkt)
- [x] **Keine** Referenz auf den in #105 gelöschten `m03-ocr/ocr.handler.ts` (nur M01-Adapter-Tests übernommen)
- [x] Unit-Test verifiziert, dass der EU-Endpoint gesetzt wird (`tests/adapters/google-vision-eu-region.test.ts`, 3 Cases)
- [x] CI grün (lint + typecheck + tests + build) — lokal: `npm run build` ✓, `npm run lint` ✓, `npm test` 837 passed ✓
- [x] Test-Coverage ≥ 80% für neue/geänderte Dateien (getVisionClient mit/ohne keyFilename + Override abgedeckt)
- [ ] code-reviewer-Agent gibt OK (folgt via /review-pr)

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §5.4 — DSGVO + EU-Hosting (Vision `europe-west3`)
- `Modulkonzept/Konzeptentwicklung/modules/M01_Belegerfassung_OCR.md` — OCR-Pfad
- PR #99 (`andreas/p0-vision-eu-region`) — Adapter/Config-Teil übernehmen, Handler-Teil verwerfen

---

## Claude-Code-Start-Prompt

```
Lies zuerst:
- /tasks/_in_progress/T046-<owner>-vision-eu-region.md (diese Task)
- .claude/CLAUDE.md §3 + §5.4
- backend/src/core/adapters/ocr/google-vision.adapter.ts
- backend/src/modules/m01-receipt-intake/services/ocr.service.ts
- den Diff von PR #99 (git diff main origin/andreas/p0-vision-eu-region -- backend/src/core/adapters/ocr backend/src/core/config.ts)

Implementiere dann gemäß den Akzeptanz-Kriterien — nur Adapter + Config, KEINE m03-ocr-Handler-Änderung.

Nutze test-writer-Agent für die Tests.
Bei Unklarheiten: Frage in dieser Task-Datei dokumentieren, NICHT raten.

Wenn fertig: /finish-task
```

---

## Notes

PR #99 ist nach dieser Task zu schließen (Arbeit übernommen). Operative Schwester-Schritte (MinIO-Passwort, JWT/Bot-Token rotieren) stehen in `tasks/MANUELLE_AUFGABEN.md` — sind Mensch/Server, kein Code.
