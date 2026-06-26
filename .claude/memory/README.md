# Claude Code — geteiltes Auto-Memory

Dieser Ordner ist das **file-basierte Auto-Memory** von Claude Code (persistente
Fakten/Lessons über Sessions hinweg). Er liegt bewusst **im Repo** statt im
user-lokalen `~/.claude/projects/<pfad-hash>/memory/`, damit alle Instanzen
**EIN** Memory teilen — Steve-Mac, Steve-Windows, Andreas, IONOS — synchron via
`git pull/push`.

Konfiguriert über `.claude/settings.json`:

```json
"autoMemoryDirectory": ".claude/memory"
```

## Wie es funktioniert

- `MEMORY.md` = der Index (eine Zeile pro Memory, wird bei jeder Session geladen).
- Jede `*.md`-Datei = ein Fakt (mit Frontmatter: `type` = user | feedback | project | reference).
- Claude schreibt/aktualisiert die Dateien selbst während der Arbeit.

## Sync-Workflow (Mac ↔ Windows)

1. Vor dem Rechner-Wechsel: `git add .claude/memory && git commit && git push`.
2. Am anderen Rechner: `git pull` → Memory ist aktuell.
3. Greift erst **nach Neustart** der Claude-Code-Session (+ einmalig der
   Workspace-Trust-Dialog für `.claude/settings.json`).

## NICHT hier rein

Session-Transcripts (`~/.claude/projects/<id>/*.jsonl`) bleiben **lokal** — die
sind groß, append-only und maschinen-spezifisch (kein Cross-Machine-`--resume`).

## Sichtbarkeit

Inhalt sind Projekt-Gotchas, Bau-Stand und Arbeits-Präferenzen — bewusst für das
ganze Team sichtbar (kein Secret/PII; Secrets gehören nie ins Memory).
