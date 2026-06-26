# T079 — Fix: BullMQ-jobId darf kein `:` enthalten (OCR- + DSGVO-Enqueue blockiert)

> **Owner:** Steve / gemeinsam
> **Priorität:** P0 (Prod-Blocker — kein Beleg wird je OCR-verarbeitet)
> **Welle:** Hotfix
> **Dependencies:** —
> **Spec-Referenzen:** Prod-Log-Diagnose 2026-06-26 (`"Custom Id cannot contain :"`) · `core/queue/ocr-queue.ts` · `core/queue/dsgvo-queue.ts`

---

## Ziel

Auf Prod schlägt jedes OCR-Enqueue fehl mit BullMQ-Fehler **`Custom Id cannot contain :`** — die jobId ist `ocr:<belegId>`. Neuere BullMQ-Versionen verbieten `:` in Custom-Job-IDs (reserviertes Key-Trennzeichen). Folge: **jeder hochgeladene Beleg bleibt für immer auf `received`**, OCR läuft nie an (auch nicht mit Vision-Key). Der geteilte `processBelegUpload` fängt den Fehler nur (Upload bleibt 201), die Pipeline ist aber tot.

Derselbe Bug steckt in `dsgvo-queue.ts` (`dsgvo:<request_id>`) → DSGVO-ZIPs würden nie gebaut.

**Fix:** jobId-Trennzeichen `:` → `-` in beiden Queues. Idempotenz/Dedup bleibt erhalten (jobId pro Beleg/Request weiterhin stabil-eindeutig). Verifiziert per Prod-Smoke (Beleg-Upload → Status wechselt von `received`).

---

## Akzeptanz-Kriterien

- [x] `ocr-queue.ts`: jobId ohne `:` — `ocr-<belegId>` (upload, dedup-stabil) bzw. `ocr-<belegId>-reprocess-<ts>` (reprocess, eindeutig). jobId-Konstruktion in eine **pure Funktion** `buildOcrJobId(data)` extrahiert (testbar ohne Redis).
- [x] `dsgvo-queue.ts`: jobId `dsgvo-<request_id>` (ohne `:`); analog `buildDsgvoJobId(data)`.
- [x] Doku-Kommentare (jobId-Strategie in `ocr-queue.ts`, Referenz in `reprocess.handler.ts`) angeglichen.
- [x] Tests: `buildOcrJobId` (upload vs reprocess, **kein `:`**, dedup-stabil/eindeutig) + `buildDsgvoJobId` (kein `:`).
- [x] `npm run build` + `npm test` grün; nach Deploy Prod-Smoke: hochgeladener Beleg verlässt `received` (Enqueue-Log ohne Fehler).

---

## Hinweise / Grenzen

- Kein Verhaltenswechsel außer dem Trennzeichen — Dedup-Semantik (upload = 1 Job pro Beleg, reprocess = immer neu) bleibt identisch.
- Separater Befund (NICHT T079, eigener Task): Prod-Log wird von `relation "webhook_queue" does not exist` geflutet (fehlende Tabelle/altes Webhook-Modul) → Folge-Cleanup.
- Steves konkreter Webapp-Upload-Fehler ist separat zu klären (im Log kein `/belege/upload`-Request → kam evtl. nicht im Backend an).
