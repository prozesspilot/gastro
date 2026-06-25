# STRUCTURE.md

> **Stand:** 2026-06-06 (Doku-Wahrheits-Pass: Migrations-/scripts-Pfade, `backend/src`-Layout, `.github/workflows`, `infra/` und der entfernte innere Ordner korrigiert; Basis-Refactor 2026-05-15)
>
> **Naming:** Repo heißt auf GitHub **`gastro`** (Code-Name). Firma + Brand für Außen-Kommunikation heißt **ProzessPilot**.
>
> Branch-Policy: `main` ist geschützt, Feature-Branches mit Naming-Convention `<owner>/T<id>-<kurz>` (siehe [Claude_Code_Workflow.md](Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md)).

Diese Datei ist die kanonische Karte des Repositorys. Bei Diskrepanzen zwischen dieser Datei und der Realität: bitte aktualisieren. Was vom Code WIRKLICH läuft, steht in [`.claude/CLAUDE.md`](.claude/CLAUDE.md) §3.

---

## Top-Level-Layout

```
prozesspilot/                              ← Repo-Root (lokaler Ordnername; GitHub-Repo heißt "gastro")
│
├── README.md                              ← Projekt-Übersicht
├── CONTRIBUTING.md                        ← Tägliche Arbeits-Referenz
├── STRUCTURE.md                           ← Diese Datei
├── WORKFLOW_DAILY.md                      ← Tages-Workflow (Fallback; primär: /start-task etc.)
│
├── docker-compose.yml                     ← Lokales Dev-Setup
├── docker-compose.prod.yml                ← Production-Setup für IONOS
│
├── Modulkonzept/                          ← Konzept-Doku = ZIEL-Zustand (komplett)
│   └── Konzeptentwicklung/
│       ├── README.md                      ← Konzept-Übersicht (Lese-Reihenfolge!)
│       ├── 00_*.md                        ← Strategie, Vertrieb, Pilot, Architektur, Naming
│       ├── 01–06_*.md                     ← Datenmodell, Kundenprofil, n8n, Erweiterbar, Roadmap, Prompts
│       ├── Claude_Code_Workflow.md        ← Wie wir mit Claude Code arbeiten
│       ├── Discord_Integration.md         ← Discord-Bot + OAuth + Customer-Bridge (Konzept)
│       ├── Mitarbeiter_Webapp.md          ← Internes Tool (Konzept)
│       ├── Onboarding_Wizard.md           ← Customer-Setup-Frontend (Konzept)
│       ├── Web_Chat_Widget.md             ← Customer-Chat-Frontend (Konzept)
│       ├── STATUS.html                    ← Status-Snapshot (kann veralten — Wahrheit: CLAUDE.md §3)
│       ├── modules/                       ← M01–M15 Spec-Files (eingefrorene tragen Warn-Banner)
│       ├── legal/                         ← Vertrags-Vorlagen für Anwalt
│       ├── prompts/                       ← Historische Prompts (Archiv)
│       ├── _archive/                      ← Veraltete Konzept-Files (read-only)
│       └── _audit/                        ← Audit-Befunde
│
├── backend/                               ← Fastify + TypeScript (Backend)
│   ├── src/
│   │   ├── modules/                       ← M01–M15 + Auth/DSGVO/Tenants Implementation
│   │   ├── core/                          ← DB/Redis/MinIO-Clients, Auth, Audit, Hooks, Adapter, OCR-Queue, Config, Logger
│   │   ├── routes/                        ← Fastify-Routes (health, sse, docs, webhooks)
│   │   ├── plugins/                       ← Fastify-Plugins
│   │   ├── cron/                          ← Geplante Jobs
│   │   ├── workers/                       ← Async-Worker (OCR-Queue)
│   │   ├── app.ts                         ← App-Aufbau (buildApp)
│   │   └── server.ts                      ← Entry-Point
│   ├── migrations/                        ← PostgreSQL-Migrationen (chronologisch, 001…110)
│   │   ├── 001_extensions.sql / 002_helpers.sql
│   │   ├── 020_users_auth.sql             ← M14 Auth (users, auth_sessions, auth_audit_log)
│   │   ├── 030_belege.sql                 ← belege-Tabelle (Welt B)
│   │   └── 040_kasse.sql …                ← M15 SumUp/Kasse + weitere
│   ├── scripts/                           ← bootstrap-admin.ts, bootstrap-lexware-token.ts, setup-app-role.sql
│   ├── package.json
│   └── tests/
│
├── webapp/                                ← Mitarbeiter-Webapp (React + Vite)
│   ├── src/
│   │   ├── pages/
│   │   ├── auth/                          ← Discord-OAuth + Notfall-Login-Frontend
│   │   ├── components/
│   │   └── hooks/
│   └── tests/
│
├── n8n/
│   ├── workflows/                         ← n8n-Workflow-JSONs (versioniert)
│   ├── credentials/                       ← Templates (echte Keys aus Vault)
│   └── deploy.sh
│
├── scripts/                               ← Repo-weite Hilfs-Skripte
│   ├── audit-api-contract.ts              ← API-Contract-Check
│   └── seed-dev.sh                        ← Dev-Tenant + Dev-User seeden
│
├── infra/                                 ← Infrastructure-as-Code
│   ├── monitoring/                        ← Grafana-Dashboards, Prometheus/Loki-Configs
│   ├── runbook/                           ← Deployment, Rollback, Oncall, Onboarding
│   ├── backup/                            ← Postgres + S3 Backup-Skripte + Restore-Test
│   ├── caddy/                             ← Caddy Reverse-Proxy-Config
│   ├── healthcheck-stub/                  ← Health-Check-Stub (ungenutzt seit T072)
│   ├── decisions/                         ← ADRs (PDF-Engine, Mail-Provider, Plugin-Sandbox)
│   ├── security/                          ← Security-Checklist, Incident-Response
│   ├── scripts/                           ← Infra-Skripte
│   ├── load-tests/                        ← Last-Test-Config
│   └── _inner_README.md                   ← Historische Inhalts-Notiz
│
├── docs/                                  ← Tech-Doku
│   ├── openapi.yaml                       ← OpenAPI-Spec
│   └── archive/                           ← Alte Status/Session-Berichte
│
├── tasks/                                 ← Aufgaben-System
│   ├── _README.md                         ← System-Erklärung
│   ├── _template.md                       ← Vorlage für neue Tasks
│   ├── MANUELLE_AUFGABEN.md               ← Manuelle Ops-Schritte (von /finish-task gepflegt)
│   ├── _backlog/                          ← Tasks die noch nicht gestartet sind
│   ├── _in_progress/                      ← Aktuell in Arbeit (wird von /start-task angelegt)
│   └── _done/                             ← Fertig + gemerged
│
├── .claude/                               ← Geteilte Claude-Code-Konfiguration
│   ├── CLAUDE.md                          ← Master-Context + Wahrheits-Anker (jede Session lädt das)
│   ├── settings.json                      ← Modelle, Berechtigungen, Hooks
│   ├── agents/                            ← Sub-Agents (code-reviewer, test-writer, etc.)
│   │   └── _archived_pre_reboot/          ← alte Agents aus Pre-Reboot-Phase
│   └── commands/                          ← Slash-Commands (start-task, finish-task, review-pr, new-module, sync-with-main)
│       └── _archived_pre_reboot/          ← alte audit-Commands
│
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci-backend.yml                 ← Aktiver Backend-CI (Lint+Test+Build)
│       ├── ci.yml.disabled                ← Alt-CI, post-Reboot deaktiviert (inaktiv)
│       ├── codeql.yml                     ← Security-Scan
│       ├── deploy-staging.yml             ← Auto-Deploy auf IONOS
│       ├── deploy-stub.yml                ← TODO-Stub (noch nicht aktiv)
│       ├── discord-notify.yml             ← GitHub-Events → Discord
│       └── task-tracker.yml               ← Task-Status-Tracking
│
├── .env.example                           ← Beispiel-Env (echte .env separat)
└── .gitignore                             ← VCS-Ignores (Secrets, Backups, Build-Output)
```

