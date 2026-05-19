# Manuelle Aufgaben (Steve / Andreas)

> Sammlung aller manuellen Schritte, die NICHT per Code lösbar sind und außerhalb des Repos passieren müssen.
> Letzte Aktualisierung: 2026-05-19
>
> **Format:** Jede Aufgabe hat Owner, Priorität, Status, Quelle (welche Task/PR sie ausgelöst hat).
> **Status-Werte:** ⏳ offen · 🔄 in Arbeit · ✅ erledigt · ❌ blockiert

---

## 🎯 Steve — Frontend / Sales / Externe Konten

### ⏳ Discord Developer Portal — App registrieren (T001)
- **Priorität:** P0 (Login funktioniert sonst nicht)
- **Was:** Discord-App "ProzessPilot Admin" registrieren
- **Wo:** https://discord.com/developers/applications
- **Schritte:**
  1. Neue App anlegen, Client-ID + Secret notieren
  2. OAuth2 → Redirects: `https://admin.prozesspilot.net/auth/discord/callback`
  3. Bot-Tab → Bot-Token generieren (für Guild-Membership-Check)
  4. Bot-Intents: "Server Members Intent" aktivieren
  5. Bot zu Server hinzufügen (OAuth2 URL Generator → `bot` Scope)
- **Output:** `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_ROLE_ID_GF`

### ⏳ Discord-Server "Gastro Team" einrichten (T001)
- **Priorität:** P0
- **Was:** Server mit Channel-Struktur und Rollen erstellen
- **Schritte:**
  1. Neuen Discord-Server "Gastro Team" anlegen
  2. Server-ID kopieren (für `DISCORD_GUILD_ID`)
  3. Rollen anlegen: `geschaeftsfuehrer`, `mitarbeiter`, `support`
  4. Rollen-ID von "geschaeftsfuehrer" notieren (für `DISCORD_ROLE_ID_GF`)
  5. Bot mit Server-Manage-Berechtigungen hinzufügen

### ⏳ Bootstrap-Admin lokal ausführen (T003)
- **Priorität:** P0 (ohne ersten Admin kein Login möglich)
- **Was:** Erster Geschäftsführer-Account in DB anlegen
- **Befehl:** `cd backend && npm run bootstrap-admin`
- **Eingaben:**
  - Discord-Username (optional)
  - Display-Name: "Steve Bernhardt"
  - Notfall-Email (separate Mail empfohlen, nicht Discord-Email)
  - Notfall-Passwort (≥16 Zeichen, Groß+Klein+Zahl+Sonderzeichen)
- **Output speichern:**
  - TOTP-Secret aus QR-Code → 1Password
  - 10 Backup-Codes → 1Password
- **Voraussetzung:** DB läuft (Postgres + Migrations 001-022), `PP_PGCRYPTO_KEY` in .env gesetzt

### ⏳ SumUp Developer Portal — App registrieren (T004)
- **Priorität:** P0 (Almaz nutzt SumUp Lite als Hauptkasse)
- **Was:** SumUp-App "ProzessPilot POS-Connector" registrieren
- **Wo:** https://developer.sumup.com
- **Schritte:**
  1. Developer-Account anlegen (falls noch nicht vorhanden)
  2. App "ProzessPilot POS-Connector" registrieren
  3. Redirect-URI eintragen: `https://api.prozesspilot.net/api/v1/m15/oauth/sumup/callback`
  4. Scopes konfigurieren: `transactions.history.read`, `user.profile_readonly`
  5. Client-ID + Secret notieren
- **Output:** `SUMUP_CLIENT_ID`, `SUMUP_CLIENT_SECRET`

### ⏳ Pilot-Wirt-Setup mit Almaz vorbereiten (Pilot-Strategie KW22)
- **Priorität:** P0 (Pilot-Blocker)
- **Was:** Almaz-Steuerberaterin kontaktieren, SumUp-Account einrichten, erste Belege sammeln
- **Schritte:**
  1. Steuerberaterin-Kontakt für Lexware Office Zugang sicherstellen
  2. Almaz' SumUp-Lite-Login bereit für OAuth-Flow
  3. 5-10 echte Beleg-Bilder von Almaz als Test-Daten sammeln (für T014 UI-Test)
  4. Pilot-Vertrag unterschreiben lassen

