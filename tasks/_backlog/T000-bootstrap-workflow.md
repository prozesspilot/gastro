# T000 — Bootstrap Claude-Code-Workflow

**ID:** T000
**Verantwortlich:** Steve + Andreas (gemeinsam, Pair-Programming-Session)
**Priorität:** P0
**Branch:** `gemeinsam/T000-bootstrap-workflow`
**Geschätzt:** 1 Tag (Pair-Programming)
**Dependencies:** keine (das ist der Anfang)
**Ziel-Meilenstein:** M0
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Setze den Claude-Code-Workflow operativ auf, sodass alle weiteren Tasks ohne manuelle Konfiguration starten können. Diese Task ist die Vorbedingung für alle anderen.

---

## Akzeptanz-Kriterien

### GitHub-Setup
- [ ] Repo-Owner: beide haben Push-Rechte
- [ ] Branch-Protection auf `main` aktiviert: PR-Pflicht, Status-Check CI muss grün
- [ ] `.github/workflows/` Files committet (ci.yml, discord-notify.yml, deploy-staging.yml)
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` aktiv
- [ ] GitHub-Secrets konfiguriert:
  - [ ] `DISCORD_DEV_LOG_WEBHOOK`
  - [ ] `DISCORD_DEV_COORDINATION_WEBHOOK`
  - [ ] `DISCORD_ALERTS_WEBHOOK`
  - [ ] `DISCORD_DEPLOYMENT_WEBHOOK`
  - [ ] `HETZNER_HOST`
  - [ ] `HETZNER_USER`
  - [ ] `HETZNER_SSH_KEY`

### Discord-Setup
- [ ] Discord-Server "ProzessPilot Team" angelegt
- [ ] Channel-Struktur gemäß `Discord_Integration.md` Abschnitt 2.1 angelegt
- [ ] Bot-Application bei Discord registriert
- [ ] OAuth-App registriert (für Mitarbeiter-Webapp-Login)
- [ ] Webhook-URLs für GitHub-Events generiert + in GitHub-Secrets hinterlegt
- [ ] Steve und Andreas sind im Discord-Server, beide mit Geschäftsführer-Rolle

### Lokales Setup auf beiden Macs
- [ ] Beide haben Repo geclont
- [ ] Beide haben Git-Identity lokal konfiguriert (`user.name`, `user.email`)
- [ ] Beide haben Claude Code installiert + eingeloggt
- [ ] Beide haben GitHub-MCP konfiguriert
- [ ] `npm install` läuft fehlerfrei
- [ ] Claude Code lädt CLAUDE.md beim Start

### IONOS-Setup
- [x] IONOS VPS 4-4-120 vorhanden (87.106.8.111, Ubuntu 24.04)
- [x] SSH-Zugang konfiguriert (Key-only, Passwort-Auth deaktiviert)
- [x] Docker + docker compose plugin installiert
- [ ] Caddy als Reverse-Proxy konfiguriert
- [x] DNS für `admin.prozesspilot.net`, `setup.prozesspilot.net`, `api.prozesspilot.net`, `chat.prozesspilot.net` aufgesetzt
- [ ] Claude Code auf IONOS installiert (für Hotfixes + Deploy-Trigger)

### Erste End-to-End-Validierung
- [ ] Test-Branch erstellt, Test-Commit, PR eröffnet
- [ ] CI läuft grün auf dem Test-PR
- [ ] Discord-Notifications kommen in den richtigen Channels an
- [ ] Test-PR wird gemerged
- [ ] Auto-Deploy auf IONOS läuft erfolgreich
- [ ] Health-Check auf `https://api.prozesspilot.net/health` antwortet 200

### Dokumentation
- [ ] CONTRIBUTING.md ist im Repo und aktuell
- [ ] CLAUDE.md ist im Repo und aktuell
- [ ] Sub-Agents sind im Repo committet
- [ ] Slash-Commands sind im Repo committet
- [ ] tasks/_README.md erklärt das System

---

## Spec-Referenzen

- `Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md` — Master-Spec
- `Modulkonzept/Konzeptentwicklung/Discord_Integration.md` — Channel-Struktur, Bot-Setup
- `Modulkonzept/Konzeptentwicklung/00_Architektur_Hauptdokument.md` — IONOS-Setup, DNS-Subdomains
- `Modulkonzept/Konzeptentwicklung/05_Roadmap.md` — KW-21-Plan

---

## Claude-Code-Start-Prompt

```
Diese Task ist eine Pair-Programming-Session zwischen Steve und Andreas.
Wir gehen die Akzeptanz-Kriterien Punkt für Punkt durch.

Lies zuerst:
- /tasks/_in_progress/T000-gemeinsam-bootstrap-workflow.md
- /Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md
- /Modulkonzept/Konzeptentwicklung/Discord_Integration.md
- /CONTRIBUTING.md
- /.claude/CLAUDE.md

Beginne mit Akzeptanz-Kriterien-Block "GitHub-Setup".
Bei jedem Punkt fragst du uns ob es schon erledigt ist; wenn nein, machen wir es gemeinsam.

Bei Unklarheiten oder Setup-Problemen: in dieser Task-Datei unter "Offene Fragen" dokumentieren.

Wenn alle Punkte abgehakt: /finish-task
```

---

## Notes

- Diese Task wird nicht als regulärer PR gemerged, sondern direkt auf main committed (mit Ausnahme: Branch-Protection wird erst NACH dieser Task aktiviert).
- Reihenfolge der Akzeptanz-Kriterien-Blöcke ist wichtig — Discord-Setup muss vor GitHub-Webhooks fertig sein, IONOS-Setup vor Auto-Deploy-Test.
- Für IONOS-SSH-Key: ed25519 (bereits eingerichtet, Deploy-Key liegt in GitHub-Secrets).
- Discord-Webhook-URLs sind sicherheitskritisch — niemals committen, nur als GitHub-Secret.

---

## Offene Fragen (während der Bearbeitung)

<wird beim Bearbeiten ergänzt>

---

## Lessons Learned (nach Abschluss)

<wird beim Abschluss ergänzt>
