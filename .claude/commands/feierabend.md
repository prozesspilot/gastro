---
description: Feierabend — sammelt das in dieser Session geschriebene Claude-Memory ein und lädt es sicher nach GitHub (landet auf main, ohne Code/Secrets mitzunehmen). Gegenstück zu /schicht.
---

# /feierabend

Lädt am Ende der Session das Wichtige nach GitHub — **vor allem das Claude-Memory**, damit es nach dem nächsten `/schicht` auf allen Geräten (Steve-Mac, Steve-Windows, Andreas, IONOS) da ist. **Code geht NIE über diesen Command auf main** — der bleibt beim Review-Flow (§7/§9).

> Plain: „Schönen Feierabend" — Notizen/Erkenntnisse sichern, sodass sie morgen und auf dem anderen Rechner da sind.

> ⚠️ **Harness-Regel:** Jede mehrschrittige Git-Sequenz als **einen** Bash-Aufruf ausführen (Variablen wie `$BR` überleben nicht zwischen Aufrufen). **Merke dir gleich zu Beginn den aktuell aktiven Branch-Namen explizit** — dorthin kehrst du am Ende zurück.

## Schritt 1: Chat-Memory einsammeln (Harness → Repo)

Claude schreibt Memory teils in die **Harness-Projekt-Memory dieser Session** (geräte-lokal, **nicht** im git-Repo). Für den Sync muss es ins Repo unter `.claude/memory/`.

1. **Pfad zuerst benennen + verifizieren:** Nenne den konkreten Harness-Projekt-Memory-Pfad dieser Session und liste ihn (`ls` + Dateizahl). Nicht eindeutig bekannt → **STOPP und nachfragen** (§7.4), nicht raten.
2. Übertrage neue/geänderte `*.md`-Memory-Dateien von dort nach `.claude/memory/`.
3. **MEMORY.md-Schutz (Gate):** Die Repo-`.claude/memory/MEMORY.md` ist **kanonisch** (Einträge aller Geräte). **NIEMALS** mit der Harness-Version überschreiben — nur **fehlende Einträge einmergen**. Nichts löschen.

## Schritt 2: Was wird hochgeladen? (Transparenz + Routing)

```sh
git status --short
```

- **Nichts geändert** → „Nichts zu syncen — schon alles oben." Fertig.
- Sonst klassifizieren:
  - **Memory/Koordination** = ausschließlich `.claude/memory/`, `tasks/` (Status/Move) und `MANUELLE_AUFGABEN.md` → **Schritt 3a**.
  - Sobald **irgendetwas anderes** dabei ist — Code (`backend/`, `webapp/`, `*.ts`, Migrations), **oder inhaltliche Spec/Konzept-`.md`** (z. B. `Modulkonzept/…`, `CLAUDE.md`) → das gehört in einen **Review-PR** → **Schritt 3b**. (Spec-/Konzept-Änderungen nie ungeprüft per Admin-Merge.)

## Schritt 3a: Nur Memory/Koordination — der Normalfall

Ziel: **nur** Memory/Koordination auf `main`, garantiert **ohne** Code. Der Sync-Branch wird von der **frischen main-Spitze** erzeugt (nicht vom aktuellen Branch!) — so kann kein committeter Feature-Code in den PR geraten.

**(a) Sync-Branch + nur sichere Pfade stagen** (ein Befehl):
```sh
git fetch origin && BR="sync/feierabend-$(date +%Y%m%d-%H%M)" && git checkout -b "$BR" origin/main && git add .claude/memory tasks && git status --short
```
- Die uncommitteten Memory-Änderungen wandern mit auf den neuen Branch; gestaged wird **nur** die Allowlist (`git add -A` ist **verboten** — würde `.env`/Secrets/Müll mitnehmen).

