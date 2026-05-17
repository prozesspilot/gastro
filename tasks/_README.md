# Tasks-System

Dieser Ordner ist das **zentrale Aufgaben-Tracking** für ProzessPilot. Jede Aufgabe ist eine Markdown-Datei mit standardisierter Struktur.

## Verzeichnis-Struktur

```
tasks/
├── _README.md           # Diese Datei
├── _template.md         # Vorlage für neue Tasks
├── _backlog/            # Tasks, die noch nicht gestartet wurden
├── _in_progress/        # Aktuell in Arbeit (Filename enthält Owner)
└── _done/               # Fertig + gemerged
```

## Task-Lebenszyklus

```
[_backlog/T0XX-<kurz>.md]
        │
        │  /start-task T0XX
        ▼
[_in_progress/T0XX-<owner>-<kurz>.md]   ← Branch wird angelegt
        │
        │  Implementation läuft
        │  Akzeptanz-Kriterien werden abgehakt
        ▼
[/finish-task → PR offen]
        │
        │  Cross-Review via /review-pr
        ▼
[Bei Approve + grüner CI: Merge]
        │
        ▼
[_done/T0XX-<owner>-<kurz>.md]
```

## Neue Task anlegen

1. Vorlage kopieren: `cp _template.md _backlog/T<NEUE_ID>-<kurzbeschreibung>.md`
2. Felder ausfüllen
3. Commit ins Repo
4. Discord-Notification in `#dev-coordination` (manuell oder via Hook)

## Task-IDs

- Fortlaufend nummeriert: T001, T002, T003, ...
- Niemals wieder verwenden, auch wenn gelöscht
- Aktuell höchste ID: siehe `git log` der `_done/`-Ordner

## Status-Übersicht

```bash
# Backlog
ls -la _backlog/ | wc -l

# In Progress (mit Owner)
ls -la _in_progress/

# Diese Woche fertiggestellt
git log --since="1 week ago" --diff-filter=A --name-only -- "_done/"
```

## Wer arbeitet an was?

Die Owner-Information steckt im Filename in `_in_progress/`:
- `T015-andreas-m15-sumup-oauth.md` → Andreas
- `T020-steve-discord-bot-init.md` → Steve

So sieht man auf einen Blick wer gerade was hat.

## Konflikt-Vermeidung

- **Nie zwei Owner an gleichem Code:** vor `/start-task` kurz im Discord checken
- **Dependencies beachten:** wenn Task T020 von T015 abhängt, T020 erst starten wenn T015 in `_done/`
- **Migrations seriell:** nur eine Migration in Flight

## Priorisierung

Tasks im `_backlog/` haben Priorität als Frontmatter:
- **P0** = Blocker, sofort
- **P1** = wichtig, in dieser Woche
- **P2** = kann warten, in den nächsten 2 Wochen
- **P3** = nice-to-have, irgendwann

In Claude Code:
```
/start-task T<ID>
```
