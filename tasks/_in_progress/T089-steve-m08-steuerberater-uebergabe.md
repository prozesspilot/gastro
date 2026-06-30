# T089 — M08 Steuerberater-Übergabe-Mail (PDF-Anhang + USt-Split + Versand)

**ID:** T089
**Verantwortlich:** Steve
**Priorität:** P1 (Build-out Phase D3 — schließt den Wertkreis zum Steuerberater; baut auf T087)
**Branch:** `steve/T089-m08-steuerberater-uebergabe`
**Geschätzt:** 1–2 Tage
**Dependencies:** T087 (Monats-Report) ✅ · A1 Mail (T057) ✅
**Ziel-Meilenstein:** Build-out Phase D
**Anker:** `modules/M08_Monatsreporting.md` §17 (Steuerberater-Übergabe — auf belege-Welt portiert)

---

## Was zu tun ist

Den in T087 erzeugten Monats-Report per Mail an den Steuerberater des Tenants zustellen
und um die fachlich nötigen Inhalte ergänzen. Aufbauend auf dem bestehenden `m08-reporting`-Modul
+ A1-Mail-Service.

### Scope
1. **USt-Split (19/7/0)** im Aggregat: pro Beleg aus `payload.extraction.fields.tax_lines`/`tax_rate`
   (Muster: `belege-voucher-builder.ts` `computeTaxRatePercent`) Netto + USt je Satz ableiten; in
   `totals` + Report-PDF (neue „USt-Übersicht"-Sektion) aufnehmen.
2. **Steuerberater-Übergabe-Mail** (`handover-mail.service.ts`): an `tenants.steuerberater_email`
   (Spalte ggf. via Migration ergänzen, falls nicht vorhanden — prüfen!), Body aus M08 §17.1,
   PDF-Anhang via A1-Mail (`sendMail` mit `attachments`).
3. **`report_deliveries`-Tabelle** (Migration 129): pro Versand-Kanal/Empfänger Status
   (`pending`/`sent`/`failed`), `external_id`, `error` — RLS wie `reports`.
4. **Route** `POST /api/v1/reports/:id/deliver` (mitarbeiter+) — versendet einen vorhandenen Report.
5. Tests (Aggregat-USt, Mail-Body-Generator, Delivery-Idempotenz).

### Bewusst NICHT (spätere Tasks)
DATEV-CSV-Anhang (braucht M04) · ZIP der Original-Belege · Z-Bon-PDFs (M15) · Cron-Trigger
(`0 8 1 * *`) · Spar-Bericht für Wirt (§18) · Quartals-USt (§19).

---

## Akzeptanz-Kriterien
- [x] USt-Split (19/7/0) korrekt aus den Beleg-Tax-Lines aggregiert; im Report-PDF sichtbar
- [x] Übergabe-Mail an `advisor_email` mit PDF-Anhang; Dry-Run ohne SMTP (kein Crash)
- [x] `report_deliveries` (Migration 129 + RLS + Rollback); Delivery-Status persistiert
- [x] `POST /reports/:id/deliver` mitarbeiter+ (support→403); Report-not-found → 404
- [x] Audit-Event `report.delivered`/`report.delivery_failed`; kein PII im Log (nur Empfänger-Hash)
- [x] Tests grün (51 m08 / 931 gesamt, 0 fail) · biome grün · build grün · CI/code-reviewer ausstehend

---

## Umsetzungs-Notizen + Entscheidungen (§7.4)

- **Spalten-Name `advisor_email` statt `steuerberater_email`:** Die Codebasis nutzt für den
  Steuerberater bereits **English snake_case** (`advisor_cost_monthly`, Migration 123, Konvention §6.2).
  Eine zweite Sprachwelt (`steuerberater_email`) hätte Drift erzeugt → Spalte heißt `advisor_email`
  (CITEXT, Kommentar `-- steuerberater_email`). Migration 129.
- **USt-Split-Logik:** je Beleg EIN Satz (`tax_rate`, sonst dominanter `tax_lines`-Satz, wie
  M05-Voucher-Builder) auf das volle `total_gross` → Σ(Split) == `gross_sum` (reconciled). Anders als
  der Voucher-Builder wird ohne Satz-Info **nicht** auf 19 % geraten — solche Belege landen im
  Sammelposten „nicht zuordenbar" (GoBD: transparent statt falsch). Exotische Sätze (z. B. 16 %)
  ebenfalls „nicht zuordenbar". Per-Position-Mehrsatz-Split = spätere Verfeinerung.
- **Anrede generisch** („Sehr geehrte Damen und Herren") — kein Steuerberater-Name im Datenmodell.
- **Idempotenz:** UNIQUE `(report_id, channel, recipient_hash)`; erneuter Versand = Status-Update
  desselben Rows. `recipient_hash` = voller SHA256 (PII-frei) in der DB; Audit/Log nur Kurz-Hash.
- **SMTP-I/O außerhalb der DB-Tx** (Pending → senden → Ergebnis+Audit), keine offene Tx über SMTP.
- **Delivery rendert NICHT neu** — versendet das beim Build erzeugte PDF; USt-Sektion erscheint in
  Reports, die NACH T089 gebaut wurden (Alt-Snapshots ohne `ust_split` rendert das PDF defensiv).
- **Build/Test-Gate grün**; DB-Integrationstests skippen lokal ohne Postgres → laufen in CI.

### Geänderte/neue Dateien
- Migration `129_report_deliveries.sql` (+ Rollback): `advisor_email` + `report_deliveries` + RLS
- Neu: `services/ust-split.ts`, `services/handover-mail.builder.ts`, `services/handover-mail.service.ts`,
  `services/report-delivery.repository.ts`, `handlers/deliver-report.handler.ts` (+ je Tests)
- Geändert: `services/aggregator.ts`, `services/report-pdf.ts`, `services/report.repository.ts`,
  `handlers/build-report.handler.ts`, `routes.ts`, `core/storage/storage.service.ts` (`downloadObject`)

---

## Spec-Referenzen
- `modules/M08_Monatsreporting.md` §17 (Steuerberater-Übergabe)
- `backend/src/modules/m08-reporting/` (T087 — aggregator/report-pdf/build-report)
- `backend/src/core/mail/` (A1 — `sendMail` mit `attachments`, Dry-Run, PII-Hash)
- `backend/src/modules/m05-lexoffice/services/belege-voucher-builder.ts` (`computeTaxRatePercent` — USt-Logik)

---

## Notes
- **Erst prüfen:** Hat `tenants` schon eine `steuerberater_email`-Spalte? (T066 hat viele Stammdaten-
  Spalten ergänzt.) Falls nein → Migration ergänzen, sonst wiederverwenden.
- **NIT aus PR #206-Review (optional hier mitnehmen):** `reports.created_at` wird beim Re-Build auf
  `now()` gesetzt (Snapshot-Semantik). Falls das Erst-Erstelldatum revisionsrelevant sein soll →
  separates `built_at`/`first_built_at`-Feld erwägen.
- USt-Split braucht verlässliche `tax_lines` — bei fehlenden/uneindeutigen Sätzen defensiv auf
  „nicht zuordenbar" sammeln statt zu raten (GoBD: lieber transparent als falsch).
