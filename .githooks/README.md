# Git-Hooks (versioniert)

> ## ⚠️ ABGELÖST seit T094 — nutze `.husky/`
>
> Git unterstützt nur **einen** `core.hooksPath`. Solange er auf `.githooks`
> zeigte, waren die Lint-/Typecheck-/Test-Hooks aus `.husky/` stillgelegt — und
> umgekehrt. Der Auto-Memory-Sync von hier ist deshalb **nach `.husky/pre-commit`
> umgezogen**. Dieses Verzeichnis bleibt nur als Referenz bestehen.
>
> **Richtige Aktivierung (einmalig pro Rechner):**
>
> ```sh
> git config core.hooksPath .husky
> git config --get core.hooksPath   # muss ".husky" ausgeben
> ```
>
> `.husky/pre-commit` macht jetzt **beides**: Auto-Memory-Sync **und**
> Lint + Typecheck. `.husky/pre-push` fährt zusätzlich die Tests.
> Setze `core.hooksPath` **nicht** auf `.githooks` — das schaltet Lint/Typecheck ab.

Dieses Verzeichnis enthält **geteilte Git-Hooks**, die via Git an alle Rechner
verteilt werden (Steve-Mac, Steve-Windows, Andreas, IONOS). Anders als
`.git/hooks/` (lokal, nicht versioniert) liegt das hier im Repo.

## Aktivierung (historisch — nicht mehr verwenden)

Git nutzt versionierte Hooks erst, wenn `core.hooksPath` darauf zeigt:

```sh
git config core.hooksPath .githooks   # ⚠️ VERALTET — siehe Kasten oben
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

> **Hinweis:** Auf `main` scheitert der direkte `git push` an der Branch-Protection
> (siehe CLAUDE.md §9). Mach den Memory-Sync daher auf einem Branch und merge ihn
> per PR — im Arbeitsalltag bist du beim Coden ohnehin auf einem Feature-Branch,
> dort zieht der pre-commit Hook das Memory automatisch mit.

## Bekannte Eigenheit: Pathspec-Commit

Beim selten genutzten `git commit -- <datei>` (Commit nur eines Pfads) kann
`git status` danach kurz einen Pseudo-`D`-Eintrag fürs Memory zeigen. Das ist
harmlos (die Datei ist im Commit, kein Datenverlust) — der nächste normale
Commit räumt den Zustand automatisch auf. Bei `git add` + `git commit` (Normalfall)
tritt das nicht auf.
