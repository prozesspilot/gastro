# STRUCTURE.md

> **Stand:** 2026-05-15 (komplett neu nach Repo-Refactor — Verschachtelung aufgelöst)
>
> **Naming:** Repo heißt auf GitHub **`gastro`** (Code-Name). Firma + Brand für Außen-Kommunikation heißt **ProzessPilot**.
>
> Branch-Policy: `main` ist geschützt, Feature-Branches mit Naming-Convention `<owner>/T<id>-<kurz>` (siehe [Claude_Code_Workflow.md](Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md)).

Diese Datei ist die kanonische Karte des Repositorys. Bei Diskrepanzen zwischen dieser Datei und der Realität: bitte aktualisieren.

---

## Top-Level-Layout

```
prozesspilot/                              ← Repo-Root
│
├── README.md                              ← Projekt-Übersicht
├── CONTRIBUTING.md                        ← Tägliche Arbeits-Referenz
├── STRUCTURE.md                           ← Diese Datei
├── ProzessPilot_Anleitung.docx            ← Endkunden-Anleitung (Stand alt)
├── ProzessPilot_Projektplan.docx          ← Historischer Projektplan
│
├── docker-compose.yml                     ← Lokales Dev-Setup
├── docker-compose.prod.yml                ← Production-Setup für Hetzner
│
├── Modulkonzept/                          ← Konzept-Doku (komplett)
│   └── Konzeptentwicklung/
│       ├── README.md                      ← Konzept-Übersicht (Lese-Reihenfolge!)
│       ├── 00_*.md                        ← Strategie, Vertrieb, Pilot, Architektur
│       ├── 01–06_*.md                     ← Datenmodell, Kundenprofil, n8n, Erweiterbar, Roadmap, Prompts
│       ├── Claude_Code_Workflow.md        ← Wie wir mit Claude Code arbeiten
│       ├── Discord_Integration.md         ← Discord-Bot + OAuth + Customer-Bridge
│       ├── Mitarbeiter_Webapp.md          ← Internes Tool
│       ├── Onboarding_Wizard.md           ← Customer-Setup-Frontend
│       ├── Web_Chat_Widget.md             ← Customer-Chat-Frontend
│       ├── STATUS.html                    ← Live-Status
│       ├── modules/                       ← M01–M15 Spec-Files
│       ├── legal/                         ← Vertrags-Vorlagen für Anwalt
│       ├── prompts/                       ← Historische Prompts (Archiv)
│       ├── _archive/                      ← Veraltete Konzept-Files (read-only)
│       ├── _audit/                        ← Audit-Befunde
│       └── _pilot/                        ← Pilot-spezifische Notizen (vertraulich)
│
├── backend/                               ← Fastify + TypeScript (Backend)
│   ├── src/
│   │   ├── modules/                       ← M01–M15 Implementation
│   │   ├── core/                          ← Customer-Profile, Events, Hooks, Adapter, Auth, Chat, Discord-Bridge
│   │   ├── api/                           ← Fastify Routes
│   │   └── infra/                         ← DB, Redis, MinIO Clients
│   ├── package.json
│   └── tests/
│
├── webapp/                                ← Mitarbeiter-Webapp (React + Vite)
│   ├── src/
│   │   ├── pages/                         ← Tenants, Tasks, Chat, Provisions, Settings
│   │   ├── auth/                          ← Discord-OAuth-Frontend
│   │   ├── components/
│   │   └── hooks/
│   └── tests/
│
├── n8n/
│   ├── workflows/                         ← n8n-Workflow-JSONs (versioniert)
│   ├── credentials/                       ← Templates (echte Keys aus Vault)
│   └── deploy.sh
│
├── migrations/                            ← PostgreSQL-Migrationen (chronologisch)
│   ├── 001_*.sql                          ← Initial-Schemas
│   ├── 030_users_auth.sql                 ← M14 Auth (Discord-OAuth + Notfall-Login)
│   └── 040_*.sql                          ← M15 SumUp + neue Tabellen
│
├── scripts/                               ← Hilfs-Skripte
│   ├── bootstrap-first-admin.ts           ← Initial-GF anlegen
│   ├── backup.sh
│   └── deploy.sh
│
├── infra/                                 ← Infrastructure-as-Code
│   ├── monitoring/                        ← Grafana-Dashboards, Loki-Configs
│   ├── runbook/                           ← Deployment, Rollback, Oncall, Onboarding
│   ├── backup/                            ← Postgres + S3 Backup-Skripte + Restore-Test
│   ├── decisions/                         ← ADRs (PDF-Engine, Mail-Provider, Plugin-Sandbox)
│   ├── security/                          ← Security-Checklist, Incident-Response
│   ├── load-tests/                        ← Locust-Config
│   └── _inner_README.md                   ← Historische Inhalts-Notiz
│
├── docs/                                  ← Tech-Doku
│   ├── openapi.yaml                       ← OpenAPI-Spec
│   └── archive/                           ← Alte Status/Session-Berichte
│
├── tasks/                                 ← Aufgaben-System
│   ├── _README.md                         ← System-Erklärung
│   ├── _template.md                       ← Vorlage für neue Tasks
│   ├── _backlog/                          ← Tasks die noch nicht gestartet sind
│   ├── _in_progress/                      ← Aktuell in Arbeit
│   └── _done/                             ← Fertig + gemerged
│
├── .claude/                               ← Geteilte Claude-Code-Konfiguration
│   ├── CLAUDE.md                          ← Master-Context (jede Session lädt das)
│   ├── settings.json                      ← Modelle, Berechtigungen, Hooks
│   ├── agents/                            ← 7 Sub-Agents (code-reviewer, test-writer, etc.)
│   │   └── _archived_pre_reboot/          ← alte Agents aus Pre-Reboot-Phase
│   └── commands/                          ← 5 Slash-Commands
│       └── _archived_pre_reboot/          ← alte audit-Commands
│
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci.yml                         ← Mein Workflow (Lint+Test+Build+Discord-Notify)
│       ├── ci-backend.yml                 ← Existierender Backend-CI (bestehend)
│       ├── codeql.yml                     ← Security-Scan
│       ├── deploy-staging.yml             ← Auto-Deploy auf Hetzner
│       ├── deploy-stub.yml                ← TODO-Stub (noch nicht aktiv)
│       └── discord-notify.yml             ← GitHub-Events → Discord
│
├── .env.example                           ← Beispiel-Env (echte .env separat)
├── .gitignore                             ← VCS-Ignores (Secrets, Backups, Build-Output)
│
└── prozesspilot/                          ← VERALTETER Sub-Ordner — bitte manuell löschen
    └── _DEPRECATED_FOLDER.md              ← Anleitung zum manuellen Aufräumen
```

