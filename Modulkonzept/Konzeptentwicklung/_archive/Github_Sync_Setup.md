# GitHub-Sync zwischen zwei Macs einrichten

> **Ziel:** Das gesamte ProzessPilot-Projekt (Code + Konzept-Doku) auf GitHub, sodass Claude Code auf einem zweiten Mac mit einem `git clone` den kompletten Kontext hat.

---

## Strategie

**Eine einzige Repository** unter `github.com/<dein-user>/prozesspilot` mit folgender Struktur:

```
prozesspilot/                       ← Repo-Root
├── backend/                        ← Code
├── webapp/                         ← Code
├── n8n/                            ← Workflows
├── migrations/                     ← SQL
├── infra/                          ← Runbooks, Backup, Scripts
├── docs/                           ← OpenAPI etc.
├── Konzeptentwicklung/             ← NEU: Konzept-Doku kommt hier rein
│   ├── README.md
│   ├── 00_Architektur_Hauptdokument.md
│   ├── modules/M01..M14.md
│   ├── STATUS_*.html
│   ├── Prompt_*.md
│   └── ...
├── README.md                       ← Repo-README mit Setup-Hinweis
├── .gitignore
├── docker-compose.yml
└── docker-compose.prod.yml
```

**Warum eine Repo, nicht zwei:** Claude Code in einer Session braucht beide Kontexte. Bei zwei Repos müsstest du immer beide clonen + Pfade anpassen. Eine Repo, ein Befehl, fertig.

---

## Phase 1 · Vorbereitung auf dem aktuellen Mac (10 min)

### 1.1 Konzept-Doku ins Repo integrieren

```bash
cd /Users/donandrejo/Documents/ProzessPilot

# Konzept-Doku ins Repo kopieren:
cp -r Modulkonzept/Konzeptentwicklung prozesspilot/Konzeptentwicklung

# Verifizieren:
ls prozesspilot/Konzeptentwicklung/
# → sollte README.md, 00_Architektur_Hauptdokument.md, modules/, STATUS_*.html, etc. zeigen
```

> **Wichtig:** Wir **kopieren**, nicht verschieben. Der Originalordner bleibt erhalten als Fallback. Wenn alles auf zweitem Mac läuft, kannst du den alten Modulkonzept-Ordner später löschen.

### 1.2 Sicherheits-Check: .env darf nicht ins Repo

```bash
cd /Users/donandrejo/Documents/ProzessPilot/prozesspilot

# Prüfen, ob .env aktuell getrackt wird:
git ls-files | grep -E "^\.env|/\.env"
# Output sollte LEER sein. Falls .env-Files erscheinen: STOP, manuell entfernen.

# .gitignore prüfen — diese Patterns müssen drin sein:
grep -E "^\.env|^\*\.env|^node_modules|^dist|backend/dist" .gitignore
```

Falls etwas fehlt:

```bash
cat >> .gitignore <<EOF

# Secrets
.env
.env.local
.env.*.local
.env.prod
.env.bak-*

# Build
node_modules/
backend/dist/
webapp/dist/
*.log

# OS
.DS_Store
EOF
```

### 1.3 README.md im Repo-Root mit Hinweis ergänzen

```bash
cd /Users/donandrejo/Documents/ProzessPilot/prozesspilot

# README.md öffnen und einen Hinweis-Block oben einfügen:
```

In `prozesspilot/README.md` ganz oben einfügen (nach der H1):

```markdown
> 📖 **Konzept-Doku liegt unter** [`Konzeptentwicklung/`](Konzeptentwicklung/) —
> Architektur, alle 14 Modul-Specs, Roadmap, Status-HTMLs, Prompts.
> Pflicht-Lektüre für Claude Code: [`Konzeptentwicklung/README.md`](Konzeptentwicklung/README.md).
```

### 1.4 Commit

```bash
cd /Users/donandrejo/Documents/ProzessPilot/prozesspilot
git add Konzeptentwicklung/ README.md .gitignore
git status --short | head -20    # kurz prüfen, dass keine .env mit dabei ist
git commit -m "docs: integrate concept documentation into repo for cross-machine sync

- Konzeptentwicklung/ enthält jetzt vollständige Architektur + Modul-Specs (M01–M14) + Status-HTMLs + Prompts
- README.md weist auf Konzept-Doku hin (Pflicht-Kontext für Claude Code)
- Single-repo-Setup für Sync zwischen Mac-1 und Mac-2"
```

---

## Phase 2 · GitHub-Repo anlegen (5 min)

### 2.1 Account + Repo (manuell)

