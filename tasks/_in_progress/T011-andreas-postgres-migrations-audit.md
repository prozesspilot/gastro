# T011 — Postgres-Migrations-Audit + Bootstrap-Reset

> **Owner:** Andreas
> **Geschätzt:** 1 Tag
> **Priorität:** P0 (Foundation — muss VOR allen anderen Tasks fertig sein)
> **Dependencies:** Keine
> **Welle:** 1 (zuerst!)
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/00_Architektur_Hauptdokument.md` Sektion „Datenmodell"

---

## Ziel

Pre-Reboot-Migrations gegen das neue Konzept-Datenmodell abgleichen. Fehlende Tabellen/Spalten als neue Migrations ergänzen, sodass alle nachfolgenden Tasks (T001-T010) auf ein konsistentes Schema bauen können.

---

## Akzeptanz-Kriterien

- [ ] Inventory: alle existierenden Migrations in `backend/migrations/` aufgelistet mit Status
- [ ] Abgleich gegen Konzept-Datenmodell aus `01_Datenmodell.md` (falls existiert, sonst aus Modul-Specs M01-M15)
- [ ] Fehlende Tabellen identifiziert: `users`, `tenants`, `belege`, `kasse_integrations`, `kasse_transactions`, `export_log`, `audit_log`, `tenant_settings`
- [ ] Neue Migrations geschrieben für fehlende Tabellen/Spalten (eine Migration pro Konzept-Erweiterung)
- [ ] Indexes auf häufige Query-Pfade: `(tenant_id, status)`, `(tenant_id, uploaded_at DESC)`, `(email)` unique
- [ ] Row-Level-Security (RLS) Policies für Tenant-Isolation auf ALLEN Tabellen mit `tenant_id`
- [ ] Migrations-Down-Pfad für Rollback getestet
- [ ] Fresh-DB-Test: `dropdb && createdb && npm run migrate` läuft fehlerfrei durch
- [ ] Seed-Daten-Skript für lokale Dev-Umgebung (Test-Tenant + Test-User)
- [ ] Dokumentation: `backend/migrations/SCHEMA.md` mit ER-Diagramm-Beschreibung

## Claude-Code-Start-Prompt

```
Lies 00_Architektur_Hauptdokument.md + alle modules/M*.md Sektionen mit "Datenmodell".
Vergleich gegen aktuelle Migrations in backend/migrations/.
Implementiere T011: fehlende Migrations + RLS-Policies.
Test: dropdb gastro_dev && createdb gastro_dev && npm run migrate sollte sauber durchlaufen.
Branch: andreas/T011-migrations-audit
```

## Hinweis für Owner (Andreas)
Du schreibst NICHT selbst SQL — Claude Code generiert die Migrations basierend auf den Konzept-Specs. Du gibst nur den Start-Prompt und reviewst dann ob die Migrations plausibel sind. Bei Unsicherheit: Steve im PR-Review nach Sicht-Check fragen.

## Rollback-Plan
Falls Migrations Probleme machen: Pre-Reboot-Schema lassen wie es ist und für jede neue Task eigene Tabellen anlegen. Konsolidieren nach Pilot-Phase.
