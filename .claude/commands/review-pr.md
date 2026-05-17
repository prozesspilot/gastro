---
description: Reviewt einen Pull Request mit dem code-reviewer-Agent. Verwendung - /review-pr 42
---

# /review-pr <pr-number>

Reviewe den Pull Request mit der angegebenen Nummer.

## Schritt 1: PR-Daten laden

Über GitHub-MCP:
- PR-Description lesen
- Liste der geänderten Dateien
- Diff der Änderungen
- CI-Status

## Schritt 2: Identität klären

Frage: "Bist du Steve oder Andreas? Reviews sollten vom jeweils ANDEREN gemacht werden."

Prüfe ob der Reviewer NICHT der Author ist. Falls doch: warnen, aber Review trotzdem durchführen.

## Schritt 3: PR-Branch auschecken

```bash
git fetch origin
git checkout <branch-name>
git pull
```

## Schritt 4: Lokale Verifikation

Vor dem Review: Funktioniert es überhaupt?

```bash
npm install
npm run lint
npm run typecheck
npm test
```

Bei Fehler: Sofort REJECT mit Begründung "CI würde fehlschlagen — bitte fixen."

## Schritt 5: code-reviewer-Agent aufrufen

Übergebe an `code-reviewer`-Agent (Opus 4.6):
- Diff der Änderungen
- Task-Spec aus `tasks/_in_progress/T<ID>-...md`
- Relevante Konzept-Docs

## Schritt 6: Review-Output strukturiert

Der Agent gibt zurück:
- ✅ APPROVE / 🔄 CHANGES REQUESTED / ❌ REJECT
- Detaillierte Findings nach Kategorien

## Schritt 7: Review als GitHub-PR-Kommentare posten

Über GitHub-MCP:
- Inline-Kommentare an spezifischen Datei:Zeile-Stellen für jeden Finding
- Summary-Kommentar mit Empfehlung (APPROVE/CHANGES/REJECT)
- Bei APPROVE: GitHub-Approval setzen

## Schritt 8: Discord-Notification

```bash
curl -X POST $DISCORD_DEV_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{
    "content": "🔍 **Review von <Reviewer>** auf PR #<Nummer>: **<APPROVE/CHANGES/REJECT>**\n<Summary in 1 Satz>\n<URL>"
  }'
```

## Schritt 9: Bei APPROVE + grüner CI: Auto-Merge?

Frage den User: "Alle Kriterien erfüllt. Soll ich auto-mergen? (y/n)"

Bei `y`:
- Squash-Merge via GitHub-MCP
- Branch löschen
- Task-File in `_done/` verschieben (in main-Branch)
- Discord-Notification "✅ PR #X gemerged"
- Auto-Deploy startet (via GitHub Actions)
