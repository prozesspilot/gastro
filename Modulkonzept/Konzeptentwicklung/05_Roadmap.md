# 05 — Roadmap (IST-Stand 2026-05-07)

> **Hinweis:** Dieses Dokument hat sich gewandelt. Es war ursprünglich ein 16-Wochen-Plan ("SOLL"). Da die Implementierung schneller fertig wurde als geplant, ist es jetzt eine **IST-Übersicht** + nächste Schritte.

Live-Übersicht: [STATUS.html](STATUS.html).

---

## 1. Was ist fertig (Stand 2026-05-07)

### 1.1 Foundation

Alle 10 Sprint-0-Deliverables aus [Foundation_Spec.md](Foundation_Spec.md) sind **erfüllt**:

| # | Deliverable                              | Status |
|---|------------------------------------------|--------|
| 1 | Repo-Setup, CI/CD, Docker-Compose        | ✅      |
| 2 | Postgres-Schema (alle Tabellen)          | ✅      |
| 3 | Backend-Skeleton (Fastify + Auth + Health) | ✅    |
| 4 | Receipt-Schema + CustomerProfile-Schema  | ✅      |
| 5 | Customer-Profile-API (CRUD)              | ✅      |
| 6 | Event-Bus (Redis Streams)                | ✅      |
| 7 | n8n-Setup + Backend-Proxy-Pattern        | ✅      |
| 8 | Storage-Service (MinIO + Adapter)        | ✅      |
| 9 | Routing-Service                          | ✅      |
| 10| Logging/Tracing (Pino + Trace-IDs)       | ✅      |

### 1.2 Module

| ID  | Modul                                   | Paket          | Status |
|-----|-----------------------------------------|----------------|--------|
| M01 | Belegerfassung & OCR                    | Basic+         | ✅      |
| M02 | Belegarchivierung (GoBD)                | Basic+         | ✅      |
| M03 | Kategorisierung & OCR-Postprocessing    | Standard+      | ✅      |
| M04 | DATEV-Export                            | Pro            | ✅      |
| M05 | Lexoffice-Integration                   | Standard+      | ✅      |
| M06 | sevDesk-Integration                     | Standard+      | ✅      |
| M07 | Excel/Google Sheets Export              | Basic+         | ✅      |
| M08 | Monatsreporting                         | Standard+      | ✅      |
| M09 | Lieferanten-Kommunikation               | Pro            | ✅      |
| M10 | WhatsApp Eingang                        | Basic+         | ✅      |
| M11 | IMAP / E-Mail Eingang                   | Basic+         | ✅      |
| M12 | DSGVO-Workflows                         | alle           | ✅      |
| M13 | Steuerberater-Portal                    | Pro            | ✅      |

### 1.3 Plattform-Bestandteile

- Webapp (React + Vite + Playwright) — komplett, Production-Build vorhanden
- Plugin-System (Pro-Erweiterungen) — implementiert
- 17 n8n-Workflows
- 30 Postgres-Migrationen
- Infra: Runbooks, Backup-Skripte, ADRs, Security-Checklist, Load-Tests
- 131 Tests (57 Backend + 74 Webapp) grün

---

## 2. Was steht jetzt an

### 2.1 Phase A — Aufräumen (1–2 Tage)

Vor dem ersten Pilotkunden:

- [ ] Uncommitted Changes (20 Files) reviewen + commiten
- [x] Tote Refactor-Reste raus (m04-categorize, leeres _foundation/) — erledigt 2026-05-07
- [x] Konzept-Doku ↔ Code synchronisieren — erledigt 2026-05-07
- [ ] CI-Pipeline grün auf main (`npm test` + Playwright in GitHub Actions)
- [ ] Audit-Subagent (`/audit-konzept`) für künftige Drifts einrichten

### 2.1b Phase A+ — M14 User-Verwaltung + Auth (~2–3 Tage)

**Vor Phase B (Server-Deployment) zwingend nötig**, weil aktuelles Login nur ein Tenant-Select-Platzhalter ist:

- [ ] M14-Spec ([`modules/M14_User_Verwaltung_Auth.md`](modules/M14_User_Verwaltung_Auth.md)) an Claude Code übergeben — schrittweise nach §14 der Spec
- [ ] Migration `031_users_auth.sql` + Bootstrap super_admin
- [ ] Backend `core/auth/` (JWT, argon2, Permissions) + `modules/users/`
- [ ] Frontend AuthContext + LoginPage + UsersPage umbauen / neu anlegen
- [ ] Playwright-E2E-Test grün
- [ ] Initial-super_admin per ENV anlegen, Login durchklicken

### 2.2 Phase B — Server-Deployment (3–5 Tage)

Damit echte Kunden onboardbar werden:

| # | Aufgabe                                                                 | Verantwortlich |
|---|-------------------------------------------------------------------------|----------------|
| 1 | Hosting-Anbieter wählen (Empfehlung: Hetzner Cloud CX22, EU/DSGVO)     | Engineer       |
| 2 | Domain + DNS einrichten (api.example.de, n8n.example.de)               | Engineer       |
| 3 | `.env.prod` mit echten Secrets (HMAC, API-Keys, S3-Creds) füllen        | Engineer       |
| 4 | `docker-compose.prod.yml` deployen, Migrations laufen lassen           | Engineer       |
| 5 | Nginx + Let's Encrypt SSL nach `infra/runbook/01_deployment.md`        | Engineer       |
| 6 | Sentry-DSN setzen, Backup-Skripte aktivieren (Cron)                    | Engineer       |
| 7 | Smoke-Test (Health-Check + ein Test-Beleg via WhatsApp-Sandbox)        | Engineer       |
| 8 | Disaster-Recovery-Drill: Backup einspielen auf Staging                 | Engineer       |