### ⏳ ProzessPilot-AGB / Datenschutzerklärung schreiben (Pilot-Strategie)
- **Priorität:** P1 (vor erstem zahlenden Kunden)
- **Was:** AGB + DSGVO-Texte für Außenkommunikation
- **Schritte:**
  1. ProzessPilot-AGB-Template anpassen (Einzelunternehmen Steve Bernhardt, Schneverdingen)
  2. Subunternehmer-Liste pflegen: Discord, SumUp, Anthropic (Claude), Google (Vision), IONOS
  3. SCC-Verträge mit US-Subunternehmern (Anthropic, Discord, Google) prüfen
  4. 30-Tage-Geld-zurück-Garantie + monatliche Kündigung dokumentieren
- **Ort:** `legal/`-Ordner im Repo

---

## 🔧 Andreas — Backend / Infrastructure / DB

### ⏳ trustProxy IONOS konfigurieren (T017)
- **Priorität:** P0 (vor Production-Cutover — sonst funktioniert IP-Rate-Limiting nicht)
- **Dependencies:** T012 (Caddy-Setup) muss laufen
- **Was:** `app.ts` mit `trustProxy: true` + spezifische IONOS-LB-IPs konfigurieren
- **Schritte:**
  1. IONOS-Loadbalancer-IPs / CIDR ermitteln
  2. `trustProxy: '10.x.x.x'` oder ähnlich setzen
  3. Caddy-Config prüfen: `X-Forwarded-For` muss korrekt geforwarded werden
  4. Smoke-Test: `req.ip` zeigt echte Client-IP

### ⏳ IONOS-Server-Setup (teilweise erledigt durch T012)
- **Priorität:** P0 (vor Pilot-Start)
- **Was:** Production-Server bereitstellen
- **Schritte:**
  - [x] IONOS-Server gemietet (87.106.8.111)
  - [x] Postgres 16 läuft als Docker-Container
  - [x] Redis 7 läuft als Docker-Container
  - [x] MinIO läuft als Docker-Container
  - [ ] **MinIO-Bucket `prozesspilot-raw` anlegen** (für Beleg-Uploads, T006) — noch offen
  - [x] Docker / docker-compose installiert
  - [x] SSH-Key von Steve hinterlegt
  - [ ] SSH-Key von Andreas hinterlegen — noch offen
  - [x] UFW / Firewall konfiguriert (22/80/443 offen)

