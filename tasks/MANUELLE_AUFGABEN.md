# Manuelle Aufgaben (Steve / Andreas)

> Sammlung aller manuellen Schritte, die NICHT per Code lösbar sind und außerhalb des Repos passieren müssen.
> Letzte Aktualisierung: 2026-06-02
>
> **Format:** Jede Aufgabe hat Owner, Priorität, Status, Quelle (welche Task/PR sie ausgelöst hat).
> **Status-Werte:** ⏳ offen · 🔄 in Arbeit · ✅ erledigt · ❌ blockiert

---

## 🎯 Steve — Frontend / Sales / Externe Konten

### ✅ Discord Developer Portal — App registriert (T001) — verifiziert 2026-06-02
- **Status:** `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` in `/opt/gastro/.env.prod` gesetzt (Backend startet ohne Hard-Fail). Discord-OAuth-Endpoints sind live.
- **Pending:** `DISCORD_ROLE_ID_GF` fehlt noch — Steve muss Rollen-ID der „geschaeftsfuehrer"-Rolle aus Discord-Server-Settings ergänzen. Notfall-Login-Privileg-Check ist sonst broken.
- **Pending:** `DISCORD_OPS_WEBHOOK_URL` fehlt noch — Webhook in `#ops-alerts` anlegen, dann OCR-Final-Fails + Cron-Crashes silent.
- **Access-Note 2026-06-02:** Andreas ist (noch) nicht im „Gastro Team"-Discord-Server, nur im ProzessPilot-Server. Beide Discord-ID-Beschaffungen liegen daher auf Steves Lane. Steve: Andreas einladen sobald Ops-Sichtbarkeit (#ops-alerts) auch ihn erreichen soll.
- **Ursprünglich:**
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

### ⏳ MinIO-Root-Credentials rotieren (Leak 2026-06-02)
- **Priorität:** P1 (Bucket ist intern-only — kein extern erreichbarer Listener auf 9000/9001 — und aktuell leer, daher kein akuter Exploit-Pfad; deadline: **vor erstem Echt-Beleg in `prozesspilot-raw`**)
- **Kontext:** Beim Bucket-Setup am 2026-06-02 wurde `MINIO_ROOT_PASSWORD` durch Paste-Wrapping einer Shell-Zeile als `command not found`-Output in Mac-Scrollback + Claude-Code-Chat-Log geleaked. Server-Bash-History ist sauber (Variable nur expandiert, nie als Wert getippt).
- **Was:** Neues MinIO-Root-Passwort generieren, `MINIO_SECRET_KEY` in `/opt/gastro/.env.prod` ersetzen, MinIO-Container über offiziellen Rotation-Mechanismus neu starten.
- **Schritte:**
  1. Auf Server: Backup `cp /opt/gastro/.env.prod /opt/gastro/.env.prod.bak.<ts>`
  2. Neues Passwort: `NEW=$(openssl rand -base64 33 | tr -d '/+=\n')`
  3. Alten Wert sichern: `OLD=$(grep ^MINIO_SECRET_KEY= /opt/gastro/.env.prod | cut -d= -f2-)`
  4. Ersetzen via `sed -i "s|^MINIO_SECRET_KEY=.*|MINIO_SECRET_KEY=$NEW|" /opt/gastro/.env.prod`
  5. Rotation-OLD anhängen: `echo "MINIO_ROOT_PASSWORD_OLD=$OLD" >> /opt/gastro/.env.prod` (docker-compose mapped `MINIO_SECRET_KEY` auf `MINIO_ROOT_PASSWORD` — der OLD-Wert muss als echter MinIO-Var-Name eingetragen werden, damit MinIO ihn beim Restart liest)
  6. MinIO neu erstellen (nicht restart — `restart` re-liest die `.env` nicht): `cd /opt/gastro && docker compose -f docker-compose.prod.yml up -d --force-recreate minio`
  7. Logs prüfen: `docker logs gastro-minio-1 --tail 30` muss `Rotation of root credentials successful` oder vergleichbar zeigen
  8. mc-Alias neu setzen (siehe Schritt-3-Procedure von 2026-06-02 — alter Alias hat noch alten Wert)
  9. Backend recreaten damit es neuen Secret-Key liest: `docker compose -f docker-compose.prod.yml up -d --force-recreate backend`
  10. Smoke-Test: `curl -sI https://api.prozesspilot.net/api/v1/health` → HTTP/2 200
  11. Cleanup: `sed -i '/^MINIO_ROOT_PASSWORD_OLD=/d' /opt/gastro/.env.prod && docker compose -f docker-compose.prod.yml up -d --force-recreate minio`
  12. Backup-Datei `/opt/gastro/.env.prod.bak.*` löschen oder in 1Password sichern (enthält alten Wert)
  13. Mac-Scrollback in `Terminal.app`: `Cmd+K` (löscht Scrollback der aktuellen Session)
- **Rollback bei Fehlern in Schritt 7:** `.env.prod.bak.<ts>` zurückkopieren, `docker compose up -d --force-recreate minio` — alter Wert ist wieder aktiv.