---

## Wichtige Pfad-Konventionen

| Bereich | Pfad | Wo es lebt |
|---|---|---|
| Modul-Implementation | `backend/src/modules/m<NN>-<name>/` | Code |
| Modul-Spec | `Modulkonzept/Konzeptentwicklung/modules/M<NN>_<Name>.md` | Doku |
| n8n-Workflow | `n8n/workflows/WF-<Domain>-<Variant>.json` | Workflow |
| Migration | `migrations/<NNN>_<beschreibung>.sql` | DB |
| Sub-Agent | `.claude/agents/<name>.md` | Claude Code |
| Slash-Command | `.claude/commands/<name>.md` | Claude Code |
| Task-Spec | `tasks/_backlog/T<XXX>-<beschreibung>.md` (dann `_in_progress/`, dann `_done/`) | Workflow |

---

## Was wo gepflegt wird

| Bereich | Pflege durch | Wann |
|---|---|---|
| Konzept-Doku (`Modulkonzept/...`) | beide gemeinsam | bei jeder Architektur-Änderung |
| Backend-Code (`backend/`) | Andreas | bei jeder Modul-Erweiterung |
| Webapp-Code (`webapp/`) | Steve | bei UI-Änderungen |
| n8n-Workflows (`n8n/`) | Andreas | bei Workflow-Änderungen |
| Migrations (`migrations/`) | Andreas | rückwärts-kompatibel, eine pro PR |
| Tasks (`tasks/`) | beide | laufend |
| Sub-Agents (`.claude/agents/`) | beide | Workflow-Änderungen |
| Legal-Docs (`Modulkonzept/.../legal/`) | Steve + Anwalt | bei AGB-/AVV-Updates |
| Subunternehmer-Liste (`legal/Subunternehmer.md`) | Steve | bei jedem neuen externen Dienst |

---

## Veraltete Bereiche

- `Modulkonzept/Konzeptentwicklung/_archive/` — historische Konzept-Files (bleiben, werden nicht mehr gepflegt)
- `Modulkonzept/Konzeptentwicklung/prompts/` — historische Prompt-Sammlung (bleibt als Referenz, kein aktiver Workflow mehr)
- `prozesspilot/` (innerer Sub-Ordner) — Refactor-Rest, bitte manuell löschen (siehe `_DEPRECATED_FOLDER.md` darin)

---

**Letzte Aktualisierung:** 2026-05-15 (komplett neu nach Refactor)
**Verantwortlich:** Steve + Andreas
