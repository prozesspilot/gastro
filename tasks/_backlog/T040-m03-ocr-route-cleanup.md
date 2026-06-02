# T040 — m03-ocr-Route entfernen oder mit Timeout härten (Legacy-Customer-Welt)

> **Owner:** Andreas (Backend)
> **Priorität:** P1 (Pilot — Fastify-Worker-Hang-Risiko)
> **Dependencies:** [[T028]] (Architektur-Entscheidung Customer-Welt)
> **Welle:** 7 (nach T028-Entscheidung)
> **Audit:** Lane-A Bug-Audit M02/M12 2026-06-02

---

## Problem

Der Endpoint `/api/v1/receipts/:id/ocr` (registriert in `backend/src/app.ts:278`, Handler `backend/src/modules/m03-ocr/ocr.handler.ts:70-81`) ruft `client.documentTextDetection(…)` **ohne Promise.race-Timeout** auf. Wenn die Google-Vision-Antwort hängt (Netzwerk-Latenz, GCP-Outage), bleibt der Fastify-Worker dauerhaft blockiert.

Im Gegensatz dazu der Production-OCR-Pfad via M01 + BullMQ → Adapter (`backend/src/core/adapters/ocr/google-vision.adapter.ts:99-106`) hat einen sauberen `OCR_TIMEOUT_MS`-Race.

## Kontext zu T028

m03-ocr gehört zur **Legacy-Customer-Welt** (per ADR-001 / T028-Vorschlag „Option A: vollständiger Abbau"). Wenn T028 in Richtung Option A entscheidet, wird die ganze Route ohnehin entfernt — dann ist T040 erledigt durch das Route-Cleanup.

Wenn T028 in Richtung Koexistenz entscheidet, MUSS m03-ocr produktionsreif werden — dann braucht der Handler den Timeout.

---

## Akzeptanz-Kriterien

### Falls T028 = „Abbau" (Option A im ADR):
- [ ] Route `/api/v1/receipts/:id/ocr` deregistrieren (Eintrag in `app.ts` entfernen)
- [ ] Modul `backend/src/modules/m03-ocr/` löschen
- [ ] Tests dokumentieren den Cleanup (Snapshot-Diff oder Coverage-Bericht)

### Falls T028 = „Koexistenz":
- [ ] Handler nutzt `Promise.race` mit `OCR_TIMEOUT_MS` (analog `google-vision.adapter.ts`)
- [ ] Apifix verwendet EU-Endpoint (siehe Vision-EU-Region-Fix-PR)
- [ ] Unit-Tests für Timeout-Pfad

---

## Hinweise

- m03-ocr ist ein Inline-Sync-Pfad (Request blockiert bis Vision antwortet). M01 ist Async via BullMQ-Queue. Sollte m03 erhalten bleiben, müsste man auch über Async-Migration nachdenken.
- Aktuell wird m03-ocr von keiner Webapp-Komponente direkt aufgerufen, soweit erkennbar — der Pilot nutzt M01. Aber externe n8n-Workflows könnten den Pfad konsumieren (siehe ADR-001 Inventur: n8n hängt überwiegend an Legacy-API).

## Anti-Goals

- KEIN paralleler Migrationspfad — T028 entscheidet, dann T040 ausführen.
