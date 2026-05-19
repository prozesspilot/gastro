# T010 — M12 DSGVO Auskunft + Löschung Endpoints

> **Owner:** Andreas
> **Geschätzt:** 1,5 Tage
> **Priorität:** P1 (Pflicht ab Pilot-Start, aber niedrige Wahrscheinlichkeit für Realfall)
> **Dependencies:** T011 Migrations-Audit
> **Welle:** 1
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M12_DSGVO.md`

---

## Ziel

DSGVO-Pflicht-Endpunkte für Auskunft (Art. 15) und Löschung (Art. 17) der Betroffenenrechte. Triggerbar via API + via Geschäftsführer-UI.

---

## Akzeptanz-Kriterien

- [ ] Endpoint `POST /api/dsgvo/auskunft` — Body: `{email}` — sammelt alle Daten zu der Person und sendet als ZIP per Email
- [ ] ZIP enthält: User-Row, alle hochgeladenen Belege (Dateien + Metadata), Audit-Log-Einträge, JSON-Export aller verbundenen Tabellen
- [ ] Endpoint `POST /api/dsgvo/loeschung` — Body: `{email, confirm: "<token>"}` — löscht alle Daten der Person
- [ ] Two-Step: erst Token via Email schicken, dann mit Token bestätigen (Confirm-Step)
- [ ] Soft-Delete für Buchhaltungsdaten die der GoBD-10-Jahres-Aufbewahrungspflicht unterliegen (DSGVO erlaubt das)
- [ ] Audit-Log-Eintrag mit Begründung pro Löschung
- [ ] Endpoint `GET /api/dsgvo/auskunft-status/:request_id` — Status-Check (Email-Versand kann async sein)
- [ ] Nur Tenant-Admin (`role = 'gf'`) darf diese Endpoints aufrufen — externe Anfragen kommen via Webapp-UI
- [ ] Rate-Limit: max 5 Anfragen pro Tag pro Tenant (Schutz vor Missbrauch)
- [ ] Unit-Tests + Integration-Test mit Beispiel-User

## Claude-Code-Start-Prompt

```
Implementiere T010 DSGVO-Endpoints. Endpoints unter /api/dsgvo/*.
ZIP-Generierung mit archiver-Library. Email-Versand via Postmark/SendGrid (Service vorhanden).
Confirm-Token: UUID mit 30min Gültigkeit, in Redis gespeichert.
Soft-Delete via `deleted_at`-Spalten + Background-Job nach 10 Jahren purged.
Branch: andreas/T010-dsgvo-endpoints
```
