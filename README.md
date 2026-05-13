# ProzessPilot

Modular accounting automation platform (n8n + TypeScript + React + Postgres).

📖 **Konzept-Doku:** [`Modulkonzept/Konzeptentwicklung/`](Modulkonzept/Konzeptentwicklung/) — Architektur, Modul-Specs M01–M14, Roadmap, Status-HTMLs, Prompts. Pflicht-Kontext für Claude Code: [`Modulkonzept/Konzeptentwicklung/README.md`](Modulkonzept/Konzeptentwicklung/README.md).

## Repo-Struktur

| Pfad | Inhalt |
|---|---|
| [`prozesspilot/`](prozesspilot/) | Code: `backend/` (Fastify/TS), `webapp/` (React/Vite), `n8n/`, `migrations/`, `infra/` |
| [`Modulkonzept/Konzeptentwicklung/`](Modulkonzept/Konzeptentwicklung/) | Konzept-Doku (Specs, Roadmap, Prompts, Status-HTMLs) |

## Setup auf neuem Rechner

```bash
brew install gh node docker
gh auth login
mkdir -p ~/Documents/ProzessPilot && cd ~/Documents/ProzessPilot
gh repo clone <github-user>/prozesspilot .
cd prozesspilot/backend && npm install
cd ../webapp && npm install
# .env separat übertragen (AirDrop / 1Password) — NICHT via GitHub
docker compose -f ../docker-compose.yml up -d   # falls vorhanden, sonst aus prozesspilot/
cd ../backend && npm run migrate && npm run bootstrap:super-admin
```

> `.env`, `.env.bak*`, lokale Backups (`*.bak-*`, `prozesspilot.bak-vor-audit-fix/`) sind via `.gitignore` ausgeschlossen und müssen separat übertragen werden.
