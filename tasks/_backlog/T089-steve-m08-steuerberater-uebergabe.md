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
- [ ] USt-Split (19/7/0) korrekt aus den Beleg-Tax-Lines aggregiert; im Report-PDF sichtbar
- [ ] Übergabe-Mail an `steuerberater_email` mit PDF-Anhang; Dry-Run ohne SMTP (kein Crash)
- [ ] `report_deliveries` (Migration 129 + RLS + Rollback); Delivery-Status persistiert
- [ ] `POST /reports/:id/deliver` mitarbeiter+ (support→403); Report-not-found → 404
- [ ] Audit-Event `report.delivered`/`report.delivery_failed`; kein PII im Log (nur Empfänger-Hash)
- [ ] Tests grün · biome · CI grün · code-reviewer OK

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
