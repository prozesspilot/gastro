---
name: auto-memory-git-sync
description: Auto-Memory liegt im Repo (.claude/memory/) + pre-commit Hook zieht es automatisch mit — Mac/Windows/Andreas/IONOS teilen EIN Memory via git
metadata:
  type: project
---

Das file-basierte Claude-Code-Memory liegt seit PR #185 (2026-06-26) **im Repo** unter `.claude/memory/`, nicht mehr im user-lokalen `~/.claude/projects/<pfad-hash>/memory/`. Gesteuert über `autoMemoryDirectory: ".claude/memory"` (relativer Pfad) in der geteilten `.claude/settings.json`.

**Warum:** Der pfad-basierte Default-Ordner unterscheidet sich zwischen Mac (`/Users/...`) und Windows (`C:\Users\...`). Ein relativer Repo-Pfad gibt allen Geräten (Steve-Mac, Steve-Windows, Andreas, IONOS) **ein** Memory, das via `git pull`/`push` synct.

**Auto-Sync-Mechanismus (PR folgt #185):** Versionierter pre-commit Hook in `.githooks/pre-commit` staged `.claude/memory/` bei **jedem** Commit automatisch mit → Memory geht ohne manuelles `git add` im Push mit raus.

**How to apply:**
- **Aktivierung pro Rechner einmalig:** `git config core.hooksPath .githooks` (auf Mac UND Windows je einmal). Prüfen: `git config --get core.hooksPath` → `.githooks`.
- **`autoMemoryDirectory` greift erst nach Session-Neustart + Workspace-Trust-Dialog.** Eine laufende Session, die vor PR #185 gestartet wurde, liest/schreibt noch den ALTEN user-lokalen Pfad → vor weiterem Memory-Schreiben Session neu starten, sonst divergieren Repo-Ordner und alter Ordner.
- **Memory immer nur auf einem Rechner gleichzeitig ändern**, sonst Merge-Konflikte in den `.md`-Dateien. Vor Geräte-Wechsel erst pushen, dann drüben pullen.
- **Nur-Memory-Sync (kein Code-Commit):** `git add .claude/memory && git commit -m "chore: Memory-Sync" && git push` — aber auf `main` scheitert der direkte Push an der Branch-Protection, also auf einem Branch machen + per PR mergen. Im Coding-Alltag bist du eh auf einem Feature-Branch, wo der Hook das Memory automatisch mitzieht.

Siehe `.githooks/README.md`. Verwandt: [[git-push-via-gh-https]] (origin = HTTPS, push/pull gehen direkt).
