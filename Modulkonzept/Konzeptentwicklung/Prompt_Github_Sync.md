# Prompt: GitHub-Sync autonom einrichten

> **So nutzt du das:**
> 1. **Eine kleine Vorbereitung manuell** (siehe unten — 2 Minuten, einmalig)
> 2. **Neue** Claude-Code-Session im Repo-Root: `/Users/donandrejo/Documents/ProzessPilot/prozesspilot/`
> 3. Modell: **Opus 4.6** oder **Sonnet 4.6** (für diese Aufgabe reicht Sonnet)
> 4. Block zwischen `===== PROMPT START =====` und `===== PROMPT ENDE =====` kopieren und senden

---

## Vorbereitung manuell (einmalig, ~2 Minuten)

Diese 2 Schritte muss der User selbst machen — das ist Browser-Auth, das kann Claude Code nicht:

**Schritt M1 — GitHub CLI installieren + einloggen:**

In einem Terminal:

```bash
brew install gh
gh auth login
```

Bei `gh auth login` durchklicken:
- **GitHub.com** auswählen
- **HTTPS** (einfacher als SSH für den Anfang)
- **Yes**, authenticate with credentials
- **Login with a web browser** wählen
- Browser öffnet sich, einloggen, Code bestätigen
- Fertig.

Nach Erfolg sollte `gh auth status` zeigen:
```
✓ Logged in to github.com account <dein-user>
```

**Schritt M2 — Sicherstellen, dass `.env` nicht im Repo ist:**

```bash
cd /Users/donandrejo/Documents/ProzessPilot/prozesspilot
git ls-files | grep -E "^\.env$|/\.env$"
# Output muss LEER sein.
```

Wenn das LEER ist, alles bereit. Dann den Prompt unten an Claude Code.

---

## Der eigentliche Prompt

