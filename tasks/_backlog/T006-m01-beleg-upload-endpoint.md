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

- [ ] DB-Tabelle `belege` mit Spalten: `id`, `tenant_id`, `uploaded_by_user_id`, `uploaded_at`, `mime_type`, `original_filename`, `storage_key`, `status`, `kategorie`, `ocr_text`, `metadata_json`
- [ ] Endpoint `POST /api/belege/upload` — Multipart-Form mit Datei + JSON-Metadata
- [ ] Akzeptierte Mime-Types: `image/jpeg`, `image/png`, `image/heic`, `application/pdf`
- [ ] Max Dateigröße: 20 MB
- [ ] Datei landet in MinIO-Bucket `belege-<tenant_id>` mit UUID-Filename
- [ ] DB-Row erstellt mit `status = 'pending_ocr'`
- [ ] Response: `{beleg_id, storage_key, status}`
- [ ] Auth-Middleware: nur eingeloggte User dürfen uploaden
- [ ] Tenant-Isolation: Belege werden auf `tenant_id` aus JWT gebunden
- [ ] Endpoint `GET /api/belege` — Liste aller Belege des Tenants (paginated, sortable nach uploaded_at)
- [ ] Endpoint `GET /api/belege/:id` — Detail inkl. signed URL zum Datei-Download
- [ ] Unit-Tests + Integration-Test mit MinIO-Container

## Claude-Code-Start-Prompt

```
Implementiere T006 Beleg-Upload. Multer für Multipart, MinIO-SDK für Storage.
Migration für belege-Tabelle. Endpoints unter /api/belege/*.
JWT-Validation via existierender Auth-Middleware.
Signed URLs mit 15min TTL.
Branch: andreas/T006-beleg-upload-endpoint
```