**(b) Vor dem Commit zwei harte Gates:**
1. **Staging-Check:** Die gestageten Dateien zeigen. Ist **irgendetwas** außer `.claude/memory/`, `tasks/`, `MANUELLE_AUFGABEN.md` dabei (v. a. `.env`/Secret/Code) → **SOFORT STOPP**, `git reset` + User warnen.
2. **MEMORY.md-Gate:** `git diff --cached .claude/memory/MEMORY.md` — nur **Additionen**? Kein bestehender Eintrag entfernt? Bei Rückgang von Einträgen → **STOPP**.

**(c) Commit + Push** (ein Befehl):
```sh
git commit -m "chore: Feierabend-Sync (Memory + Koordination)" -m "Co-Authored-By: Claude <noreply@anthropic.com>" && git push -u origin "$BR"
```
- „nothing to commit" → kein Sync nötig: `git checkout <Ausgangs-Branch>`, fertig melden.

**(d) PR + Admin-Merge — mit Auth-Precheck, Diff-Allowlist-Gate und Fehlerbehandlung:**
```sh
gh auth status && gh pr create --base main --head "$BR" --title "chore: Feierabend-Memory-Sync" --body "Memory-/Koordinations-Sync via /feierabend. Kein Code." && gh pr diff "$BR" --name-only
```
- **Allowlist-Gate (hart):** Enthält `gh pr diff --name-only` **irgendeinen** Pfad außerhalb `.claude/memory/`, `tasks/`, `MANUELLE_AUFGABEN.md` → **NICHT mergen**. PR offen lassen, User warnen.
- `gh auth status` schlägt fehl (nicht eingeloggt) → PR-Schritt überspringen, dem User die Login-Anweisung geben. STOPP.
- Sonst mergen: `gh pr merge "$BR" --squash --admin --delete-branch`
- **Merge-Ergebnis prüfen** (`gh pr view "$BR" --json state -q .state` → `MERGED`?):
  - Erfolg → weiter.
  - **Fehlschlag** (kein Admin-Recht / Checks ausstehend — typisch auf Andreas'/IONOS-Geräten): Branch **nicht** löschen, PR offen lassen, Klartext: *„PR #N angelegt, aber nicht gemergt (Grund X) — bitte von Steve admin-mergen lassen."*

**(e) Zurück auf den Ausgangs-Branch** (ein Befehl):
```sh
git checkout main && git pull --ff-only origin main
```
(bzw. den zu Beginn gemerkten Feature-Branch, falls es einer war.)

## Schritt 3b: Auch Code / Spec-Änderungen dabei

- **Auf einem Feature-Branch** (`steve/T0XX-…`): normal committen + pushen —
  ```sh
  git add <konkrete Dateien> && git commit -m "<sprechende Nachricht>" -m "Co-Authored-By: Claude <noreply@anthropic.com>" && git push
  ```
  (kein `git add -A`; gezielt stagen). Der pre-commit-Hook nimmt `.claude/memory/` mit. Memory + Code reisen mit deinem normalen **Review-PR**; **nach dessen Merge** ist das Memory auf main.
- Brauchst du das **Memory sofort** auf allen Geräten (vor dem Feature-Merge)? Dann zusätzlich Schritt 3a — der zweigt ja von `origin/main` ab und nimmt nur die Memory-Allowlist, unabhängig von deinem Code.
- **Auf `main` mit uncommittetem Code:** **STOPP** — ungewöhnlich. Dem User zeigen, klären (eigener Feature-Branch nötig). Niemals Code nach main mergen.

## Schritt 4: Report

Klartext: Was wurde hochgeladen (Memory/Tasks/Code), **wohin** (PR-Nummer bzw. Branch), Merge-Status. Ein Satz: „Auf den anderen Geräten ist es nach `/schicht` (oder `git pull`)."

## Hinweis: Einrichtung pro Gerät (einmalig)

`git config core.hooksPath .githooks` (siehe `.githooks/README.md`) — dann nimmt der pre-commit-Hook `.claude/memory/` bei jedem Commit automatisch mit. `/feierabend` funktioniert auch ohne (es staged die Allowlist selbst).
