# T090 — M08 Monats-Übergabe-Cron (Auto-Build + Auto-Versand für alle Tenants)

**ID:** T090
**Verantwortlich:** Steve
**Priorität:** P2 (Build-out Phase D3 — automatisiert den Wertkreis aus T087/T089; schließt den „Testkunde spielt alles selbst durch"-Flow auf der Reporting-Seite)
**Branch:** `steve/T090-m08-monthly-handover-cron`
**Geschätzt:** 0,5–1 Tag
**Dependencies:** T087 (Monats-Report-Build) ✅ · T089 (Steuerberater-Übergabe) ✅
**Ziel-Meilenstein:** Build-out Phase D
**Anker:** `modules/M08_Monatsreporting.md` §17.2 (Cron-Logik) — **auf belege-Welt + Backend-CLI portiert** (Spec referenziert tote `/customers/:id/...`-Routen + n8n `WF-CRON-M08.json`; n8n ist eingefroren, Strategie ist backend-seitig).

---

## Was zu tun ist

Ein **standalone CLI-Cron-Skript**, das einmal pro Monat für **alle aktiven Tenants** den Monats-Report des **Vormonats** baut (`buildMonthlyReport`, T087) und per Steuerberater-Mail versendet (`deliverReport`, T089). Kein In-Process-Scheduler — externer Trigger (IONOS systemd-Timer), exakt nach dem **Muster `backend/src/cron/sumup-daily.ts`** (Pool, `require.main`-Guard, exportierte `run…()`-Funktion, tenant-übergreifend ohne JWT, System-Actor).

### Scope
1. **Neues Skript** `backend/src/cron/monthly-report.ts` nach Vorlage `sumup-daily.ts`:
   - exportierte `runMonthlyReportCron(opts?)` + `if (require.main === module)`-Entrypoint.
   - **Dependency-Injection** für Tests: `opts?: { pool?, s3?, transport?, now? }` — Default: echter `Pool`/`createS3Client()`/SMTP/`new Date()`. (Damit der Unit-Test ohne DB läuft; vgl. `sumup-daily` erstellt Pool selbst, hier zusätzlich injizierbar.)
2. **Aktive Tenants listen:** `listTenantsForStaff(pool)` (`backend/src/routes/tenants.repository.ts`, DEFINER-Funktion `list_tenants_for_staff()`), filtern auf `deletion_status === 'active'`. **Nicht** zusätzlich auf `onboarding_status='activated'` filtern (der Pilot/manuell provisionierte Tenants haben evtl. kein 'activated' — würde sie fälschlich überspringen).
3. **Periode:** Vormonat via `defaultPeriod(now)` (bereits exportiert in `handlers/build-report.handler.ts`).
4. **Pro Tenant** (Fehler-Isolation: ein Tenant-Fehler darf den Lauf NICHT abbrechen — try/catch je Tenant, weiter):
   - `buildMonthlyReport(deps, tenantId, year, month, { actor: { type: 'system', id: 'cron:monthly-accountant-handover' } })`.
   - **Leer-Skip:** wenn `result.totals.totals.receipts_count === 0` → KEIN Versand (kein „0 Belege"-Spam an den Steuerberater), als `skipped_empty` loggen.
   - sonst `deliverReport(deps, tenantId, reportId, { actor: <system> })`.
5. **Re-Run-Schutz (Versand-Idempotenz):** `deliverReport` um Option `{ skipIfAlreadySent?: boolean }` erweitern — existiert für `(report, channel, recipient_hash)` bereits ein `sent`-Delivery, NICHT erneut senden, sondern `{ ok:true, alreadySent:true, deliveryId }` zurückgeben. Der Cron ruft mit `skipIfAlreadySent: true` (verhindert Doppel-Mail bei systemd-Retry; die Einzeltenant-Route bleibt at-least-once). Braucht einen Lese-Helper in `report-delivery.repository.ts` (z. B. `findDeliveryStatus(client, …)`).
6. **Versand-Ergebnisse mappen:** `sent`/`dryRun`/`alreadySent` → erfolgreich; `no_recipient` → `skipped_no_recipient` (kein Fehler — Steuerberater-Mail noch nicht hinterlegt); `pdf_missing`/`send_failed`/build-throw → `failed` (loggen, weiter).
7. **Summary + Exit-Code** wie `sumup-daily`: `{ built, delivered, skipped_empty, skipped_no_recipient, failed }`; Exit `0` (alle ok), `1` (≥1 failed), `2` (Crash).
8. **Tests** (`backend/src/cron/monthly-report.test.ts`, ohne DB — `listTenantsForStaff`/`buildMonthlyReport`/`deliverReport` gemockt): Fehler-Isolation (Tenant 2 failed → Tenant 3 läuft weiter, Exit 1), Leer-Skip, no_recipient-Skip, alreadySent-Skip, Summary-Korrektheit. Plus Unit-Test für `findDeliveryStatus`/`skipIfAlreadySent`-Pfad in `deliverReport` (Service-Test, ggf. Integration).

### Bewusst NICHT (spätere Tasks / andere Module)
In-Process-Node-Scheduler (bleibt externer systemd-Timer) · Discord-`#dev-log`-Notification nach Lauf (§17.2 Schritt 7 — optionaler Folge-Task) · DATEV-CSV/Original-ZIP/Z-Bon-Anhänge (M04/M15) · per-Tenant konfigurierbarer Versand-Tag · Quartals-USt.

---

## Akzeptanz-Kriterien
- [ ] `backend/src/cron/monthly-report.ts` nach `sumup-daily.ts`-Muster (exportierte `runMonthlyReportCron`, `require.main`-Guard → wird in Tests NICHT ausgelöst)
- [ ] Iteriert alle `deletion_status='active'`-Tenants, baut Vormonats-Report mit System-Actor `cron:monthly-accountant-handover`
- [ ] Leerer Monat (0 verbuchte Belege) → kein Versand (`skipped_empty`)
- [ ] `deliverReport` `skipIfAlreadySent`-Option: bereits `sent` → kein Doppel-Versand (Cron nutzt sie; Route unverändert at-least-once)
- [ ] `no_recipient` (kein `advisor_email`) → Skip, kein Fehler; `failed` bricht den Gesamtlauf NICHT ab (Fehler-Isolation pro Tenant)
- [ ] Summary-Objekt + Exit-Codes 0/1/2; kein PII im Log (nur tenantId + Aggregat/Status)
- [ ] Tests grün (Cron-Orchestrierung + `skipIfAlreadySent`) · biome · build · CI grün · code-reviewer OK
- [ ] Manuelle Aufgabe ergänzt: systemd-Timer auf IONOS (`0 6 1 * *` → `docker compose exec -T backend node dist/cron/monthly-report.js`)

---

## Spec-Referenzen
- `modules/M08_Monatsreporting.md` §17.2 (Cron-Logik) + §16 (monatlich am 1.)
- `backend/src/cron/sumup-daily.ts` (Cron-Muster: Pool, require.main, Tenant-Loop, Exit-Codes)
- `backend/src/modules/m08-reporting/services/build-report.service.ts` (`buildMonthlyReport`, T087)
- `backend/src/modules/m08-reporting/services/handover-mail.service.ts` (`deliverReport`, T089)
- `backend/src/modules/m08-reporting/services/report-delivery.repository.ts` (Delivery-Repo, T089)
- `backend/src/routes/tenants.repository.ts` (`listTenantsForStaff`, DEFINER-Fn 121/123)
- `backend/src/modules/m08-reporting/handlers/build-report.handler.ts` (`defaultPeriod`)

---

## Notes
- **Kein neuer In-Process-Scheduler** (Architektur-Entscheidung, bestätigt durch Code-Recherche 2026-06-30): alle Crons im Repo sind externe CLI-Skripte (`sumup-daily.ts`, `pos-credentials-cleanup.ts`), getriggert via IONOS systemd-Timer. Diese Task folgt dem Muster; der Zeitplan liegt außerhalb des Node-Prozesses.
- **`require.main`-Guard** garantiert, dass Import in Tests/CI keinen Lauf auslöst (kein `*_ENABLED`-Flag nötig).
- **System-Actor-Konvention:** `{ type: 'system', id: 'cron:<name>' }` (vgl. `cron:sumup-daily`, `cron:pos-credentials-cleanup`).
- **Re-Run-Schutz** macht den Cron mail-idempotent (systemd-Retry sendet nicht doppelt). T089-Service ist dokumentiert at-least-once — `skipIfAlreadySent` ist die opt-in-Härtung dafür.
