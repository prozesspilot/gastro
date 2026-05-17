# CONTRIBUTING — wie wir bei Gastro entwickeln

> **Voraussetzung:** Lies erst `Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md` — dort steht das Gesamtbild. Diese Datei ist die Kurz-Referenz für tägliches Arbeiten.
>
> **Naming-Konvention:** Das System heißt intern **Gastro** (Code, Repo, Tech-Doku). Die Firma + Brand für Außen-Kommunikation heißt **ProzessPilot** (AGB, Sales, Customer-Touchpoints).

---

## Schnell-Start

### Wenn du eine Task übernimmst

```bash
# In Claude Code:
/start-task T015
```

→ Liest Task-Spec, erstellt Branch, beginnt Implementation.

### Wenn du fertig bist

```bash
# In Claude Code:
/finish-task
```

→ Tests + Lint + Push + PR.

### Wenn du einen PR reviewen sollst

```bash
# In Claude Code:
/review-pr 42
```

→ code-reviewer-Agent läuft automatisch, postet Findings auf GitHub.

---

## Erstmaliges Setup auf einem neuen Mac

```bash
# 1. Repo clonen
git clone https://github.com/<owner>/prozesspilot.git
cd prozesspilot

# 2. Git-Identity setzen (lokal pro Repo!)
git config --local user.name "Steve Bernhardt"           # oder Andreas
git config --local user.email "steve@prozesspilot.net"   # oder Andreas

# 3. Claude Code installieren (falls noch nicht)
# Siehe https://claude.com/claude-code

# 4. Claude Code Login
claude auth login

# 5. GitHub-MCP einrichten
# Siehe MCP-Doku in Claude Code

# 6. Discord-Webhook URLs in lokale Env packen
echo "DISCORD_DEV_WEBHOOK_URL=https://discord.com/api/webhooks/..." >> ~/.zshrc

# 7. Dependencies installieren
npm install

# 8. Erste Test-Session
claude
> /start-task T001-bootstrap-workflow
```

---

## Branch-Naming (Pflicht)

| Wer | Pattern | Beispiel |
|---|---|---|
| Steve | `steve/T<id>-<kurz>` | `steve/T012-onboarding-wizard-step1` |
| Andreas | `andreas/T<id>-<kurz>` | `andreas/T015-m15-sumup-oauth` |
| Hetzner-Server | `server/T<id>-<kurz>` | `server/T030-hotfix-deployment` |
| Pair-Programming | `gemeinsam/T<id>-<kurz>` | `gemeinsam/T020-architecture-review` |

---

## Commit-Messages

```
<typ>: <kurzbeschreibung max 50 Zeichen>

<optional: längere Beschreibung>

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: <Name> <email@prozesspilot.net>
```

**Typen:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `style`

---

## Aufgaben-Verteilung (Standard)

| Bereich | Verantwortlich |
|---|---|
| Backend, Module, Migrations, n8n, Infra | Andreas |
| Mitarbeiter-Webapp, Onboarding-Wizard, Web-Chat-Widget, Discord-Bot | Steve |
| Konzept-Doku, Sales-Material, Legal-Texte | Steve |
| Pair-Programming-Sessions | beide |

---

## Code-Standards (Kurz-Version)

- TypeScript strict mode immer
- DB-Tabellen: snake_case Plural
- TypeScript-Vars: camelCase
- Tests Pflicht, Coverage ≥ 80%
- Keine Secrets im Code
- Kein PII in Logs
- Migrations rückwärts-kompatibel

Vollständig: siehe `.claude/CLAUDE.md` Abschnitt 6.

---

## Wenn etwas bricht

### Lokale Tests rot
- Erstmal: `npm install` (Dependencies aktuell?)
- Dann: einzelne Tests genau anschauen
- Bei DB-Fehler: lokale Postgres-Container neu starten

### CI rot
- GitHub-Actions-Logs lesen
- Discord-Channel `#alerts-critical` schauen — dort kommt der Fehler-Detail
- Bei Lint/Type-Check-Fehler: lokal `npm run lint && npm run typecheck` ausführen

### Production rot (Hetzner)
- Im Discord `#alerts-critical` schauen
- Über Hetzner-SSH einloggen
- `docker compose logs -f backend` für Live-Logs
- Bei Bedarf: `/start-task T<emergency>-hotfix-...`

### Du verstehst Code nicht
- `task-explainer`-Agent fragen: "Erkläre mir was diese Datei macht"
- Im Discord `#dev-coordination` fragen
- Konzept-Doku nochmal lesen