---

## Wichtige Pfad-Konventionen

| Bereich | Pfad | Wo es lebt |
|---|---|---|
| Modul-Implementation | `backend/src/modules/m<NN>-<name>/` | Code |
| Modul-Spec | `Modulkonzept/Konzeptentwicklung/modules/M<NN>_<Name>.md` | Doku |
| n8n-Workflow | `n8n/workflows/WF-<Domain>-<Variant>.json` | Workflow |
| Migration | `backend/migrations/<NNN>_<beschreibung>.sql` | DB |
| Sub-Agent | `.claude/agents/<name>.md` | Claude Code |
| Slash-Command | `.claude/commands/<name>.md` | Claude Code |
| Task-Spec | `tasks/_backlog/T<XXX>-<beschreibung>.md` (dann `_in_progress/`, dann `_done/`) | Workflow |

---

## Was wo gepflegt wird

| Bereich | Pflege durch | Wann |
|---|---|---|
| Konzept-Doku (`Modulkonzept/...`) | beide gemeinsam | bei jeder Architektur-Änderung |
| Wahrheits-Anker (`.claude/CLAUDE.md` §3) | beide | bei jeder Stand-Änderung am Code |
| Backend-Code (`backend/`) | Andreas | bei jeder Modul-Erweiterung |
| Webapp-Code (`webapp/`) | Steve | bei UI-Änderungen |
| n8n-Workflows (`n8n/`) | Andreas | bei Workflow-Änderungen |
| Migrations (`backend/migrations/`) | Andreas | rückwärts-kompatibel, eine pro PR |
| Tasks (`tasks/`) | beide | laufend |
| Sub-Agents (`.claude/agents/`) | beide | Workflow-Änderungen |
| Legal-Docs (`Modulkonzept/.../legal/`) | Steve + Anwalt | bei AGB-/AVV-Updates |

---

## Veraltete Bereiche

- `Modulkonzept/Konzeptentwicklung/_archive/` — historische Konzept-Files (bleiben, werden nicht mehr gepflegt)
- `Modulkonzept/Konzeptentwicklung/prompts/` — historische Prompt-Sammlung (bleibt als Referenz, kein aktiver Workflow mehr)
- `.github/workflows/ci.yml.disabled` — Alt-CI, post-Reboot deaktiviert (inaktiv, nur als Referenz)
- Eingefrorene Modul-Specs (M02/M04/M06–M11) — tragen oben einen Warn-Banner; beschreiben Ziel-, nicht Ist-Zustand

---

**Letzte Aktualisierung:** 2026-06-06 (Doku-Wahrheits-Pass)
**Verantwortlich:** Steve + Andreas
