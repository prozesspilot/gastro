---
description: Pullt main, rebased aktuellen Branch, löst einfache Konflikte. Bei komplexen Konflikten Hilfe vom User holen.
---

# /sync-with-main

Aktualisiere deinen Branch mit dem aktuellen Stand von `main`.

## Schritt 1: Status prüfen

```bash
git status
```

Bei uncommitted Changes: STOPPEN, fragen ob committed oder gestasht werden soll.

## Schritt 2: Aktuellen Branch merken

```bash
CURRENT=$(git branch --show-current)
```

## Schritt 3: main pullen

```bash
git checkout main
git pull origin main
```

## Schritt 4: Zurück auf Branch + Rebase

```bash
git checkout $CURRENT
git rebase main
```

## Schritt 5: Konflikt-Handling

Bei Konflikten:
- Liste alle konfliktbehafteten Dateien
- Versuche **einfache Konflikte** (z.B. parallel hinzugefügte Imports) automatisch zu lösen
- Bei **komplexen Konflikten** (Logik-Änderungen am gleichen Code):
  - **NICHT raten**
  - User die Stelle zeigen
  - Optionen erklären
  - User entscheiden lassen

## Schritt 6: Erfolgreiche Sync

```bash
git push --force-with-lease
```

(Wichtig: `--force-with-lease` statt `--force`, schützt vor Überschreiben fremder Commits)

## Schritt 7: Tests laufen

Nach Sync sollten Tests grün sein:

```bash
npm test
```

Bei Fehler: war eine Konflikt-Auflösung falsch? User zeigen.
