# Manuelle Aufgaben (Steve / Andreas)

> Sammlung aller manuellen Schritte, die NICHT per Code lösbar sind und außerhalb des Repos passieren müssen.
> Letzte Aktualisierung: 2026-06-13
>
> **Format:** Jede Aufgabe hat Owner, Priorität, Status, Quelle (welche Task/PR sie ausgelöst hat).
> **Status-Werte:** ⏳ offen · 🔄 in Arbeit · ✅ erledigt · ❌ blockiert

---

## 🎯 Steve — Frontend / Sales / Externe Konten

### ✅ SETUP_BASE_URL in .env.prod gesetzt (T017, erledigt 2026-06-18)
- **Was:** Backend baut die Magic-Link-URL der Wizard-Einladungs-Mail aus `SETUP_BASE_URL`. In Prod gesetzt auf `https://setup.prozesspilot.net`.
- **Durchgeführt:** `.env.prod` um `SETUP_BASE_URL=https://setup.prozesspilot.net` ergänzt (Backup `.env.prod.bak-T017`) + `docker compose up -d --force-recreate backend`. Verifiziert: `printenv SETUP_BASE_URL` im Container korrekt, api/health + api/ready = 200.

### ⏳ CHAT_BASE_URL in .env.prod setzen (T068)
- **Priorität:** P2 (erst nötig, wenn echte Chat-Links rausgehen — abhängig von T072 Widget-Deploy)
- **Was:** Backend baut die Chat-Magic-Link-URL der Einladungs-/Alarm-Mail aus `CHAT_BASE_URL` (analog `SETUP_BASE_URL`). Ohne Prod-Wert landet `http://localhost:5175` in der Mail.
- **Schritte:**
  1. `.env.prod` um `CHAT_BASE_URL=https://chat.prozesspilot.net` ergänzen (Backup wie bei T017)
  2. `docker compose -f docker-compose.prod.yml up -d --force-recreate backend` (Memory: `--force-recreate` Pflicht)
  3. Verifizieren: `printenv CHAT_BASE_URL` im Backend-Container korrekt
- **Output:** `CHAT_BASE_URL=https://chat.prozesspilot.net`
- **Dependencies:** T072 (chat.prozesspilot.net muss als echte Widget-App live sein, sonst zeigt der Link auf den Healthcheck-Stub)

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

### ✅ Bootstrap-Admin gegen Production-DB ausgeführt (2026-05-19)
- **Was:** Erster Geschäftsführer-Account in Production-DB angelegt
- **User:** Steve Bernhardt, role `geschaeftsfuehrer`, Notfall-Email `bernhardt@prozesspilot.net`
- **Verfahren:** SSH-Tunnel zu Postgres-Container-IP, `npx tsx scripts/bootstrap-admin.ts` lokal
- **Verifiziert:**
  - `users`-Tabelle: 1 Eintrag ✅
  - `auth_audit_log`: `bootstrap_admin_created` event geloggt ✅
  - Notfall-Login-Endpoint: HTTP 401 bei falschem PW (kein 500) ✅
- **In 1Password gespeichert:** TOTP-Secret + 10 Backup-Codes (durch Steve)
- **Offen:** Discord-OAuth-Connect (separater Flow nach erstem Login)

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

