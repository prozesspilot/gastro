# STRUCTURE.md

Stand: 2026-05-07
Branch-Policy: genau ein Branch (`main`). Keine Worktrees ausser dem Hauptverzeichnis.

Diese Datei ist die kanonische Karte des Repositorys. Wenn etwas hier nicht beschrieben ist, ist es entweder
veraltet (siehe `docs/archive/`) oder benutzergetrieben (Konzept-/Prompt-Dateien im Repo-Root).

---

## Top-Level-Layout

| Ordner / Datei                      | Aufgabe |
|-------------------------------------|---------|
| `Modulkonzept/`                     | Fachliche Spezifikationen, Architektur, Roadmap, Modul-Specs (M01..M11). Quelle der Wahrheit fuer **was** gebaut wird. |
| `prozesspilot/`                     | Lauffaehiger Code-Monorepo (Backend, Webapp, n8n, Migrations, Infra-Compose). |
| `prozesspilot/backend/`             | Fastify/TypeScript-Backend. Modulare Struktur unter `src/modules/<m##>-*/`. |
| `prozesspilot/webapp/`              | React/Vite-Frontend (Tailwind + Radix). Pages, Hooks, MSW-Tests. |
| `prozesspilot/n8n/`                 | n8n-Workflow-JSONs + Deploy-Skript. Konvention `WF-<TYPE>-<MODULE>.json`. |
| `prozesspilot/migrations/`          | Postgres-SQL-Migrations, fortlaufend nummeriert (`001_..` .. `030_..`). |
| `prozesspilot/infra/`               | Infra-spezifische Configs (verschachtelt unter `monitoring/`, etc.). |
| `prozesspilot/docker-compose.yml`   | Lokales Compose-Setup (Postgres, Redis, n8n, Backend, Webapp). |
| `prozesspilot/docker-compose.prod.yml` | Produktions-Compose-Variante. |
| `prozesspilot/scripts/`             | Hilfsskripte (Build, Smoke, Audit). |
| `infra/`                            | Repo-weite Infra (top-level `Konzeptentwicklung`-Spec). |
| `docs/archive/`                     | Archivierte Status-/Session-Berichte. Wird beim Aufraeumen befuellt, nicht von Code referenziert. |
| `AGENT_SOLO.md`, `AGENTS_AUTONOM.md` | Agent-Anleitungen aus paralleler Phase. Header trägt Hinweis "ggf. überholt". |
| `CLEANUP_PLAN.md`                   | Cleanup-Bericht (dieser Lauf). |
| `STRUCTURE.md`                      | **Dieses** Dokument. Repository-Karte. |
| `prompt_*.txt`, `aufgaben_*.txt`, `agent_system_prompt*.txt`, `*.html`, `Website_Prompt.md` | Benutzergetriebene Konzept- und Prompt-Dateien. Nicht im Code-Pfad. |

---

## Wo finde ich was?

| Was            | Wo |
|----------------|----|
| Fachkonzepte (Module, Architektur) | `Modulkonzept/Konzeptentwicklung/` (`00_Architektur_Hauptdokument.md`, `modules/M01..M11_*.md`, `05_Roadmap.md`) |
| Backend-Quelltext                  | `prozesspilot/backend/src/` (Module unter `src/modules/`, Plumbing unter `src/core/`) |
| Backend-Routen-Definitionen        | `prozesspilot/backend/src/routes/` und `src/modules/<m##>-*/routes.ts` |
| Backend-Tests                      | `prozesspilot/backend/tests/` und `src/__tests__/` (Integration) |
| Web-App-Quelltext                  | `prozesspilot/webapp/src/` (Pages, Components, Hooks, Api-Clients) |
| Web-App-Pages                      | `prozesspilot/webapp/src/pages/` (kanonische Page-Liste) |
| Web-App-Tests                      | `prozesspilot/webapp/src/tests/` (Vitest + MSW + Playwright e2e) |
| n8n-Workflows                      | `prozesspilot/n8n/workflows/WF-*.json` (eine Datei je Workflow) |
| n8n-Deploy-Hilfen                  | `prozesspilot/n8n/deploy.sh` |
| DB-Migrations                      | `prozesspilot/migrations/<NNN>_<modul>.sql` (laufend, nummerisch monoton) |
| ENV-Vorlagen                       | `prozesspilot/.env.example` (kanonisch fuer Backend); n8n-ENV in `prozesspilot/n8n/workflows/README.md` Section "ENV-Variablen in n8n" |
| Doku Designentscheidungen Webapp   | `prozesspilot/webapp/DESIGN_DECISIONS.md` |
| Doku Implementierungs-Status Backend | `prozesspilot/backend/IMPLEMENTATION_STATUS.md` |
| Archivierte Session-Statusberichte | `docs/archive/` |

---

## Lokales Setup (3 Befehle)

Alle Befehle aus `/Users/donandrejo/Documents/ProzessPilot/prozesspilot/`.

```bash
# 1) Infrastruktur (Postgres, Redis, n8n) hochfahren
docker compose -f docker-compose.yml up -d

# 2) Backend starten (mit Watch)
cd backend && npm install && npm run dev

# 3) Webapp starten (separates Terminal)
cd ../webapp && npm install && npm run dev
```

Migrations einspielen (Backend muss DB-Verbindung haben):
```bash
cd prozesspilot/backend && npm run migrate
```

---

## Kanonische Wahrheit

| Bereich            | Quelle |
|--------------------|--------|
| Backend-Routen     | `prozesspilot/backend/src/modules/*/routes.ts` und `src/routes/` (eingebunden in `src/app.ts`) |
| Web-App-Pages      | `prozesspilot/webapp/src/pages/` (jede `.tsx`-Datei = eine Route, gemappt in `App.tsx`) |
| n8n-Workflows      | `prozesspilot/n8n/workflows/WF-*.json` — eine Datei je Workflow, kanonischer Dateiname siehe README in dem Ordner |
| DB-Schema          | `prozesspilot/migrations/*.sql` — chronologisch durchnummeriert |
| Modul-Specs        | `Modulkonzept/Konzeptentwicklung/modules/M*.md` |

Versionierte Workflow-Aenderungen: in n8n bearbeiten, exportieren, Datei im Repo committen.
Dateinamen-Suffixe wie `_clean`, `_old`, `_backup` sind verboten; sie werden im Cleanup entfernt.

---

## Branch- und Worktree-Policy

- **Genau ein Branch**: `main`. Feature-Arbeit darf in kurzlebigen Branches passieren, wird aber **immer** in main gemergt und dann geloescht.
- **Keine sekundaeren Worktrees** im Standardbetrieb. Bei Bedarf temporaer, danach `git worktree remove` und `git branch -D`.
- **Backup ueber Tags**: Vor jeder Konsolidierung `git tag pre-cleanup-YYYYMMDD-HHMM` und `git tag archive/<branch>-YYYY-MM-DD <branch>` setzen, **dann** loeschen.

## Workflow-Datei-Konvention

```
WF-{TYPE}-{MODULE}.json
```

Erlaubte `TYPE`-Werte: `INPUT`, `MASTER`, `M01`..`M11`, `CRON`, `ERROR`, `PLUGIN`.
Eine Datei pro Workflow. Keine `_clean`/`_old`/`_backup`-Varianten committen.
