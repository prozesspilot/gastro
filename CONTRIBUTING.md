# CONTRIBUTING — wie wir bei Gastro entwickeln

> **Voraussetzung:** Lies erst `Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md` — dort steht das Gesamtbild. Diese Datei ist die Kurz-Referenz für tägliches Arbeiten.
>
> **Naming-Konvention:** Das System heißt intern **Gastro** (Code, Repo, Tech-Doku). Die Firma + Brand für Außen-Kommunikation heißt **ProzessPilot** (AGB, Sales, Customer-Touchpoints).
>
> **Stand 2026-06-06.** Verifizierter Code-Stand (was wirklich läuft): [`.claude/CLAUDE.md`](.claude/CLAUDE.md) §3.

---

## Schnell-Start

### Wenn du eine Task übernimmst

```bash
# In Claude Code:
/start-task T015
```

→ Liest die Task-Spec, **verschiebt sie nach `_in_progress/`** (mit Owner-Name), **erstellt den Branch**, macht den Initial-Commit, sendet eine **Discord-Notification** und beginnt die Implementation.

### Wenn du fertig bist

```bash
# In Claude Code:
/finish-task
```

→ Quality-Gates (**Lint, Type-Check, Tests, Build**), prüft die Akzeptanz-Kriterien, aktualisiert ggf. `tasks/MANUELLE_AUFGABEN.md`, **pusht den Branch**, **eröffnet den PR via GitHub-MCP** und sendet eine **Discord-Notification**. Merged NICHT selbst — das entscheidet der Review.

### Wenn du einen PR reviewen sollst

```bash
# In Claude Code:
/review-pr 42
```

→ Checkt den PR-Branch aus, verifiziert lokal (install/lint/typecheck/test), lässt den **code-reviewer-Agent** laufen, postet **Inline- + Summary-Kommentare** auf GitHub, sendet Discord-Notification und trifft die **Merge-Entscheidung** (Approve + grüne CI). **Self-Review ist verboten** — der jeweils andere review't.

---

## Erstmaliges Setup auf einem neuen Mac

```bash
# 1. Repo clonen (Repo heißt "gastro" auf GitHub; lokaler Ordner beliebig)
gh repo clone <owner>/gastro prozesspilot
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

# 7. Dependencies installieren (kein Root-package.json — pro App)
cd backend && npm install && cd ../webapp && npm install && cd ..

# 8. Erste Test-Session
claude
> /start-task T000-bootstrap-workflow
```

---

## Branch-Naming (Pflicht)

| Wer | Pattern | Beispiel |
|---|---|---|
| Steve | `steve/T<id>-<kurz>` | `steve/T012-onboarding-wizard-step1` |
| Andreas | `andreas/T<id>-<kurz>` | `andreas/T015-m15-sumup-oauth` |
| IONOS-Server | `server/T<id>-<kurz>` | `server/T030-hotfix-deployment` |
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

### Production rot (IONOS)
- Im Discord `#alerts-critical` schauen
- Über IONOS-SSH einloggen (87.106.8.111)
- `docker compose logs -f backend` für Live-Logs
- Bei Bedarf: `/start-task T<emergency>-hotfix-...`

### Du verstehst Code nicht
- `task-explainer`-Agent fragen: "Erkläre mir was diese Datei macht"
- Im Discord `#dev-coordination` fragen
- Konzept-Doku nochmal lesen