### ⏳ Pilot-Smoke-Test gegen Staging/Prod fahren (T050 — F4-Tor)
- **Priorität:** P0 (Pilot-Finish F4 — das eigentliche Qualitäts-Tor)
- **Was:** Einen echten, PII-freien Beleg per `scripts/qa-smoke.sh` komplett durch die Pipeline laufen lassen, bis er in Lexware Office landet. Beweist, dass der belege-Pfad **live** funktioniert (inkl. OCR-Worker, KI-Kategorisierung, Lexware-Export).
- **Voraussetzung:** Instanz läuft + Lexware-Token (T009) + Vision-Credentials (T007) gesetzt; Geschäftsführer-Account (Bootstrap ✅) mit TOTP zur Hand.
- **Schritte:**
  1. TOTP-Code aus 1Password/Authenticator bereithalten (läuft nach 30 s ab).
  2. Aufruf (Anleitung: `scripts/qa-smoke.README.md`):
     ```bash
     BASE_URL=https://api.prozesspilot.net \
     PP_SMOKE_TENANT_ID=<almaz-tenant-uuid> \
     PP_SMOKE_EMAIL=bernhardt@prozesspilot.net \
     PP_SMOKE_PASSWORD='***' \
     PP_SMOKE_TOTP=<6-stellig> \
     ./scripts/qa-smoke.sh
     ```
  3. Erwartung: Exit 0 + „SMOKE ERFOLGREICH — echter Beleg bis Lexware Office". Danach in Lexware Office prüfen, dass der Beleg im Posteingang liegt.
  4. Bei Bedarf einen realistischen (aber PII-freien) Beleg via `PP_SMOKE_FILE` statt der Default-Fixture verwenden.
- **Output:** Bestätigter End-to-End-Durchlauf = F4 abgehakt. Ergebnis kurz im Pilot-Channel dokumentieren.

### ⏳ Kontenrahmen der Pilot-Steuerberaterin klären: SKR03 oder SKR04? (T052)
- **Priorität:** P1 (vor dem ersten echten Lexware-Export — bestimmt, welche Konten gebucht werden)
- **Was:** Bei der Lexware-Office-Steuerberaterin erfragen, welchen **Kontenrahmen** sie für den Pilot-Wirt (Almaz) führt: **SKR03** oder **SKR04**. T052 hat angezeigtes == gebuchtes SKR-Konto strukturell sichergestellt; der Kontenrahmen ist jetzt *ein* zentraler Schalter (`PILOT_SKR_CHART` in `backend/src/modules/m03-categorization/system-categories.ts`), aktuell auf **SKR03** (Status quo).
- **Schritte:**
  1. Steuerberaterin fragen: SKR03 oder SKR04? (Gleicher Kontakt wie beim Lexware-Token, T009.)
  2. Falls **SKR04**: kurze Folge-Task — `PILOT_SKR_CHART` auf `'SKR04'` setzen.
  3. Dabei mit ihr die 2 fachlichen SKR04-Werte bestätigen: Bewirtung (70%-abziehbar `6640` vs. `6644`) und `wareneinkauf_food` (`5100` vs. `5400`) in `system-categories.ts`.
- **Output:** Bestätigter Kontenrahmen → Folge-Task (Code-seitig 1 Zeile + ggf. 2 Werte). Bis dahin läuft der Pilot konsistent auf SKR03.
- **Dependencies:** Lexware-Office-Token von Steuerberaterin (T009)

### ⏳ ProzessPilot-AGB / Datenschutzerklärung schreiben (Pilot-Strategie)
- **Priorität:** P1 (vor erstem zahlenden Kunden)
- **Was:** AGB + DSGVO-Texte für Außenkommunikation
- **Schritte:**
  1. ProzessPilot-AGB-Template anpassen (Einzelunternehmen Steve Bernhardt, Schneverdingen)
  2. Subunternehmer-Liste pflegen: Discord, SumUp, Anthropic (Claude), Google (Vision), IONOS
  3. SCC-Verträge mit US-Subunternehmern (Anthropic, Discord, Google) prüfen
  4. 30-Tage-Geld-zurück-Garantie + monatliche Kündigung dokumentieren
- **Ort:** `legal/`-Ordner im Repo