### ⏳ GitHub-Secrets pflegen (alle Tasks mit ENV-Vars)
- **Priorität:** P0 (vor Production-Deploy)
- **Was:** Alle Production-ENV-Vars als GitHub-Secret + IONOS-Env hinterlegen
- **Wo:** `github.com/prozesspilot/gastro/settings/secrets/actions`
- **Liste (aus T001-T004):**
  - `PP_PGCRYPTO_KEY` (≥32 Zeichen Random) — **MUSS** in Production gesetzt sein (T004-B1 Production-Guard erzwingt es)
  - `JWT_SECRET` (≥32 Zeichen Random) — Pflicht in Production (M14 Spec §7)
  - `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_ROLE_ID_GF`
  - `SUMUP_CLIENT_ID`, `SUMUP_CLIENT_SECRET`
  - `WEBAPP_URL` (`https://admin.prozesspilot.net`)
  - `DATABASE_URL` mit Production-Credentials
  - `REDIS_URL`
  - `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
  - `CLAUDE_API_KEY` (für M03 OCR)
  - `GOOGLE_VISION_KEY_FILE` (für M02 OCR)

### ✅ Postgres-Migrations auf Production laufen lassen (erledigt 2026-05-19)
- **Was:** Alle Migrations 001-022 manuell via psql auf Production angewendet, schema_migrations gepflegt
- **Bonus:** `gastro_app`-Rolle angelegt (NOSUPERUSER NOBYPASSRLS NOINHERIT)
- **Hinweis:** Reguläres `npm run migrate` über Production-Image scheiterte an fehlendem `tsx`-Binary
  → Backend muss in CI vor Deploy migrieren ODER via `node dist/core/db/migrate.js` (Build-Output)

### ⏳ DB-Cleanup-Cron einrichten (T018 Backlog)
- **Priorität:** P1 (DSGVO)
- **Was:** Background-Job, der `pos_credentials` mit `active=false AND updated_at < now() - 30 days` löscht
- **Status:** Task T018 im Backlog angelegt (aus PR #29 Review)

---

## 🤝 Beide gemeinsam

### ⏳ T012-Caddy-Setup reviewen
- **Priorität:** P0
- **Wer:** Andreas reviewt Steves PR (Steve hatte T012 übernommen, weil Andreas' Branch nur Task-Move war)
- **Befehl:** `/review-pr <nr>` sobald PR offen ist
- **Branch:** `steve/T012-caddy-setup`

### ⏳ Erste Pilot-Test-Session mit Almaz
- **Priorität:** P0 (KW22-Ziel)
- **Was:** Live-Test der gesamten Pipeline
- **Schritte:**
  1. Steve: SumUp-OAuth-Flow mit Almaz durchspielen
  2. Andreas: Daily-Pull-Cron einrichten (T005)
  3. Beide: Erste Beleg-Uploads + OCR-Verifikation
  4. Erste DATEV-Übergabe an Steuerberaterin

### ⏳ Discord-Webhook für Dev-Notifications
- **Priorität:** P2 (nice-to-have für Workflow)
- **Was:** `DISCORD_DEV_WEBHOOK_URL` für Auto-Benachrichtigungen bei Task-Start/Finish/Review
- **Status:** Skill-Commands (`/start-task`, `/finish-task`, `/review-pr`) erwarten diesen Webhook, überspringen aber wenn leer
- **Schritte:** Discord-Channel #dev anlegen, Webhook generieren, URL in `.env` (lokal) eintragen

---

## 📋 Erledigt ✅

- ✅ **Repo auf GitHub angelegt** (prozesspilot/gastro) — Mai 2026
- ✅ **M01-M14 Backend-Module implementiert** — bis 2026-05-18
- ✅ **T001 Discord-OAuth-Backend** — PR #20 gemerged
- ✅ **T002 Notfall-Login** — PR #22 gemerged
- ✅ **T011 Postgres-Foundation + RLS** — PR #19 gemerged
- ✅ **T013 Mitarbeiter-Webapp Login-Screen** — PR #24 gemerged
- ✅ **T003 Bootstrap-Admin-Skript** — PR #27 gemerged
- ✅ **T004 SumUp OAuth-Flow + Token-Storage** — PR #29 gemerged
- ✅ **T006 Beleg-Upload-Endpoint** — PR #34 gemerged
- ✅ **T014 Webapp Beleg-Upload** — PR #36 gemerged
- ✅ **T012 Caddy-Setup + Production-Stack** — manuell durch Steve abgeschlossen, PR in Arbeit
  - 4 Subdomains live mit Let's Encrypt-TLS
  - Production-Stack hochgefahren (Postgres, Redis, MinIO, Backend, Webapp)
  - DB-Migrations 001-022 angewendet, `gastro_app`-Rolle gehärtet

---

## 📝 Wie diese Liste pflegen

- **Nach jedem Task-Merge:** Manuelle Aufgaben aus PR-Beschreibung extrahieren und hier ergänzen
- **Nach Erledigung:** Status auf ✅ setzen + Datum eintragen + in "Erledigt" verschieben
- **Bei Blocker:** Status auf ❌ setzen + Grund in Notiz
- **Pflicht-Felder:** Owner, Priorität, Was, Schritte
- **Nice-to-have:** Output (welche ENV-Vars/Daten dabei rauskommen), Dependencies
