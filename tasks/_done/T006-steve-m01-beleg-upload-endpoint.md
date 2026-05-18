# T006 — M01 Beleg-Capture Web-Upload-Endpoint

> **Owner:** Andreas
> **Geschätzt:** 1,5 Tage
> **Priorität:** P0 (Almaz lädt in KW22 manuell hoch)
> **Dependencies:** T011 Migrations-Audit + Auth (T001 oder T002)
> **Welle:** 1 (parallel zu T001/T002)
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M01_Beleg_Capture.md`

---

## Ziel

Backend-API die authentifizierte Mitarbeiter Belege (Bilder/PDFs) hochladen lässt. Datei → MinIO-Storage, Metadata → Postgres, Status `pending_ocr` für nachgelagerte OCR.

---

## Akzeptanz-Kriterien

- [x] DB-Tabelle `belege` mit Spalten — bereits in Migration 030 vorhanden (post-Reboot: `file_object_key`, `file_mime_type`, `file_size_bytes`, `file_sha256`, `payload` JSONB; `uploaded_by_user_id` + `original_filename` in `payload.audit` + `payload.meta`)
- [x] Endpoint `POST /api/v1/belege/upload` — Multipart-Form (@fastify/multipart)
- [x] Akzeptierte Mime-Types: `image/jpeg`, `image/png`, `image/heic`, `application/pdf`
- [x] Max Dateigröße: 20 MB (config: `MAX_UPLOAD_SIZE_BYTES`)
- [x] Datei in MinIO unter `<tenant_id>/originals/<yyyy>/<mm>/<uuid>.<ext>` (Bucket aus `MINIO_BUCKET`, nicht pro Tenant — post-Reboot-Pattern)
- [x] DB-Row mit `status = 'received'` (Migration 030 FSM, nicht `'pending_ocr'` aus alter Task-Spec)
- [x] Response: `{beleg_id, storage_key, status, isDuplicate?}`
- [x] Auth-Middleware: M14-Staff-JWT (`pp_auth` Cookie) via wiederverwendbaren Hook in `core/auth/m14-staff-auth.ts`
- [x] Tenant-Isolation via `X-PP-Tenant-ID` Header + RLS-set_config-Pattern
- [x] Endpoint `GET /api/v1/belege` — paginiert (page, page_size ≤ 100), optional `status`-Filter, sortiert by received_at DESC
- [x] Endpoint `GET /api/v1/belege/:id` — Detail mit Presigned-URL (15min TTL, config: `SIGNED_URL_TTL_SECONDS`)
- [x] 25 Unit-Tests (Pool + S3 gemockt). Integration-Test mit echtem MinIO-Container: später (Setup-Aufwand)
- [x] **Bonus:** SHA256-Idempotenz (UNIQUE-Constraint aus Migration 030) → bei Duplikat 200 mit existierender beleg_id + isDuplicate=true
- [x] **Bonus:** Audit-Log `beleg_uploaded` via `logAuthEvent`

### Spec-Konflikt-Lösungen
- Tabellen-Schema: Migration 030 (post-Reboot) statt Task-Spec (pre-Reboot)
- Status: `'received'` (FSM-Start in Migration 030) statt `'pending_ocr'`
- Endpoint-Prefix: `/api/v1/belege/*` statt `/api/belege/*` (konsistent mit T002/T004)
- Bucket: shared `prozesspilot-raw` mit Tenant-Prefix im Storage-Key statt `belege-<tenant_id>`

## Claude-Code-Start-Prompt

```
Implementiere T006 Beleg-Upload. Multer für Multipart, MinIO-SDK für Storage.
Migration für belege-Tabelle. Endpoints unter /api/belege/*.
JWT-Validation via existierender Auth-Middleware.
Signed URLs mit 15min TTL.
Branch: andreas/T006-beleg-upload-endpoint
```