### ⏳ Steuerberater-Mail pro Pilot-Mandant hinterlegen (T089)
- **Priorität:** P1 (ohne die Adresse liefert die Übergabe-Route 422 — kein Versand)
- **Was:** Die E-Mail-Adresse der Steuerberaterin in der Spalte `tenants.advisor_email` des Pilot-Mandanten setzen, damit die Monats-Übergabe-Mail (`POST /api/v1/reports/:id/deliver`) einen Empfänger hat.
- **Schritte:**
  1. Mail-Adresse der Steuerberaterin erfragen (gleicher Kontakt wie Lexware-Token T009 / SKR-Frage).
  2. In der Mitarbeiter-Webapp am Mandanten als Stammdatum eintragen — **oder** bis das UI-Feld existiert per DB: `UPDATE tenants SET advisor_email = '<mail>' WHERE id = '<pilot-tenant-id>';`.
  3. Voraussetzung für echten Versand zusätzlich: SMTP konfiguriert (eigener Eintrag „SMTP-Account"). Ohne SMTP läuft die Übergabe im Dry-Run (Status `sent`, keine echte Mail).
- **Output:** Befüllte `advisor_email` → Übergabe-Mail an Steuerberaterin möglich.
- **Dependencies:** SMTP-Account (T010-Eintrag), Migration 129 (läuft beim Deploy automatisch).

---

## 🔧 Andreas — Backend / Infrastructure / DB

### ⏳ MinIO-Root-Passwort rotieren (P0-Sicherheit, vor erstem echten Beleg)
- **Priorität:** P0 (Secret-Leak — Pilot-Sicherheit/Compliance)
- **Herkunft:** Audit 2026-06-05 (L8) — MinIO-Root-Passwort am 02.06. kurz in Mac-Scrollback + Chat-Log geleakt (Server-History sauber, Bucket leer). Prod nutzt `${PP_S3_SECRET_KEY:-minioadmin}` als Default in `docker-compose.prod.yml`.
- **Was:** `MINIO_ROOT_PASSWORD` / `PP_S3_SECRET_KEY` in `.env.prod` auf einen neuen, starken Wert setzen und MinIO neu aufsetzen.
- **Schritte:**
  1. Neues Secret generieren (z. B. `openssl rand -base64 32`), in 1Password ablegen.
  2. In `/opt/gastro/.env.prod` auf dem Server `PP_S3_SECRET_KEY=<neu>` setzen (kein `minioadmin`-Default mehr).
  3. **Wichtig:** `.env.prod`-Änderungen greifen NUR via `docker compose up -d --force-recreate` — **nicht** `restart` (siehe Memory `prod-env-change-recreate`).
  4. Verifizieren, dass Backend + MinIO mit dem neuen Key verbinden (Upload-Smoke-Test).
- **Output:** rotiertes `PP_S3_SECRET_KEY` in `.env.prod` + 1Password; kein Default-Passwort mehr aktiv.

### ⏳ JWT_SECRET + Discord-Bot-Token rotieren (P0/P1-Sicherheit)
- **Priorität:** P1 (lokale `.env` enthält Klartext-Secrets — nie committet, aber rotieren)
- **Herkunft:** Audit 2026-06-05 (L8) — lokale `.env` enthält Klartext `JWT_SECRET`, Discord-Client-Secret, **Bot-Token**, Dev-Log-Webhook.
- **Was:** `JWT_SECRET` (≥ 32 Zeichen, Prod erzwingt das) und das Discord-Bot-Token neu erzeugen.
- **Schritte:**
  1. Neues `JWT_SECRET` generieren (`openssl rand -base64 48`), in `.env.prod` + 1Password setzen — **invalidiert alle aktiven Sessions** (Re-Login nötig).
  2. Discord-Bot-Token im Developer-Portal regenerieren, alten widerrufen, neuen in `.env.prod` + 1Password.
  3. Prod via `docker compose up -d --force-recreate` neu aufsetzen.
  4. Notfall-Login (Email + TOTP) testen, danach Discord-OAuth.
- **Output:** rotiertes `JWT_SECRET` + Discord-Bot-Token; alte Werte widerrufen.

### ⏳ TRUST_PROXY ENV-Variable in Production setzen (T017)
- **Priorität:** P0 (vor Production-Cutover — sonst funktioniert IP-Rate-Limiting nicht und ist als DoS-Vektor ausnutzbar)
- **Dependencies:** T012 (Caddy-Setup) ✅ erledigt
- **Was:** ENV-Variable `TRUST_PROXY` setzen, damit Fastify `X-Forwarded-For` korrekt verarbeitet
- **Schritte:**
  1. **Für unser aktuelles Setup** (Caddy auf gleichem Host wie Backend-Container, kein externer LB):
     - `TRUST_PROXY=loopback` (vertraut nur `127.0.0.1` + `::1` — die Caddy-IP)
     - Das ist die **empfohlene Primär-Wahl** — minimaler Trust-Scope, kein Spoofing-Risiko
  2. **Wenn später ein echter externer IONOS-Loadbalancer dazukommt:**
     - `TRUST_PROXY=10.0.0.0/8` (IONOS-internes Netz)
     - oder Komma-Liste `TRUST_PROXY=loopback, 10.0.0.0/8`
     - **NIEMALS** `TRUST_PROXY=true` in Production — das vertraut allen Proxies inkl. gefälschter `X-Forwarded-For`-Header → Spoofing-Vektor!
  3. In `.env.prod` auf Server setzen:
     ```bash
     ssh root@87.106.8.111
     echo 'TRUST_PROXY=loopback' >> /opt/gastro/.env.prod
     # Backend neu starten:
     cd /opt/gastro && docker compose -f docker-compose.prod.yml restart backend
     ```
  4. Smoke-Test nach Deploy: `curl https://api.prozesspilot.net/api/v1/health` mit `X-Forwarded-For: 1.2.3.4` → Logs müssen `1.2.3.4` als `req.ip` zeigen
- **Output:** `TRUST_PROXY` env-var auf Production-Server gesetzt
- **Hinweis:** Backend **crashed** beim Start in Production wenn `TRUST_PROXY` leer ist (Hard-Fail-Guard). Diese harte Linie ist absichtlich: Geschäftsführer-Notfall-Login wäre sonst aussperrbar.

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
  - `CLAUDE_API_KEY` (M03 KI-Kategorisierung, T048 — **ohne Key landet jeder Beleg in `requires_review` statt automatisch kategorisiert zu werden**)
  - `GOOGLE_VISION_KEY_FILE` (M01 OCR via Google Vision; EU-Region ist per `VISION_API_ENDPOINT`-Default `eu-vision.googleapis.com` erzwungen, T046 — nicht überschreiben)

### ✅ Postgres-Migrations auf Production laufen lassen (erledigt 2026-05-19)
- **Was:** Alle Migrations 001-022 manuell via psql auf Production angewendet, schema_migrations gepflegt
- **Bonus:** `gastro_app`-Rolle angelegt (NOSUPERUSER NOBYPASSRLS NOINHERIT)
- **Hinweis:** Reguläres `npm run migrate` über Production-Image scheiterte an fehlendem `tsx`-Binary
  → Backend muss in CI vor Deploy migrieren ODER via `node dist/core/db/migrate.js` (Build-Output)

### ⏳ POS-Credentials-Cleanup-Cron einrichten (T018)
- **Priorität:** P1 (DSGVO)
- **Was:** Daily-Cron, der inaktive `pos_credentials` (active=false) nach 30 Tagen Hard-Delete + Audit-Log
- **Status:** Code implementiert (T018, PR offen). Setup auf IONOS noch erforderlich.
- **Setup (systemd-Timer):**
  ```bash
  ssh root@87.106.8.111
  cat > /etc/systemd/system/gastro-pos-cleanup.service <<'EOF'
  [Unit]
  Description=Gastro POS-Credentials DSGVO-Cleanup
  After=docker.service

  [Service]
  Type=oneshot
  WorkingDirectory=/opt/gastro
  ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml exec -T backend node dist/cron/pos-credentials-cleanup.js
  EOF

  cat > /etc/systemd/system/gastro-pos-cleanup.timer <<'EOF'
  [Unit]
  Description=Daily POS-Credentials-Cleanup 04:30 UTC

  [Timer]
  OnCalendar=*-*-* 04:30:00 UTC
  Persistent=true

  [Install]
  WantedBy=timers.target
  EOF

  systemctl daemon-reload
  systemctl enable --now gastro-pos-cleanup.timer
  ```
- **Smoke-Test:** `docker compose -f docker-compose.prod.yml exec backend node dist/cron/pos-credentials-cleanup.js` → Exit 0 + Logs zeigen Anzahl
- **Optional:** ENV `POS_CREDENTIALS_RETENTION_DAYS` (default 30) anpassen falls juristisch notwendig
- **DSGVO-Doku:** Aufbewahrungsfrist von 30 Tagen fuer OAuth-Tokens nach Deaktivierung. Tokens fallen NICHT unter 10-Jahres-Pflicht (§ 147 AO), weil sie keine Geschaeftsdaten sind. Begruendung: nur Zugriffs-Credentials, keine Steuer-/Buchungs-Belege.

### ✅ Migration 090 — Soft-Delete für Belege (T015)
- **Status:** Wird automatisch durch Auto-Deploy-Pipeline angewendet (`migrate:prod` in `deploy-staging.yml`, seit T012)
- **Was:** `belege` bekommt `deleted_at TIMESTAMPTZ` für Soft-Delete (GoBD-konform)
- **Verifikation:** `SELECT version FROM schema_migrations WHERE version = '090'` auf Production-DB
- **Rollback:** `090_belege_soft_delete_rollback.sql` griffbereit (entfernt Spalte + Partial-Index)
- **Hinweis:** NICHT manuell via psql ausführen — dann läuft sie nochmal automatisch und gibt schema_migrations-Duplikat-Error.

### ⏳ SumUp Daily-Sync-Cron einrichten (T005)
- **Priorität:** P1 (manueller Sync ist via UI moeglich, Cron automatisiert)
- **Dependencies:** T004 SumUp-OAuth muss durchlaufen sein (pos_credentials mit aktivem Token)
- **Was:** Daily-Cron taeglich 03:00 UTC, der `node dist/cron/sumup-daily.js` ausfuehrt
- **Variante A (empfohlen, IONOS-systemd-Timer):**
  ```bash
  ssh root@87.106.8.111
  cat > /etc/systemd/system/gastro-sumup-sync.service <<'EOF'
  [Unit]
  Description=Gastro SumUp Daily-Sync
  After=docker.service

  [Service]
  Type=oneshot
  WorkingDirectory=/opt/gastro
  ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml exec -T backend node dist/cron/sumup-daily.js
  EOF

  cat > /etc/systemd/system/gastro-sumup-sync.timer <<'EOF'
  [Unit]
  Description=Daily SumUp-Sync 03:00 UTC

  [Timer]
  OnCalendar=*-*-* 03:00:00 UTC
  Persistent=true

  [Install]
  WantedBy=timers.target
  EOF

  systemctl daemon-reload
  systemctl enable --now gastro-sumup-sync.timer
  systemctl list-timers gastro-sumup-sync   # zeigt Next-Run
  ```
- **Variante B (n8n-Workflow):** WF-CRON-DAILY-POS-PULL ruft `POST /api/v1/m15/sumup/sync` mit Body `{ date: "<gestern>" }` pro Tenant auf. Geht auch, aber duplicat: das Backend-Script kennt alle Tenants schon.
- **Smoke-Test:** `docker compose -f docker-compose.prod.yml exec backend node dist/cron/sumup-daily.js` → Exit-Code 0 + Logs zeigen Anzahl gepullter Transaktionen
- **Monitoring:** Bei Fehler verschickt der Service einen Discord-Alert via `DISCORD_OPS_WEBHOOK_URL` (siehe T017). Optional: `systemctl status gastro-sumup-sync` zeigt Last-Run-Result.

### ⏳ Migration 110 in Production laufen lassen (T005)
- **Priorität:** P0 (Sync schlaegt sonst beim ersten INSERT fehl)
- **Was:** Macht `kasse_transactions.integration_id` nullable (T005 nutzt pos_credentials, nicht kasse_integrations)
- **Schritte:**
  1. Backup ziehen (`pg_dump`)
  2. SQL via psql: `\i /opt/gastro/migrations/110_kasse_transactions_fk_relax.sql`
  3. Verifizieren: `\d kasse_transactions` zeigt `integration_id uuid` (kein NOT NULL)
  4. `INSERT INTO schema_migrations(filename) VALUES ('110_kasse_transactions_fk_relax.sql')`
- **Rollback:** `110_kasse_transactions_fk_relax_rollback.sql` (failt wenn schon Rows mit integration_id=NULL existieren)

### ⏳ Lexware-Office API-Token von Steuerberaterin besorgen (T009)
- **Priorität:** P0 (ohne Token kein Export — Pilot-Blocker)
- **Was:** Steuerberaterin von Almaz kontaktieren, Lexware-Office-API-Token (Public-API-Schluessel) anfordern, in DB hinterlegen
- **Schritte:**
  1. Steuerberaterin per Mail/Anruf: „Wir brauchen einen Lexware-Office-API-Token, um Almaz' Belege automatisch in deinen Posteingang zu schieben."
  2. Token unter https://app.lexoffice.de → Einstellungen → Öffentliche API erzeugen lassen
  3. Token sicher uebergeben (1Password Share, NIEMALS per Mail-Klartext)
  4. Token via Bootstrap-Script ablegen — **WICHTIG: nicht via `node -e` mit
     Token in der Command-Line!** Der Token wuerde sonst in Shell-History,
     docker-exec-Audit-Log und syslog landen.
     Stattdessen das interaktive Script aus T009-Review-Fix nutzen:
     ```bash
     ssh root@87.106.8.111
     cd /opt/gastro
     # Interaktiver Prompt — Token-Eingabe ist echo-muted (kein History-Leak)
     docker compose -f docker-compose.prod.yml exec backend \
       node dist/scripts/bootstrap-lexware-token.js
     ```
     Das Script fragt nacheinander ab:
     - Tenant-UUID (Almaz)
     - Mitarbeiter-User-UUID (wer setzt den Token ein — fuer Audit-Log)
     - Display-Name (z.B. "Steuerkanzlei Mustermann")
     - Lexware-API-Token (Eingabe wird mit `*` maskiert)
     Bei Erfolg: `booking_credentials`-Row + Audit-Log-Event geschrieben.
  5. Smoke-Test: `curl -X POST https://api.prozesspilot.net/api/v1/belege/<beleg-id>/exports/lexware -H "Cookie: pp_auth=..." -H "X-PP-Tenant-ID: ..."`
- **Output:** `booking_credentials`-Row mit `provider='lexware_office'`, `active=true`
- **Dependencies:** Migration 100 muss vorher gelaufen sein.

### ⏳ Lexware-Kategorie-Mapping gegen echten Pilot-Account verifizieren (T054)
- **Priorität:** P1 (vor dem ersten echten Export — falsches categoryId = falsche Buchung)
- **Was:** T054 löst SKR-Konto → Lexware-`categoryId` über eine Namens-Heuristik gegen die
  echten Kategorien des Tenants auf (Default-Mapping im Code, Needles auf die Lexware-Standard-
  namen gegründet). Die öffentliche API-Doku enumeriert die Kategorienamen nicht vollständig →
  die Zuordnung der 14 Kategorien muss einmal gegen den **echten** Lexware-Account von Almaz'
  Steuerberaterin geprüft werden.
- **Schritte:**
  1. Nach dem ersten Export-Lauf die Tabelle prüfen: `SELECT skr_account, category_name, source
     FROM lexoffice_category_map WHERE customer_id = '<almaz-tenant-uuid>' ORDER BY skr_account;`
  2. Kontrollieren, dass keine der 14 Kategorien fälschlich auf „Sonstige" (UUID endet auf
     `...4980`) gemappt ist — besonders **Bewirtung** (SKR03 4650 / SKR04 6640/6644).
  3. Falsche/fehlende Zuordnungen korrigieren: `INSERT … ON CONFLICT … DO UPDATE` mit der
     richtigen Lexware-`categoryId` (aus `GET /v1/posting-categories` des Accounts), `source='manual'`.
