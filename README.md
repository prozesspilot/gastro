# Gastro

> **Stand:** 2026-06-06 (Doku-Wahrheits-Pass; Basis-Reboot 2026-05-15) — verifizierter Code-Stand: [`.claude/CLAUDE.md`](.claude/CLAUDE.md) §3
>
> **Naming-Konvention:** Das System/Produkt heißt intern **Gastro** (Code, Repo, Tech-Doku, ENV-Vars, DB). Die Firma + Brand für die Außen-Kommunikation heißt **ProzessPilot** (AGB, Rechnungen, Marketing, Customer-Touchpoints).

Modulares SaaS-System für deutsche **Gastronomie-Kleinunternehmer**, das deren Steuerberater-Kosten um 60–80 % senkt durch automatische Belegerfassung, KI-Kategorisierung und direkte Übergabe an DATEV / Lexware Office / sevDesk.

**Firma:** ProzessPilot (Einzelunternehmen Steve Bernhardt, Schneverdingen)
**Code-Name:** Gastro

📖 **Konzept-Doku:** [`Modulkonzept/Konzeptentwicklung/`](Modulkonzept/Konzeptentwicklung/) — vollständige Architektur, Strategie, Modul-Specs M01–M15, Legal-Vorlagen, Roadmap.

🚀 **Pflicht-Lektüre für jede Claude-Code-Session:** [`.claude/CLAUDE.md`](.claude/CLAUDE.md)

📋 **Workflow:** [`Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md`](Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md)

---

## Repo-Struktur (nach Refactor 2026-05-15)

| Pfad | Inhalt |
|---|---|
| [`backend/`](backend/) | Backend-Code (Fastify + TypeScript), Modul-Code für M01–M15 |
| [`webapp/`](webapp/) | Mitarbeiter-Webapp Frontend (React + Vite, wird zu `webapp-internal/` umbenannt) |
| [`n8n/workflows/`](n8n/workflows/) | n8n-Workflow-JSONs (versioniert) |
| [`backend/migrations/`](backend/migrations/) | PostgreSQL-Migrationen (chronologisch nummeriert, 001…110) |
| [`scripts/`](scripts/) | Repo-weite Hilfs-Skripte (API-Contract-Check, Dev-Seed) — Bootstrap-Skripte liegen in [`backend/scripts/`](backend/scripts/) |
| [`infra/`](infra/) | Docker-Compose, Caddy, Grafana, Runbooks, Backups, ADRs, Security-Checklist, Load-Tests |
| [`docs/`](docs/) | OpenAPI-Spec, Tech-Doku, Archive |
| [`.claude/`](.claude/) | Geteilte Claude-Code-Konfiguration (Sub-Agents, Slash-Commands, CLAUDE.md) |
| [`.github/workflows/`](.github/workflows/) | CI/CD (Lint, Tests, Discord-Notify, Auto-Deploy, Security) |
| [`tasks/`](tasks/) | Aufgaben-System: `_backlog/`, `_in_progress/` (von `/start-task` angelegt), `_done/` |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Schnell-Referenz fürs tägliche Arbeiten |
| [`Modulkonzept/Konzeptentwicklung/`](Modulkonzept/Konzeptentwicklung/) | Konzept-Doku |
| [`Modulkonzept/Konzeptentwicklung/legal/`](Modulkonzept/Konzeptentwicklung/legal/) | Vertrags-Vorlagen für Anwalt |

---

## Drei Frontends

| Frontend | URL | Wer | Login |
|---|---|---|---|
| Mitarbeiter-Webapp | `admin.prozesspilot.net` | intern (Steve, Andreas, zukünftige MA) | Discord OAuth + Notfall-Login mit TOTP |
| Onboarding-Wizard | `setup.prozesspilot.net` | Customer einmalig | Magic-Link |
| Web-Chat-Widget | `chat.prozesspilot.net` / `prozesspilot.net/c/{token}` | Customer bei Bedarf | Magic-Link |

**Endkunden (Wirte) sehen NIE die Mitarbeiter-Webapp.**

---

## Wer macht was

| Bereich | Verantwortlich |
|---|---|
| Backend, Module M01–M15, Migrations, n8n, Infrastructure | Andreas |
| Mitarbeiter-Webapp Frontend, Onboarding-Wizard, Web-Chat-Widget, Discord-Bot | Steve |
| Sales-Material, Legal-Texte, Vertriebsagentur-Kontakt | Steve |
| Konzept-Doku-Pflege | beide gemeinsam |

Detail siehe [Claude_Code_Workflow.md](Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md).

---

## Setup auf neuem Mac (für Steve oder Andreas)