### ✅ TRUST_PROXY ENV-Variable in Production gesetzt (T017) — erledigt 2026-06-02
- **Status:** `TRUST_PROXY=loopback` in `/opt/gastro/.env.prod`, Backend-Container hat ENV geladen (`docker exec gastro-backend-1 env | grep TRUST_PROXY` zeigt `TRUST_PROXY=loopback`), Health-Endpoint antwortet HTTP/2 200 mit `X-Forwarded-For`-Header.
- **Priorität ursprünglich:** P0 (vor Production-Cutover — sonst funktioniert IP-Rate-Limiting nicht und ist als DoS-Vektor ausnutzbar)
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
  - [x] **MinIO-Bucket `prozesspilot-raw` anlegen** (für Beleg-Uploads, T006) — ✅ 2026-06-02, leer, owner = MinIO-Root (Service-Account-Subdelegation siehe Rotation-Task)
  - [x] Docker / docker-compose installiert
  - [x] SSH-Key von Steve hinterlegt
  - [x] SSH-Key von Andreas hinterlegen — ✅ 2026-06-02 verifiziert (Login klappt `root@ubuntu`)
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

### ✅ POS-Credentials-Cleanup-Cron eingerichtet (T018) — 2026-06-02
- **Status:** systemd-Timer `gastro-pos-cleanup.timer` armed (04:30 UTC daily), aktiviert + persistent. Erster Run: 2026-06-02 04:30 UTC. Smoke-Test ausstehend bis Bug-Check-Agent Live-Trigger freigibt.
- **Code-Quelle:** T018 (PR mittlerweile gemerged via Auto-Deploy — siehe Folge-Verify).
- **Vorgaben unverändert:**
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

### ✅ SumUp Daily-Sync-Cron eingerichtet (T005) — 2026-06-02
- **Status:** systemd-Timer `gastro-sumup-sync.timer` armed (03:00 UTC daily), aktiviert + persistent. Erster Run: 2026-06-02 03:00 UTC.
- **Verifikation:** `systemctl list-timers gastro-*` zeigt beide Timer. Smoke-Test (`docker compose exec backend node dist/cron/sumup-daily.js`) ausstehend bis Bug-Check-Agent grünes Licht gibt für Live-Trigger.
- **Pending Dependency:** Almaz SumUp-OAuth-Flow muss noch durchlaufen sein (T004) — bis dahin loggen die Runs "0 tenants synced".
- **Vorgaben unverändert:**
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

### ✅ Migration 110 in Production applied (T005) — verifiziert 2026-06-02
- **Status:** Auto-Deploy `migrate:prod` hat 110 schon angewendet. `kasse_transactions.integration_id` ist `is_nullable=YES` (verifiziert via `information_schema`), `schema_migrations` enthält `110_kasse_transactions_fk_relax.sql`.
- **Doc-Drift-Hinweis:** `schema_migrations`-Tabelle hat Spalte `version` (nicht `filename`); ältere Eintraege hier sind falsch. Korrekter INSERT: `INSERT INTO schema_migrations(version) VALUES ('110_kasse_transactions_fk_relax.sql') ON CONFLICT DO NOTHING`.
- **Backup vor Verifikation:** `/root/db-backups/pre-migrations-100-110-20260602-023048.dump` (103K, manuell pg_dump-Fc).

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

### ✅ Migration 100 in Production applied (T009) — verifiziert 2026-06-02
- **Status:** Auto-Deploy `migrate:prod` hat 100 schon angewendet. Tabelle `booking_credentials` existiert (CREATE schlug mit "relation already exists" fehl), `schema_migrations` enthält `100_booking_credentials.sql`.
- **Folgeaufgabe (separat):** Lexware-API-Token von Almaz' Steuerberaterin besorgen + via `bootstrap-lexware-token.js` ablegen — siehe nächster Eintrag.

### ⏳ Google Cloud Vision API — Projekt + Service-Account einrichten (T007)
- **Owner-Reassignment 2026-06-02:** Steve macht GCP-Setup (kein Andreas-Zugang). Andreas verarbeitet die JSON-Key + ENV-Eintragung Server-Side, sobald JSON in 1Password/Discord-DM geteilt ist.
- **Hängt von:** PR #99 muss vor Live-Schaltung gemerged sein (sonst Vision-Calls in US-Region — DSGVO-Verletzung).
- **Bei ENV setzen:** `OCR_DAILY_LIMIT_PER_TENANT=900` (nicht 1000) — Race-Puffer per Bug-Audit M02/M12 2026-06-02.
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
- **Owner-Reassignment 2026-06-02:** Steve macht IONOS-Mail-Setup + DNS-Records (Andreas hat keinen IONOS-Account-Zugang). Andreas trägt Mailbox-Credentials Server-Side in `.env.prod` ein, sobald Steve sie via 1Password/Discord-DM teilt.
- **Reihenfolge wegen DNS-Propagation (1–24h Lead-Time):**
  1. Mailbox `noreply@prozesspilot.net` anlegen
  2. DKIM in IONOS aktivieren → Selector + Key notieren
  3. DNS-Records setzen: SPF (`v=spf1 include:_spf.kundenserver.de ~all`), DKIM (Wert aus IONOS), DMARC (`v=DMARC1; p=quarantine; rua=mailto:dmarc@prozesspilot.net; pct=100; adkim=s; aspf=s`)
  4. Credentials teilen → Andreas trägt SMTP_HOST/PORT/USER/PASS/FROM ein
- **Hängt von:** PR #100 (SMTP_FROM-Default `.de`→`.net`) gemerged, damit Fallback-Strings korrekt sind.
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