1. Falls noch keinen GitHub-Account: auf [github.com](https://github.com) registrieren.
2. Rechts oben **+** → **New repository**.
3. Einstellungen:
   - **Repository name:** `prozesspilot`
   - **Description:** „Modular accounting automation platform (n8n + TypeScript + React)"
   - **Visibility:** **Private** (wichtig — enthält Architektur-Details deines Produkts)
   - **NICHT** „Initialize with README" anhaken (Repo ist lokal schon initialisiert)
   - **NICHT** .gitignore oder License hinzufügen
4. **Create repository** klicken.

Die nächste GitHub-Seite zeigt dir den Befehl, um ein bestehendes Repo zu verbinden. Den brauchst du gleich.

---

## Phase 3 · Authentifizierung — eine der drei Varianten (10 min)

Wähle **eine** Variante. Empfehlung: **A** (`gh` CLI) — am bequemsten, GitHub macht alles.

### Variante A — GitHub CLI (`gh`) — empfohlen

```bash
# Installation (einmalig):
brew install gh

# Login (öffnet Browser, fragt zwei Sachen, fertig):
gh auth login
# → GitHub.com → SSH → Yes, generate new key → Browser-Login

# Test:
gh repo list --limit 3
```

### Variante B — SSH-Key (klassisch)

```bash
# Prüfen, ob du schon einen Key hast:
ls ~/.ssh/id_ed25519.pub 2>/dev/null

# Falls nicht: neuen Key erstellen
ssh-keygen -t ed25519 -C "s.andreas-k@hotmail.de"
# → Default-Pfad bestätigen (Enter), Passphrase optional

# Public Key kopieren:
pbcopy < ~/.ssh/id_ed25519.pub

# → in GitHub: Settings → SSH and GPG keys → New SSH key → paste → Add
# Test:
ssh -T git@github.com
# → "Hi <user>! You've successfully authenticated"
```

### Variante C — HTTPS + Personal Access Token

GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new.
Scopes: `repo` (alle Sub-Scopes). Token kopieren — **wird nur einmal angezeigt**.

Beim ersten `git push` fragt Git nach User + Passwort: User = GitHub-Username, Passwort = Token.

Optional in macOS Keychain speichern:
```bash
git config --global credential.helper osxkeychain
```

---

## Phase 4 · Push (2 min)

```bash
cd /Users/donandrejo/Documents/ProzessPilot/prozesspilot

# Remote hinzufügen (URL aus der GitHub-Seite, die nach Repo-Anlage angezeigt wurde):

# Bei Variante A (gh) — gh hat das schon erledigt, falls du via gh erstellt hast.
# Bei Variante B (SSH):
git remote add origin git@github.com:<dein-user>/prozesspilot.git

# Bei Variante C (HTTPS):
git remote add origin https://github.com/<dein-user>/prozesspilot.git

# Prüfen:
git remote -v

# Push (37 Commits + neuer Konzept-Commit):
git push -u origin main
```

Beim ersten Push lädt Git ~15 MB hoch — dauert je nach Verbindung 10–60 Sekunden.

Wenn du den Repo-Tab auf GitHub neu lädst, siehst du jetzt:
- `backend/`, `webapp/`, `n8n/`, `infra/`, `migrations/`, **`Konzeptentwicklung/`**, etc.

---

## Phase 5 · Auf dem zweiten Mac einrichten (15 min)

> Dieser Block kommt auf den **anderen** Mac, nicht hier.

### 5.1 Vorbereitung

```bash
# Tools installieren (falls noch nicht):
brew install git node docker
# Docker Desktop separat aus dem Mac App Store oder docker.com installieren

# Node 20 (LTS) sicherstellen:
node --version    # → v20.x

# GitHub CLI (falls Variante A benutzt):
brew install gh
gh auth login
```

### 5.2 Repo clonen

```bash
# Ein sauberes Working-Directory:
mkdir -p ~/Documents/ProzessPilot
cd ~/Documents/ProzessPilot

# Clone:
gh repo clone <dein-user>/prozesspilot
# ODER bei SSH:
git clone git@github.com:<dein-user>/prozesspilot.git
# ODER bei HTTPS:
git clone https://github.com/<dein-user>/prozesspilot.git

cd prozesspilot
```

### 5.3 Dependencies installieren

```bash
# Backend:
cd backend
npm install
cd ..

# Webapp:
cd webapp
npm install
cd ..
```

### 5.4 `.env` übertragen — sicher, nicht via GitHub!

`.env` darf **niemals** ins Repo. Wege zur Übertragung:

**Variante 1: AirDrop** — auf altem Mac `.env` per AirDrop auf neuen Mac, in `prozesspilot/.env` ablegen.

**Variante 2: 1Password / Bitwarden** — Inhalt der `.env` als „Secure Note" speichern, auf neuem Mac öffnen und einfügen.

**Variante 3: USB-Stick / Schlüssel-AirDrop** — `.env` auf USB, einmalig kopieren.

**Variante 4: `scp` via lokales Netz**:
```bash
# Auf NEUEM Mac:
cd ~/Documents/ProzessPilot/prozesspilot
scp donandrejo@<alter-mac-name>.local:/Users/donandrejo/Documents/ProzessPilot/prozesspilot/.env ./
```

**NIEMALS** per Mail, Slack oder Cloud-Storage ohne Verschlüsselung.

### 5.5 Docker-Services starten + Migrations

```bash
cd ~/Documents/ProzessPilot/prozesspilot

# Postgres + Redis + MinIO + n8n starten:
docker compose up -d
docker compose ps    # warten, bis alle "healthy"

# Migrations auf neuer DB ausführen:
cd backend
npm run migrate

# Smoke-Test:
npm run dev    # in einem Terminal
# In zweitem Terminal:
curl http://localhost:3000/health
```

### 5.6 super_admin auf neuem Mac anlegen

```bash
cd backend
npm run bootstrap:super-admin
# Email + Passwort eingeben (am besten dieselbe Identität wie auf Mac-1)
```

### 5.7 Webapp starten

```bash
cd webapp
npm run dev    # vermutlich auf http://localhost:5173
```

Browser öffnen, Login mit den Credentials → fertig.

---

## Phase 6 · Sync-Workflow zwischen den Macs

### Auf Mac-1 (Änderungen vorgenommen):

```bash
cd ~/Documents/ProzessPilot/prozesspilot
git add -A
git commit -m "feat: ..."
git push
```

### Auf Mac-2 (Änderungen abholen):

```bash
cd ~/Documents/ProzessPilot/prozesspilot
git pull

# Falls package.json sich geändert hat:
cd backend && npm install
cd ../webapp && npm install

# Falls neue Migrations gekommen sind:
cd backend && npm run migrate
```

### Vor jedem Wechsel zwischen Macs

**Goldene Regel:** Erst pushen (Mac-1), dann pullen (Mac-2). Sonst gibt's Merge-Konflikte.

Wenn du in Claude Code arbeitest und vergisst zu pushen: hilft `git diff` auf dem zweiten Mac, schnell zu sehen, wo ihr divergiert seid.

---

## Was speziell für Claude Code wichtig ist

Auf dem zweiten Mac, in Claude Code:

1. Working Directory beim Start: `cd ~/Documents/ProzessPilot/prozesspilot`
2. Claude Code findet automatisch die Konzept-Doku unter `Konzeptentwicklung/` — keine separaten Mounts nötig.
3. Bei einer neuen Session: Claude Code sollte zuerst lesen:
   - `Konzeptentwicklung/README.md`
   - `Konzeptentwicklung/STATUS_AUDIT_2026-05-12.html`
   - `Konzeptentwicklung/05_Roadmap.md`
   - `Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md` (zuletzt aktive Arbeit)

Damit hat er denselben Kontext wie auf Mac-1.

---

## Häufige Probleme

| Symptom | Ursache | Lösung |
|---|---|---|
| `Permission denied (publickey)` beim Push | SSH-Key nicht in GitHub hinterlegt | Variante A (`gh auth login`) oder Public Key in GitHub Settings einfügen |
| `Repository not found` | falscher Repo-Pfad oder Private-Repo + fehlende Auth | URL prüfen, ggf. mit Token (Variante C) oder SSH |
| `error: src refspec main does not match any` | Repo lokal noch leer | `git log` prüfen, ggf. `git branch -m master main` |
| `.env` taucht versehentlich im Repo auf | nicht in .gitignore | `git rm --cached .env && git commit -m "fix: remove .env from git"`, dann sofort Secret-Rotation |
| Backend startet auf Mac-2 nicht | `.env` nicht übertragen oder Docker nicht gestartet | siehe Phase 5.4 + `docker compose ps` |
| Migrations laufen auf Mac-2 nicht | Postgres nicht reachable | `docker compose logs postgres` |

---

## Was NICHT in den Repo darf

- `.env`, `.env.prod`, `.env.local`, alle `.env.bak-*`
- Google Vision Service Account JSON (sollte `/secrets/` heißen — in .gitignore)
- Anthropic API Keys, Lexoffice-Tokens, sevDesk-Keys
- Datenbankdumps mit Live-Daten
- Backup-Files mit `*.bak`
- `node_modules/`, `dist/`, `backend/dist/`, `webapp/dist/`

Falls eines davon doch im Repo landet: **sofort** Secret rotieren (auf GitHub gehosteter Code wird gescannt — Bots klauen API-Keys binnen Minuten).

---

## Was als nächstes (nach erfolgreichem GitHub-Push)

1. **Auf Mac-2 testen:** clone + setup + Webapp läuft + Login geht.
2. **Konsistent benutzen:** vor jedem Mac-Wechsel pushen.
3. **Optional:** GitHub Actions als CI aktivieren — `.github/workflows/ci.yml` ist schon im Repo, läuft jetzt automatisch.
4. **Optional:** ProzessPilot-Parent-Files (AGENT_SOLO.md, prompt_terminal*.txt etc.) auch ins Repo — als `_workspace_docs/`. Aktuell außerhalb des Repos, gehen also nicht via git mit.

---

**Realistische Zeit gesamt:** 45 min, davon 15 min auf Mac-1 (Konzept einbinden + GitHub anlegen + push) und 30 min auf Mac-2 (clone + install + .env + bootstrap + Smoke-Test).