```
===== PROMPT START =====

ROLLE
Du bist DevOps Engineer im Projekt ProzessPilot. Heute richtest du den GitHub-Sync ein: Konzept-Doku ins Repo integrieren, GitHub-Repo erstellen, alles pushen. Autonom — keine Fragen.

ZIEL
Am Ende dieses Laufs:
1. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/Konzeptentwicklung/ existiert (Kopie des Modulkonzept-Inhalts)
2. GitHub-Repo "prozesspilot" (privat) existiert
3. Code + Konzept-Doku sind dort gepusht (main-Branch)
4. README im Repo-Root erklärt, wo die Doku liegt
5. Auf zweitem Mac reicht: gh repo clone <user>/prozesspilot

PFLICHT-PRECHECK (in Phase 0)
- gh CLI installiert?    (gh --version)
- gh authentifiziert?    (gh auth status)
- Repo-Root korrekt?     (git rev-parse --show-toplevel sollte /Users/donandrejo/Documents/ProzessPilot/prozesspilot ausgeben)
- .env nicht in git?     (git ls-files | grep -E "^\.env$" → muss leer sein)
- Konzept-Doku da?       (ls /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/)
Wenn EINER der Checks fehlschlägt: STOP, klaren Fehlerbericht + welche manuelle Aktion nötig. Phase 1+ nicht starten.

AUTONOMOUS_MODE: ON
- Bei jedem Schritt: 1 Zeile Status-Log ("✓ Schritt X: …" oder "✗ Schritt X: <Grund>").
- Keine Rückfragen, keine Bestätigungen.
- Bei Fehler in einem Schritt: in den Bericht aufnehmen, nächsten Schritt versuchen (wenn unabhängig).
- KEIN git push --force, KEIN .env stagen, KEIN rm -rf außerhalb dist/node_modules.

═══════════════════════════════════════════════════════════════════════
PHASE 0 — PRECHECK
═══════════════════════════════════════════════════════════════════════

Führe die 5 Precheck-Checks aus. Ausgabe:
  ✓ gh installiert: <Version>
  ✓ gh auth: <user>
  ✓ Repo-Root: …/prozesspilot
  ✓ .env nicht in git
  ✓ Konzept-Doku: <n Files>

Wenn alle ✓: weiter zu Phase 1.
Wenn einer ✗: STOP mit Fix-Anweisung.

═══════════════════════════════════════════════════════════════════════
PHASE 1 — KONZEPT-DOKU INS REPO INTEGRIEREN (3 min)
═══════════════════════════════════════════════════════════════════════

1.1 Konzept-Doku kopieren:
  cp -r /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung \
        /Users/donandrejo/Documents/ProzessPilot/prozesspilot/Konzeptentwicklung
  Verify: ls prozesspilot/Konzeptentwicklung/README.md  → existiert

1.2 .gitignore prüfen + ergänzen:
  Folgende Patterns müssen drin sein (jeweils prüfen, ergänzen wenn fehlt):
    .env
    .env.local
    .env.*.local
    .env.prod
    .env.bak-*
    node_modules/
    backend/dist/
    webapp/dist/
    *.log
    .DS_Store
  Falls Änderungen: git status .gitignore zeigen.

1.3 README.md im Repo-Root prüfen/ergänzen:
  Falls README.md noch keinen Hinweis auf Konzeptentwicklung/ hat: nach der ersten H1 einfügen:
  ```
  > 📖 **Konzept-Doku:** [`Konzeptentwicklung/`](Konzeptentwicklung/) — Architektur, Modul-Specs M01–M14, Roadmap, Status-HTMLs, Prompts. Pflicht-Kontext für Claude Code: [`Konzeptentwicklung/README.md`](Konzeptentwicklung/README.md).
  ```
  Falls README.md bereits einen ähnlichen Hinweis hat: skip.

1.4 Final-Check vor Commit — keine Secrets dabei:
  cd prozesspilot
  git add Konzeptentwicklung/ README.md .gitignore
  git diff --cached --name-only | grep -E "\.env"  → MUSS LEER sein!
  Wenn nicht leer: STOP, nicht committen.

1.5 Commit:
  git commit -m "docs: integrate concept documentation into repo for cross-machine sync

- Konzeptentwicklung/ vollständig im Repo (Architektur + Modul-Specs M01–M14 + Status-HTMLs + Prompts)
- README.md verweist auf Konzept-Doku als Pflicht-Kontext für Claude Code
- Single-repo-Setup ermöglicht 'gh repo clone' auf zweitem Mac als One-Liner"

Status-Log: "Phase 1 abgeschlossen: Konzept-Doku integriert, 1 Commit (sha=<sha>)".

═══════════════════════════════════════════════════════════════════════
PHASE 2 — GITHUB-REPO ANLEGEN (2 min)
═══════════════════════════════════════════════════════════════════════

2.1 GitHub-Username ermitteln:
  USER=$(gh api user --jq .login)
  Speichern für Folge-Schritte.

2.2 Prüfen, ob Repo schon existiert:
  gh repo view ${USER}/prozesspilot 2>/dev/null
  Falls existiert: SKIPPE 2.3, gehe direkt zu Phase 3 mit Hinweis im Log.

2.3 Privates Repo anlegen:
  gh repo create ${USER}/prozesspilot \
    --private \
    --description "Modular accounting automation platform (n8n + TypeScript + React + Postgres)" \
    --source=. \
    --remote=origin \
    --push=false
  Damit ist remote 'origin' gesetzt UND das Repo ist auf GitHub angelegt.

Status-Log: "Phase 2 abgeschlossen: github.com/${USER}/prozesspilot (privat) erstellt".

═══════════════════════════════════════════════════════════════════════
PHASE 3 — PUSH (1–2 min, je nach Verbindung)
═══════════════════════════════════════════════════════════════════════

3.1 Remote prüfen:
  git remote -v
  Muss "origin git@github.com:…" oder "origin https://github.com/…" zeigen.

3.2 Push:
  git push -u origin main

3.3 Verifizieren:
  Branch geprüft: git rev-parse --abbrev-ref HEAD  → "main"
  Remote-Push: git log origin/main..HEAD  → leer (= alles gepusht)
  Optional: gh repo view ${USER}/prozesspilot --json defaultBranchRef --jq .defaultBranchRef.name → "main"

Status-Log: "Phase 3 abgeschlossen: Push erfolgreich, n Commits auf origin/main".

═══════════════════════════════════════════════════════════════════════
PHASE 4 — VERIFIKATION + ABSCHLUSS-BERICHT
═══════════════════════════════════════════════════════════════════════

4.1 Aus dem Repo via API prüfen:
  gh repo view ${USER}/prozesspilot --json name,visibility,defaultBranchRef,diskUsage,pushedAt,url

4.2 Repo-Übersicht zeigen:
  Repo-URL: https://github.com/${USER}/prozesspilot
  Sichtbarkeit: private
  Default-Branch: main
  Anzahl Commits gepusht: gh api /repos/${USER}/prozesspilot/commits --jq '. | length'

4.3 Abschluss-Bericht im Chat (NICHT als HTML — kurzer Klartext):

  ✓ GitHub-Sync eingerichtet

  Repo:        https://github.com/${USER}/prozesspilot  (privat)
  Branch:      main
  Commits:     <n> committed, <n> gepusht
  Größe:       <MB>

  Konzept-Doku enthalten unter: Konzeptentwicklung/
  Code unter: backend/, webapp/, n8n/, migrations/, infra/

  Was als Nächstes auf zweitem Mac:
    brew install gh node docker
    gh auth login
    mkdir -p ~/Documents/ProzessPilot && cd ~/Documents/ProzessPilot
    gh repo clone ${USER}/prozesspilot
    cd prozesspilot
    cd backend && npm install
    cd ../webapp && npm install
    # .env separat von Mac-1 übertragen (AirDrop / 1Password) — NICHT via GitHub
    docker compose up -d
    cd backend && npm run migrate && npm run bootstrap:super-admin

  ENDE.

═══════════════════════════════════════════════════════════════════════
WENN ETWAS SCHIEFGEHT
═══════════════════════════════════════════════════════════════════════
- Bei "Permission denied" auf gh: User soll gh auth login erneut laufen lassen.
- Bei "Repository not found" nach repo create: 30 Sekunden warten, dann Push erneut.
- Bei großem Push-Fehler ("file too large >100MB"): Datei finden mit
  git rev-list --objects --all | git cat-file --batch-check='%(objectsize) %(rest)' | sort -nr | head
  In .gitignore eintragen, git rm --cached <file>, neu committen, push.
- KEIN git push --force.
- KEIN git reset --hard.

LOS — starte sofort mit Phase 0.

===== PROMPT ENDE =====
```