- **Output:** Bestätigte `lexoffice_category_map`-Zeilen für alle 14 Kategorien; Bewirtung korrekt.
- **Dependencies:** Lexware-Token (T009), Migration 120, Kontenrahmen-Entscheidung (T052, `PILOT_SKR_CHART`).

### ⏳ Migration 120 in Production laufen lassen (T054)
- **Priorität:** P1 (Tabelle `lexoffice_category_map` existierte als „Geist" — Export warf sonst)
- **Was:** Migration `120_lexoffice_category_map.sql` auf Prod anwenden (legt die fehlende
  Mapping-Tabelle + RLS an). Läuft via `migrate.ts` automatisch beim Deploy; hier nur als
  Erinnerung für den manuellen Prod-Migrate-Schritt.
- **Schritte:** `docker compose -f docker-compose.prod.yml exec backend node dist/core/db/migrate.js`
  (oder der etablierte Deploy-Migrate-Pfad) und prüfen, dass `120_*` als applied verbucht ist.
- **Output:** Tabelle `lexoffice_category_map` existiert in Prod.

### ⏳ Migration 100 in Production laufen lassen (T009)
- **Priorität:** P0 (Token-Storage existiert sonst nicht)
- **Was:** `belege` bekommt nichts; neue Tabelle `booking_credentials` (Lexware-Token-Storage)
- **Schritte:**
  1. Backup ziehen
  2. SQL via psql: `\i /opt/gastro/migrations/100_booking_credentials.sql`
  3. Verifizieren: `\d booking_credentials`
  4. `INSERT INTO schema_migrations(filename) VALUES ('100_booking_credentials.sql')`
- **Rollback:** `100_booking_credentials_rollback.sql`

### ⏳ Google Cloud Vision API — Projekt + Service-Account einrichten (T007)
- **Priorität:** P0 (ohne Vision-Credentials keine echte OCR — Service läuft sonst nur im Mock-Modus)
- **Was:** GCP-Projekt anlegen, Vision-API aktivieren, Service-Account erzeugen, JSON-Key herunterladen
- **Wo:** https://console.cloud.google.com
- **Schritte:**
  1. Neues GCP-Projekt "prozesspilot-prod" anlegen (Region `europe-west3` für EU-Datenhaltung)
  2. Billing-Account verknüpfen (1000 Vision-Calls/Monat = ~1,50 EUR — Daily-Limit pro Tenant ist auf 1000 gesetzt)
  3. Vision API aktivieren: `gcloud services enable vision.googleapis.com`
  4. Service-Account erstellen: `prozesspilot-vision-prod@...`, Rolle "Cloud Vision AI Service Agent"
  5. JSON-Key herunterladen, sicher ablegen (NIE ins Repo committen)
  6. Auf IONOS-Server unter `/etc/prozesspilot/gcp-vision.json` ablegen: `chown gastro:gastro`, `chmod 600`
- **Output:** `GOOGLE_VISION_KEY_FILE=/etc/prozesspilot/gcp-vision.json`
- **Dependencies:** IONOS-Server-Setup muss laufen

### ⏳ Migration 070 in Production laufen lassen (T007)
- **Priorität:** P0 (vor erstem Echt-Upload — sonst stürzt OCR-Worker beim ocr_cost_log-Insert ab)
- **Was:** Wird automatisch durch Auto-Deploy ausgeführt (`migrate:prod` via DATABASE_URL_MIGRATE).
- **Manuelle Verifikation:** `SELECT version FROM schema_migrations WHERE version = '070'` auf Production-DB

### ⏳ Neue ENV-Variablen für T007 in GitHub-Secrets + IONOS-Env (T007)
- **Priorität:** P1 (Defaults sind sinnvoll, aber Ops-Alerts brauchen Discord-Webhook)
- **Liste:**
  - `OCR_QUEUE_ENABLED` (Default `1` — auf `0` setzen wenn Worker temporär deaktiviert werden soll)
  - `OCR_DAILY_LIMIT_PER_TENANT` (Default `1000` — anpassen wenn Pilot mehr Volumen braucht; Empfehlung: 10% Sicherheitspuffer wegen Race bei Concurrency=2)
  - `OCR_MAX_ATTEMPTS` (Default `3` — selten ändern)
  - `DISCORD_OPS_WEBHOOK_URL` — Webhook für Ops-Channel im Gastro-Team-Discord, wird beim finalen OCR-Fail aufgerufen
- **Schritte für DISCORD_OPS_WEBHOOK_URL:**
  1. Im Gastro-Team-Discord einen Channel `#ops-alerts` anlegen (falls nicht vorhanden)
  2. Kanal-Einstellungen → Integrationen → Webhooks → Neuer Webhook "ProzessPilot Ops"
  3. URL als GitHub-Secret + in `.env.prod` auf IONOS hinterlegen
- **Output:** Discord-Alert in #ops-alerts wenn ein Beleg nach 3 OCR-Versuchen failed

### ⏳ SMTP-Account für ausgehende DSGVO-Mails (T010) — NUR EU-HOSTING!
- **Priorität:** P0 (vor Pilot — sonst können DSGVO-Auskünfte + Lösch-Confirms nicht versendet werden)
- **Was:** Transaktionalen SMTP-Versand-Service einrichten — **AUSSCHLIESSLICH EU-Anbieter** (DSGVO!)
- **Erlaubte Anbieter:**
  - IONOS-Mail (kostenlos beim Hosting, am einfachsten)
  - Mailjet EU (https://www.mailjet.com/legal/dpa/) — EU-Hosting + DPA
  - **NICHT erlaubt:** Postmark, SendGrid, AWS SES (US-Hosting → DSGVO-Subunternehmer-Problem)
- **Schritte:**
  1. IONOS-Mail wählen (für Pilot ausreichend)
  2. Mailbox `noreply@prozesspilot.net` einrichten
  3. SPF/DKIM/DMARC für `prozesspilot.net` setzen (sonst landen Mails im Spam)
  4. SMTP-Credentials notieren
- **Output:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- **Subunternehmer-Liste:** Nach Wahl ggf. in AVV/Datenschutzerklärung als Subunternehmer aufnehmen
- **Dry-Run-Verhalten:** Wenn `SMTP_HOST` leer ist, läuft der Backend-Mailversand im Log-Only-Modus (kein Crash, aber Subject erhält keine Mail).

### ⏳ Migration 080 in Production laufen lassen (T010)
- **Priorität:** P0 (Backend crasht beim ersten DSGVO-Antrag ohne diese Tabelle)
- **Was:** Wird automatisch durch Auto-Deploy ausgeführt (`migrate:prod` via DATABASE_URL_MIGRATE).
- **Manuelle Verifikation:** `SELECT version FROM schema_migrations WHERE version = '080'` auf Production-DB

### ⏳ Neue ENV-Variablen für T010 in GitHub-Secrets + IONOS-Env (T010)
- **Priorität:** P1 (Defaults sind sinnvoll, aber SMTP ist zwingend)
- **Liste:**
  - `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — siehe vorigen Eintrag
  - `DSGVO_REQUESTS_PER_DAY_LIMIT` (Default 5 — nur ändern wenn ein Tenant rechtlich begründet mehr braucht)
  - `DSGVO_CONFIRM_TOKEN_TTL_SECONDS` (Default 1800 = 30 min — selten ändern)
  - `DSGVO_EXPORT_TTL_DAYS` (Default **3** — von 14 auf 3 gesenkt, Review-Fix M2; ZIP-Download-Link mit voller PII soll nicht 2 Wochen rumliegen)
  - `DSGVO_QUEUE_ENABLED` (Default `1` — auf `0` setzen wenn Worker temporär deaktiviert)

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