Detail-Anleitung: [`prozesspilot/infra/runbook/01_deployment.md`](../../prozesspilot/infra/runbook/01_deployment.md).

### 2.3 Phase C — Erster Pilotkunde (2–3 Wochen Vorlauf)

| # | Aufgabe                                                                 |
|---|-------------------------------------------------------------------------|
| 1 | WhatsApp Business API bei Meta verifizieren (2–3 Wochen Vorlauf)        |
| 2 | Tenant nach `infra/runbook/04_tenant_onboarding.md` anlegen             |
| 3 | Customer-Profil + Credentials in Webapp pflegen                         |
| 4 | Drive-OAuth + Lexoffice/sevDesk-OAuth durchklicken                      |
| 5 | Test-Beleg über WhatsApp schicken — End-to-End-Validierung             |
| 6 | 50 echte Belege durchlaufen lassen, Findings ins Konzept zurückspielen |
| 7 | Operator-Schulung (Web-App: Beleg-Liste, Re-Run, manuelle Korrektur)    |

### 2.4 Phase D — Skalierung & Pro-Features (laufend)

Sobald 5+ Kunden live sind:

- [ ] Erstes echtes Custom-Plugin für einen Pro-Kunden (Plugin-System ist da, wartet auf realen Anwendungsfall)
- [ ] Mindee-Adapter (zweiter OCR-Provider, wenn Google-Vision-Genauigkeit nicht reicht)
- [ ] HA-Setup (n8n + Backend in 2 Replicas, Postgres-Replica)
- [ ] Self-Service-Onboarding in der Webapp (heute: Operator-Onboarding)
- [ ] DSGVO-Lösch-Workflow Audit (M12 ist da, regelmäßig durchprüfen)

---

## 3. Architektur-Werte (unverändert)

Auch nach Cleanup gelten weiter:

1. **Modularität** — jedes Modul einzeln generierbar, einzeln deploybar.
2. **Kundenprofil = Single Source of Truth** — keine Logik außerhalb des Profils.
3. **Trennung n8n / Backend** — Workflow-Engine vs. Business-Logik strikt getrennt.
4. **Erweiterbar ohne Umbau** — Hooks + Plugin-System für Pro-Anpassungen.
5. **Bestehende Kundensoftware wird nie ersetzt** — Archivierung + Buchhaltung auf Kunden-Systemen.

---

## 4. Neue Module hinzufügen — Vorgehen

Wenn ein Pro-Kunde ein Custom-Modul braucht:

1. Modul-Spec in `modules/MXX_<Name>.md` anlegen (Vorlage: M10).
2. Plugin-Manifest in `prozesspilot/backend/src/plugins/` schreiben.
3. Code via Prompt-Template A aus [`06_Prompt_System.md`](06_Prompt_System.md) generieren.
4. n8n-Workflow nach Konvention aus [`03_n8n_Workflows.md`](03_n8n_Workflows.md).
5. Entweder als Plugin laden (Pro-Custom) oder als Core-Modul integrieren (allgemein verwendbar).

**Wichtig nach jeder Änderung:** Konzept-Doku zuerst aktualisieren, dann Code. Sonst entsteht wieder ein Drift wie zuvor.

---

## 5. Kritischer Pfad bis zum ersten zahlenden Kunden

```
[Phase A: 1–2 Tage Aufräumen + CI grün]
        │
        ▼
[Phase B: 3–5 Tage Server-Deployment]
        │
        ├──► WhatsApp-Verifizierung (parallel, 2–3 Wochen)
        │
        ▼
[Phase C: erstes Onboarding + 50 Test-Belege]
        │
        ▼
[Erster zahlender Kunde live]
        │
        ▼
[Phase D: Skalierung + reale Custom-Plugins]
```

**Realistische Zeitschätzung bis erster zahlender Kunde:** 3–4 Wochen ab Start Phase B (Engpass: Meta-Verifizierung).

---

## 6. Risiken (aktuell)

| Risiko                                           | Wahrscheinlichkeit | Gegenmaßnahme                                              |
|--------------------------------------------------|--------------------|------------------------------------------------------------|
| Meta-WhatsApp-Verifizierung dauert > 3 Wochen    | mittel             | Parallel zu Server-Deployment starten, ngrok-Sandbox bis dahin |
| Erste echte Belege offenbaren OCR-Schwachstellen | hoch               | Mindee-Adapter ist vorbereitet, Re-Run via Webapp möglich |
| DSGVO-Anforderungen vom ersten Kunden            | niedrig            | M12 + DSGVO-Modul + EU-Hosting decken das ab               |
| Custom-Plugin-Bedarf bevor Sandbox stabil        | niedrig            | Plugin-Sandbox-ADR bereits durchgedacht                    |
| Kosten-Spike OpenAI/Anthropic                    | mittel             | Tarif-Limits pro Tenant + Mock-Modus für Tests bereits da  |

---

## 7. Was bewusst NICHT auf der Roadmap steht

- Mobile App (Web-App reicht für die Operator-Sicht; Kunden interagieren nur via WhatsApp)
- Eigener OCR-Service (Google Vision + Mindee reichen für absehbare Zeit)
- Multi-Region-Hosting (DSGVO + initiale Kundenmenge → ein EU-Standort genügt)
- Eigene Buchhaltungs-UI (das System ersetzt nie die Buchhaltungs-Software des Kunden)

---

**Letzte Aktualisierung:** 2026-05-07 (komplette Neufassung, weil Implementierung dem ursprünglichen 16-Wochen-Plan voraus war).