```bash
# 1. Tools installieren
brew install gh node docker
gh auth login

# 2. Repo clonen (Repo heißt "gastro" auf GitHub)
mkdir -p ~/Documents/ProzessPilot && cd ~/Documents/ProzessPilot
gh repo clone <github-org>/gastro prozesspilot
cd prozesspilot
# (Lokaler Ordner kann beliebig heißen — viele behalten "prozesspilot" aus Gewohnheit)

# 3. Git-Identity lokal setzen (Pflicht für Co-Authored-By-Tracking)
git config --local user.name "Steve Bernhardt"          # oder Andreas
git config --local user.email "steve@prozesspilot.net"  # oder Andreas

# 4. Claude Code installieren + einloggen
# Siehe https://claude.com/claude-code
claude auth login

# 5. GitHub-MCP konfigurieren
# Siehe Claude-Code-Doku

# 6. .env separat übertragen (AirDrop / 1Password) — NICHT via GitHub
# 7. Discord-Webhook-URLs in lokale Env packen

# 8. Dependencies installieren
cd backend && npm install
cd ../webapp && npm install

# 9. Lokale Infra starten (Postgres + Redis + MinIO)
cd ..
docker compose up -d postgres redis minio

# 10. DB-Rolle gastro_app anlegen (einmalig, von den Migrationen benötigt)
docker exec -e PGPASSWORD=pp $(docker compose ps -q postgres) \
  psql -U pp -d prozesspilot -v ON_ERROR_STOP=1 \
  -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gastro_app') THEN CREATE ROLE gastro_app NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END \$\$;"

# 11. Migrations + Seed (Dev-Tenant + Dev-User)
cd backend && npm run migrate
npm run seed:dev

# 12. Erste Test-Session
cd ..
claude
> /start-task T000
```

---

## Lokal manuell testen (App im Browser)

Voraussetzung: Schritte 9–11 oben (Infra läuft, DB migriert + geseedet).

```bash
# Backend starten (Terminal 1) — API auf http://localhost:3000
cd backend && npm run dev
#   Health-Check:  curl http://localhost:3000/api/v1/health   → {"ok":true,...}
#   Ready-Check:   curl http://localhost:3000/api/v1/ready     → db + redis connected

# Webapp starten (Terminal 2) — UI auf http://localhost:5173
cd webapp && cp -n .env.example .env   # einmalig: VITE_API_URL=http://localhost:3000
npm run dev
```

**Login (Mitarbeiter-Webapp):** Die Webapp verlangt eine Anmeldung. Discord-OAuth
ist auf die Prod-Redirect-URI konfiguriert und funktioniert lokal nicht direkt —
für lokales Testen den **Notfall-Login** (Email + TOTP) nutzen:

```bash
# Einmalig einen Geschäftsführer-Account anlegen (interaktiv)
cd backend && npm run bootstrap-admin -- --force
#   → fragt Display-Name, Notfall-Email, Passwort ab
#   → gibt TOTP-Secret + Backup-Codes aus (TOTP-Secret in Authenticator-App eintragen)
```

Danach in der Webapp auf **"Notfall-Login"** klicken und mit Email + Passwort +
TOTP-Code anmelden. `PP_AUTH_DISABLED=1` umgeht NUR die HMAC-Prüfung
(n8n↔Backend), NICHT die Webapp-Session — taugt also nicht als Login-Bypass.

---

## Schnell-Befehle in Claude Code

| Befehl | Zweck |
|---|---|
| `/start-task T015` | Task aus Backlog ziehen, Branch erstellen, Implementation beginnen |
| `/finish-task` | Tests + Lint + Push + PR |
| `/review-pr 42` | code-reviewer-Agent läuft auf PR |
| `/new-module M16 name` | Modul-Skelett komplett generiert |
| `/sync-with-main` | Pull + Rebase mit Konflikt-Hilfe |

Vollständige Workflow-Doku in [`Claude_Code_Workflow.md`](Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md).

---

## Wichtige Hinweise

- **Geheimnisse niemals committen.** `.env`, `.env.bak*`, lokale Backups (`*.bak-*`) sind via `.gitignore` ausgeschlossen und müssen separat übertragen werden.
- **Direkter Push auf `main` ist nicht erlaubt** — Branch-Protection erzwingt PR-Workflow
- **Cross-Review durch den jeweils anderen** — Self-Review ist nicht erlaubt
- **Bei Unsicherheit: erst Konzept-Doku lesen, dann fragen — nicht raten**

---

## Status

**Verifizierter Code-Stand (was wirklich läuft):** [`.claude/CLAUDE.md`](.claude/CLAUDE.md) §3 — der Realitäts-Anker.

Status-Snapshot: [STATUS.html](Modulkonzept/Konzeptentwicklung/STATUS.html) (kann veralten)

Roadmap: [05_Roadmap.md](Modulkonzept/Konzeptentwicklung/05_Roadmap.md)

Pilot-Strategie: [00_Pilot_Strategie.md](Modulkonzept/Konzeptentwicklung/00_Pilot_Strategie.md)

---

**Letzte Aktualisierung:** 2026-06-06 (Doku-Wahrheits-Pass: Migrations-/scripts-/tasks-Pfade korrigiert)