---

## Was Claude Code danach für dich erledigt hat

- Konzept-Doku (Modulkonzept/Konzeptentwicklung) ist als `prozesspilot/Konzeptentwicklung/` ins Repo kopiert
- `.gitignore` ist sicher (kein `.env`-Leak möglich)
- README.md verweist auf die Konzept-Doku
- 1 sauberer Commit „docs: integrate concept documentation"
- Privates Repo `github.com/<user>/prozesspilot` ist erstellt
- Alle Commits sind gepusht

## Was du danach machst

Auf dem **zweiten Mac** der 5-Zeilen-Block aus dem Abschluss-Bericht:

```bash
brew install gh node docker
gh auth login
mkdir -p ~/Documents/ProzessPilot && cd ~/Documents/ProzessPilot
gh repo clone <dein-user>/prozesspilot
cd prozesspilot
cd backend && npm install
cd ../webapp && npm install
# .env von Mac-1 separat übertragen (AirDrop / 1Password / scp)
docker compose up -d
cd backend && npm run migrate && npm run bootstrap:super-admin
```

Dann hat dein zweiter Mac den vollen Stand inklusive Konzept-Doku, und Claude Code kann dort mit identischem Kontext arbeiten.

---

## Wenn du den `gh`-Login NICHT machen willst

Wenn du keinen GitHub-Account hast oder `gh` nicht installieren willst: dann ist der Prompt nicht autonom durchführbar, weil GitHub-Auth zwingend ein Browser-Login erfordert. Alternative: Phase 1 läuft trotzdem (Konzept-Doku ins Repo + Commit), aber Phase 2+3 musst du manuell machen via HTTPS + Personal Access Token. Siehe [Github_Sync_Setup.md](Github_Sync_Setup.md) Variante C.

**Realistische Gesamt-Zeit:** Vorbereitung 2 min + Prompt-Lauf 5 min = **~7 Minuten bis dein Repo auf GitHub liegt**.
