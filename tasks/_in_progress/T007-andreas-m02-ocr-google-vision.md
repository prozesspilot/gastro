# T007 — M02 OCR-Integration Google Vision

> **Owner:** Andreas
> **Geschätzt:** 2 Tage
> **Priorität:** P0 (ohne OCR kein automatischer Workflow)
> **Dependencies:** T006 Beleg-Upload-Endpoint
> **Welle:** 2
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M02_OCR.md`

---

## Ziel

Service der Belege mit `status = 'pending_ocr'` durch Google Vision API schickt, OCR-Text extrahiert + strukturierte Felder (Betrag, Datum, Lieferant) erkennt und in `belege.ocr_text` + `belege.metadata_json` speichert.

---

## Akzeptanz-Kriterien

- [ ] Google Cloud Vision-Account angelegt, Service-Account-Key als `GOOGLE_VISION_CREDS` Secret
- [ ] Service `OCRService.processBeleg(beleg_id)` — pullt Datei aus MinIO, sendet an Vision-API
- [ ] Worker/Queue: BullMQ mit Redis-Backend, neue Belege werden enqueued
- [ ] Felder-Extraktion: Betrag (Regex auf €-Beträge), Datum (DD.MM.YYYY), Lieferant (oberste Zeilen)
- [ ] Konfidenz-Score pro Feld in `metadata_json.confidence`
- [ ] Bei Erfolg: `belege.status = 'ocr_done'`, `ocr_text` + `metadata_json` befüllt
- [ ] Bei Fehler nach 3 Retries: `belege.status = 'ocr_failed'` + Discord-Alert
- [ ] Endpoint `POST /api/belege/:id/reprocess` — manueller Re-Run
- [ ] Cost-Tracking: Anzahl API-Calls pro Tenant pro Monat (für späteres Pricing)
- [ ] Unit-Tests + Integration-Test mit Vision-Mock

## Claude-Code-Start-Prompt

```
Implementiere T007 OCR-Integration. @google-cloud/vision-Library für API-Calls.
BullMQ-Worker in backend/src/workers/ocr-worker.ts.
Queue-Enqueue automatisch wenn Beleg-Row mit status=pending_ocr eingefügt wird
(via Postgres-LISTEN/NOTIFY oder direktem Aufruf nach Upload).
Branch: andreas/T007-ocr-google-vision
```

## Sicherheits-Anker
- Google-Vision-Credentials NIEMALS in Repo committen
- API-Cost-Limit pro Tenant pro Tag (Schutz vor Runaway): max 1000 Calls/Tag
