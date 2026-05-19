# T009 — M11 Lexware-Office-Export-Adapter

> **Owner:** Andreas
> **Geschätzt:** 2 Tage
> **Priorität:** P0 (Almaz' Steuerberaterin nutzt Lexware Office)
> **Dependencies:** T008 Bewirtungs-Hook (für saubere Kategorisierung vor Export)
> **Welle:** 4
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M11_Export.md` Sektion „Lexware Office"

---

## Ziel

Adapter der kategorisierte Belege via Lexware-Office-API zur Steuerberaterin pusht. Belege landen in deren Lexware-Office-Posteingang inkl. Bild + Metadaten.

---

## Akzeptanz-Kriterien

- [ ] Lexware-Office-API-Zugang mit Steuerberaterin abgestimmt (API-Token besorgen)
- [ ] `LEXWARE_OFFICE_API_TOKEN` als GitHub-Secret pro Tenant — Pflicht: per-Tenant-Konfig in `tenant_settings`-Tabelle
- [ ] Service `LexwareOfficeExporter.push(beleg_id)` — pullt Beleg-File + Metadata + sendet an Lexware
- [ ] Mapping: ProzessPilot-Kategorien → Lexware-Office-Kategorien (z.B. `bewirtung` → Konto 6640)
- [ ] Idempotent: Re-Push desselben Belegs überschreibt nicht, sondern returned existing-ID
- [ ] DB-Tabelle `export_log` mit Spalten: `beleg_id`, `target`, `target_external_id`, `pushed_at`, `status`, `error_message`
- [ ] Bei Lexware-API-Fehler: 3 Retries mit Backoff, danach `status = 'failed'` + Discord-Alert
- [ ] Batch-Endpoint `POST /api/exports/lexware/batch` — pusht alle nicht-exportierten Belege eines Tenants
- [ ] Trigger-Optionen: Manuell (UI-Button), oder Auto nach `ocr_done + kategorisiert` (Tenant-Setting)
- [ ] Unit-Tests + Integration-Test gegen Lexware-Office-Sandbox (falls verfügbar)

## Claude-Code-Start-Prompt

```
Implementiere T009 Lexware-Office-Adapter. Lexware-Office-API-Doku checken:
https://developers.lexoffice.io/docs/. Service in backend/src/exporters/lexware-office.ts.
Migration für export_log. UPSERT via target_external_id wenn Re-Push.
Branch: andreas/T009-lexware-office-export
```

## Rollback-Plan
Wenn Lexware-API blockt: CSV-Export als Fallback (`POST /api/exports/csv?from=YYYY-MM-DD`) den Steve manuell an Steuerberaterin schickt.
