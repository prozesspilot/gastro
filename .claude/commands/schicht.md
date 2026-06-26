---
description: Schichtbeginn — holt den neuesten Stand von GitHub (Code + Memory), spiegelt das Team-Memory in diese Session und orientiert dich kurz. Gegenstück zu /feierabend.
---

# /schicht

Bringt dieses Gerät auf den neuesten Stand: Code + Memory von GitHub holen, das in dieser Session geladene Claude-Memory auffrischen, und in wenigen Zeilen zeigen, was sich getan hat.

> Plain: „Guten Morgen" — runterladen, was zuletzt hochgeladen wurde.

> ⚠️ **Harness-Regel:** Mehrschrittige Git-Sequenzen IMMER als **einen** Bash-Aufruf ausführen — Shell-Variablen (`$CURRENT` …) überleben **nicht** zwischen getrennten Aufrufen.

## Schritt 1: Working-Tree prüfen (Sicherheit zuerst)

```sh
git status --short
```

- **Sauber** → weiter zu Schritt 2.
- **Uncommittete Änderungen** → NICHT pullen (Konflikt-/Verlust-Gefahr). Die Änderungen dem User zeigen und sagen: *„Erst `/feierabend` (hochladen) — oder committen/verwerfen — dann nochmal `/schicht`."* Dann **STOPP**. (Kein Auto-Stash: ein vergessener Stash sieht für einen Nicht-Coder wie Datenverlust aus.)

## Schritt 2: Neuesten Stand holen (EIN Befehl)

```sh
CURRENT=$(git branch --show-current); git fetch origin --prune && git checkout main && git pull --ff-only origin main; echo "---"; [ -n "$CURRENT" ] && [ "$CURRENT" != "main" ] && git checkout "$CURRENT"; echo "jetzt auf: $(git branch --show-current)"
```

- **Wenn `git pull --ff-only` mit „Not possible to fast-forward" abbricht:** lokales `main` hat eigene Commits. **NIEMALS** `reset --hard`/`--force`. Stattdessen `git log origin/main..main --oneline` zeigen, dem User erklären (diese Commits gehören vermutlich auf einen Feature-Branch) und gemeinsam klären. STOPP.

## Schritt 3: Team-Memory in diese Session spiegeln

Das geteilte Team-Memory liegt im Repo unter `.claude/memory/` (synct via git). Die **Harness-Projekt-Memory dieser Session** (die Claude beim Start lädt) liegt geräte-lokal woanders und kennt den frischen Team-Stand noch nicht.

1. **Pfad zuerst benennen + verifizieren:** Nenne den konkreten Harness-Projekt-Memory-Pfad dieser Session explizit und liste ihn (`ls` + Dateizahl). Ist er **nicht eindeutig** bekannt → **STOPP und nachfragen**, nicht raten (§7.4). Ein stiller Leerlauf-Sync ist schlimmer als eine Rückfrage.
2. Kopiere die **Inhalts**-Memory-Dateien aus `.claude/memory/` dorthin — nur neue/neuere, **nichts löschen**.
3. **MEMORY.md-Schutz (Gate):** Den Index **nicht** überschreiben. Füge nur **fehlende** Einträge in den Session-Index ein. Danach verifizieren, dass **kein bestehender Eintrag verschwunden** ist (Eintragszahl vorher ≤ nachher). Bei Rückgang → STOPP.

## Schritt 4: Orientierung (kurz halten, 3–6 Zeilen)

```sh
git log --oneline -10 origin/main
```

Fasse zusammen:
- Neue Commits auf `main` (ein Satz).
- Neue/geänderte Memory-Dateien in `.claude/memory/` (welche, ein Wort wozu).
- Was liegt in `tasks/_in_progress/` (wer arbeitet woran — Überschneidung vermeiden).
- Offene **P0/P1** in `tasks/MANUELLE_AUFGABEN.md`.

Schließe mit einem Satz: „Stand <kurz>, du kannst loslegen." Wenn nichts Neues: „Schon auf dem neuesten Stand."
