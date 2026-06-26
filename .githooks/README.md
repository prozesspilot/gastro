# Git-Hooks (versioniert)

Dieses Verzeichnis enthält **geteilte Git-Hooks**, die via Git an alle Rechner
verteilt werden (Steve-Mac, Steve-Windows, Andreas, IONOS). Anders als
`.git/hooks/` (lokal, nicht versioniert) liegt das hier im Repo.

## Aktivierung (einmalig pro Rechner)

Git nutzt versionierte Hooks erst, wenn `core.hooksPath` darauf zeigt:

```sh
git config core.hooksPath .githooks
```

Das gilt **einmal pro Klon** — auf Mac **und** auf Windows je einmal ausführen.
(Auf Windows im Git-Bash- oder normalen Terminal im Repo-Ordner.)

Prüfen, ob aktiv:

```sh
git config --get core.hooksPath   # muss ".githooks" ausgeben
```

## Vorhandene Hooks

### `pre-commit` — Auto-Memory-Sync

Nimmt `.claude/memory/` bei **jedem** Commit automatisch mit. Damit landet jede
Claude-Code-Memory-Änderung zusammen mit deinem normalen Commit im Push und
synct zwischen allen Rechnern. Du musst nichts manuell `git add`-en.

Der Hook blockiert nie einen Commit und ist idempotent.

## Sonderfall: nur Memory geändert (kein Code-Commit)

Wenn Claude Memory geschrieben hat, du aber sonst nichts committest, dann
synchronisiert dieser Einzeiler nur das Memory (läuft auf Mac-zsh **und**
Windows-Git-Bash identisch):

```sh
git add .claude/memory && git commit -m "chore: Memory-Sync" && git push
```
