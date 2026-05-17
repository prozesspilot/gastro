# High-End Prompt: Vollständige Repo-Diagnose + Admin-Login-Fix + HTML-Statusbericht

> **Nutzung:**
> 1. **Neue** Claude-Code-Session im Repo-Root öffnen: `/Users/donandrejo/Documents/ProzessPilot/prozesspilot/`
> 2. Modell: **Opus 4.6** (nicht Haiku, nicht Sonnet — dieser Prompt ist komplex)
> 3. Block zwischen `===== PROMPT START =====` und `===== PROMPT ENDE =====` kopieren und als erste Nachricht senden
> 4. Bei den Checkpoints **wirklich** lesen, bevor du „weiter" sagst

---

```
===== PROMPT START =====

ROLLE
Du bist Senior Site Reliability Engineer mit Spezialisierung auf Auth-Systeme, Datenbank-Migrations und Production-Readiness-Audits. Du arbeitest am Projekt ProzessPilot. Heute ist dein Auftrag: ein End-to-End-Diagnose und Reparatur des Auth-Systems, sodass der Owner sich tatsächlich in die Webapp einloggen kann.

KONTEXT — was vorher passiert ist
- Projekt ist eine modulare Buchhaltungs-Automationsplattform (n8n + Backend + Webapp + 13 Module M01-M13)
- Modul M14 (Auth + User-Verwaltung) wurde frisch implementiert, hat aber Inkonsistenzen
- Insbesondere: Migration 031_users_auth.sql liegt in backend/migrations/ statt in migrations/ (Repo-Root, wo migrate.ts liest)
- Daher existiert die users-Tabelle nicht in der DB → bootstrap:super-admin schlägt fehl → Login unmöglich
- Es gab vorher mehrere Refactor-Wellen, der git status zeigt 30+ uncommittete Files

DEIN AUFTRAG IN FÜNF PHASEN
  Phase 1: Diagnose (READ-ONLY — nichts ändern, nur dokumentieren)
  Phase 2: Fix-Plan vorlegen — auf Freigabe warten
  Phase 3: Reparatur ausführen
  Phase 4: End-to-End-Verifikation
  Phase 5: HTML-Statusbericht generieren

Nach jeder Phase: STOP, Bericht, warte auf "weiter".

═══════════════════════════════════════════════════════════════════════
PFLICHT-KONTEXT — vor Beginn lesen, dann 8 Bullet-Points zur Bestätigung
═══════════════════════════════════════════════════════════════════════
1. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/STATUS.html
2. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/README.md
3. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md
4. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/01_Datenmodell_Events.md
5. /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/02_Kundenprofil_System.md
6. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/README.md
7. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/backend/src/app.ts (besonders: Routen-Registrierung + Auth-Middleware)
8. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/backend/src/core/db/migrate.ts (welcher Pfad wird gelesen?)
9. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/backend/migrations/031_users_auth.sql
10. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/backend/migrations/031b_bootstrap_super_admin.sql
11. /Users/donandrejo/Documents/ProzessPilot/prozesspilot/backend/src/modules/users/bootstrap.ts

═══════════════════════════════════════════════════════════════════════
GLOBALE REGELN — gelten in ALLEN Phasen
═══════════════════════════════════════════════════════════════════════
- NIEMALS Files löschen ohne explizite Freigabe.
- NIEMALS git push, git reset --hard oder git checkout auf einen anderen Branch.
- NIEMALS Klartext-Passwörter in Logs, Commit-Messages oder Code-Kommentare.
- NIEMALS .env oder .env.local oder .env.prod ins git stagen (Pre-Check via git check-ignore).
- NIEMALS einen Production-Server berühren — Aktionen sind alle lokal.
- Bei JEDEM Schreibvorgang an existierenden Files: vorher ein Backup (cp <file> <file>.bak-<datum>) anlegen, am Ende sagen, welche Backups erzeugt wurden.
- Bei Test-/Migrations-/Bootstrap-Fehlern: STOP, vollständigen Stacktrace + Hypothese + Fix-Vorschlag zeigen, NICHT eigenmächtig debuggen.
- Bei Mehrdeutigkeit oder Widersprüchen (z. B. tenant_id ist mal UUID mal TEXT): explizit nachfragen statt raten.

ADMIN-CREDENTIALS — wie sie behandelt werden
- Email: s.andreas-k@hotmail.de  (Owner)
- Passwort: zufällig generieren (32 Zeichen, mind. 1 Ziffer, 1 Sonderzeichen, kein Leerzeichen) via openssl
- Passwort wird NUR im finalen HTML-Statusbericht (Phase 5) ausgegeben — niemals in Chat, Logs, Commits
- password_must_change: true (Owner muss bei erstem Login wechseln)
- preset: super_admin
- permissions: ["*"]
- tenant_id: NULL

═══════════════════════════════════════════════════════════════════════
PHASE 1 — DIAGNOSE (READ-ONLY)
═══════════════════════════════════════════════════════════════════════

ZIEL
Vollständig verstehen, was kaputt ist. Keine Änderungen. Output ist eine strukturierte Befund-Liste.

DURCHFÜHRUNG

1.1 Repo-Topographie
  - git status --short (gesamter Stand uncommittetter Files)
  - git log --oneline -10 (letzte 10 Commits)
  - find . -name "migrations" -type d -not -path "*/node_modules/*"
  - ls auf jedem gefundenen migrations-Verzeichnis
  - diff der gefundenen Verzeichnisse (welche Files in beiden, welche nur in einem)

1.2 Migrations-Pfad-Check
  - In backend/src/core/db/migrate.ts: welches Verzeichnis wird tatsächlich gelesen? (MIGRATIONS_DIR)
  - Welche Migrationen liegen DORT physisch?
  - Welche Migration legt die users-Tabelle an? Existiert sie im read-Pfad?
  - Heißt die Migrations-Tracker-Tabelle "schema_migrations" oder "_migrations"?

1.3 Docker / Container-Status
  - docker ps --format "{{.Names}}\t{{.Status}}" (was läuft?)
  - docker compose ls
  - Wenn postgres läuft: docker exec ... psql -U pp -d prozesspilot -c "\dt" (welche Tabellen existieren bereits?)
  - Existiert users-Tabelle? auth_events-Tabelle? refresh_tokens-Tabelle?
  - Wenn schema_migrations existiert: SELECT version FROM schema_migrations ORDER BY version;
  - Wenn _migrations existiert: SELECT filename FROM _migrations ORDER BY applied_at;

1.4 ENV / Secrets
  - Existiert /Users/donandrejo/Documents/ProzessPilot/prozesspilot/.env?
  - Welche Variablen sind gesetzt (Werte zensiert ausgeben — nur "<gesetzt>" oder "<leer>")?
  - Sind JWT_SECRET, INITIAL_SUPER_ADMIN_EMAIL, INITIAL_SUPER_ADMIN_PASSWORD definiert?
  - Hat JWT_SECRET mindestens 64 hex-Zeichen (= 256 Bit)?

1.5 Backend-Code-Inspektion
  - backend/src/app.ts: ist users-Modul (m14) per app.register(...) registriert?
  - Sind die Routen /api/v1/auth/login, /api/v1/auth/refresh, /api/v1/auth/me, /api/v1/users vorhanden?
  - backend/src/core/auth/jwt.ts: liest es das JWT_SECRET aus config? Fail-Fast bei fehlendem Secret?
  - backend/src/modules/users/services/user.repository.ts: matcht Schema (Spalten-Namen + Types) mit Migration 031?
  - Insbesondere: ist tenant_id konsistent (UUID vs TEXT)?

1.6 Frontend-Code-Inspektion
  - webapp/src/pages/LoginPage.tsx: erwartet sie Email + Password? Ruft sie POST /auth/login auf?
  - webapp/src/auth/AuthContext.tsx: holt sie den User per GET /auth/me? Refresh-Logik vorhanden?
  - webapp/src/api/auth.ts: existiert? Welche Funktionen exportiert?
  - webapp/src/components/UserMenu.tsx: existiert?

1.7 Test-Stand
  - cd backend && npm test (alle grün? wenn nicht: welche schlagen fehl?)
  - cd webapp && npm test (alle grün? wenn nicht: welche?)
  - Nicht „npm run test:e2e" laufen lassen in Phase 1 — das dauert zu lange. Nur Unit-Tests.

1.8 Dependencies-Check
  - cd backend && npm ls argon2 jsonwebtoken pg pino fastify 2>&1 | grep -E "argon2|jsonwebtoken|missing|ERR"
  - Sind alle nötigen Auth-Libs installiert?

CHECKPOINT 1 — BEFUND-REPORT
Bericht in dieser Struktur:
  A) GEFUNDENE PROBLEME (priorisiert: BLOCKER > KRITISCH > WICHTIG > KOSMETISCH)
  B) VERMUTETE ROOT-CAUSE (1–3 Sätze)
  C) WAS BEREITS GUT IST (was funktionieren wird, sobald Blocker weg sind)
  D) RISIKEN für Phase 3 (welche Schritte könnten Daten zerstören?)
  E) FRAGEN AN OWNER (falls etwas mehrdeutig ist)

Dann STOP. Warte auf "weiter zu Phase 2".

═══════════════════════════════════════════════════════════════════════
PHASE 2 — FIX-PLAN (NUR PLAN, KEINE AUSFÜHRUNG)
═══════════════════════════════════════════════════════════════════════

ZIEL
Eine konkrete, atomare to-do-Liste, die der Owner in einem Stück freigeben kann.

DURCHFÜHRUNG

Erstelle eine nummerierte Liste mit dieser Form je Schritt:
  N. Aktion (z. B. "mv backend/migrations/031_users_auth.sql migrations/")
     - Warum: <1 Satz>
     - Reversibel: ja/nein
     - Backup vor Aktion: <Befehl, falls relevant>
     - Erwartung danach: <Verifikation, z. B. "Datei nicht mehr in backend/migrations">

TYPISCHE SCHRITTE (passe an Phase-1-Befund an, übersprung was nicht nötig ist):

  S1: Migration 031 + 031b von backend/migrations/ nach migrations/ verschieben
  S2: Eventuelle Schema-Inkonsistenzen in 031_users_auth.sql fixen (z. B. UUID vs TEXT für tenant_id)
  S3: .env an .env.example angleichen + sichere Werte für JWT_SECRET, INITIAL_SUPER_ADMIN_EMAIL/PASSWORD generieren (mit openssl)
  S4: Falls schema_migrations vs _migrations mismatch: alten Tracker-Inhalt nach neuer Tabelle kopieren
  S5: npm run migrate ausführen — sollte Migration 031 (+ 031b falls nicht via Bootstrap-Script) anwenden
  S6: Verifikation: \dt zeigt users, refresh_tokens, auth_events
  S7: npm run bootstrap:super-admin — User in DB anlegen
  S8: Backend neu starten (docker compose restart backend ODER npm run dev re-start)
  S9: Smoke-Test gegen /api/v1/auth/login via curl

CHECKPOINT 2 — PLAN-FREIGABE
Owner liest, akzeptiert oder passt an.
STOP. Warte auf "weiter zu Phase 3".

═══════════════════════════════════════════════════════════════════════
PHASE 3 — FIX AUSFÜHREN
═══════════════════════════════════════════════════════════════════════

ZIEL
Nach jedem einzelnen Schritt: Ergebnis kurz berichten („✓ Schritt N: <Aktion> — <kurzes Ergebnis>"). Bei jedem Fehler: STOP.

DURCHFÜHRUNG
Arbeite die Plan-Liste aus Phase 2 schrittweise ab. Pro Schritt:
  1. Backup falls nötig
  2. Aktion ausführen
  3. Verifikation (z. B. Datei vorhanden / Tabelle existiert / Endpoint antwortet)
  4. Ergebnis in 1 Zeile berichten

SPEZIFISCHE LEITPLANKEN
- Bei npm-Befehlen: --silent oder >/dev/null nutzen, damit Output-Spam in Grenzen bleibt. NICHT: --force, --legacy-peer-deps, --skip-tests
- Bei psql-Befehlen: explizit -U pp und Datenbank-Name angeben
- Bei docker compose: nutze docker-compose.yml (Dev), NICHT docker-compose.prod.yml
- Wenn die Migration 031 inkonsistent ist (z. B. UUID vs TEXT) und der Fix verändert, was Production später braucht: HALT, Owner fragen
- Schreibe das frisch generierte Admin-Passwort in /tmp/pp-admin-password-<timestamp>.txt (chmod 600), nicht in Konsole. In Phase 5 wird es im HTML-Report einmalig angezeigt.

CHECKPOINT 3 — ZWISCHENBERICHT
- Welche Schritte abgehakt
- Welche Backups erstellt (mit Pfaden)
- Welche Files geändert (Liste)
- Welche Migrationen in DB neu sind
- Welche User-Rows jetzt in DB existieren (SELECT id, email, preset, is_active FROM users)
STOP. Warte auf "weiter zu Phase 4".

═══════════════════════════════════════════════════════════════════════
PHASE 4 — END-TO-END-VERIFIKATION
═══════════════════════════════════════════════════════════════════════

ZIEL
Beweise, dass der Login wirklich funktioniert — nicht „sollte funktionieren".

DURCHFÜHRUNG

4.1 Backend-Health
  - curl -s http://localhost:3000/health → erwarte {"ok": true, ...}
  - curl -s http://localhost:3000/ready → erwarte 200

4.2 Login-Flow per curl
  - POST /api/v1/auth/login mit Admin-Email + Admin-Passwort
    - erwarte: 200, JSON enthält access_token + user.email + user.permissions=["*"]
    - erwarte Set-Cookie pp_refresh mit HttpOnly + SameSite
  - Falls 4xx oder 5xx: STOP, exakten Response zeigen
  - Extrahiere access_token in Variable für Folge-Tests

4.3 Authentifizierter Request
  - GET /api/v1/auth/me mit Authorization: Bearer <access_token>
    - erwarte: 200, JSON mit user.email = s.andreas-k@hotmail.de + permissions=["*"]
  - Falls Fehler: STOP

4.4 Refresh-Flow
  - POST /api/v1/auth/refresh mit Cookie pp_refresh
    - erwarte: 200, neuer access_token, neuer Set-Cookie pp_refresh
    - alter Refresh-Cookie sollte in DB als revoked markiert sein (SELECT revoked_at FROM refresh_tokens ...)

4.5 Permission-Check
  - GET /api/v1/users mit gültigem Bearer-Token
    - erwarte: 200, Array mit mindestens dem super_admin
  - GET /api/v1/users OHNE Token
    - erwarte: 401

4.6 Frontend-Smoke (manuell, kann Claude Code nicht selbst, aber Vorbereitung)
  - Webapp läuft? cd webapp && npm run dev
  - Logge die Browser-URL aus: http://localhost:5173 (oder wo auch immer Vite startet)

CHECKPOINT 4 — VERIFIKATIONS-BERICHT
Bericht-Tabelle mit allen 6 Tests + ✓/✗ + Response-Snippet (Token zensiert).
STOP. Warte auf "weiter zu Phase 5".

═══════════════════════════════════════════════════════════════════════
PHASE 5 — HTML-STATUSBERICHT
═══════════════════════════════════════════════════════════════════════

ZIEL
Eine self-contained HTML-Datei mit allem, was der Owner wissen muss.

DURCHFÜHRUNG

Schreibe: /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/STATUS_LOGIN_FIX.html

Strukturiert in folgende Sektionen:

  1. Header: Datum, „Login-Fix abgeschlossen", Pill „READY" oder „TEILWEISE"
  2. Was war kaputt (Befund aus Phase 1, kurze Bullet-Liste)
  3. Was wurde getan (jede Aktion aus Phase 3, mit Status ✓ / ✗ / skipped)
  4. ADMIN-LOGIN-DATEN (groß und auffällig hervorgehoben)
     - Email: s.andreas-k@hotmail.de
     - Passwort: <hier das einmalig generierte Passwort>
     - Hinweis-Box: "Bitte sofort nach erstem Login wechseln. Dieses HTML niemals teilen, nicht ins Git committen."
  5. Verifikations-Resultate (die 6 curl-Tests aus Phase 4)
  6. Backups (Pfade aller Backup-Files, damit Owner notfalls zurückrollen kann)
  7. Was noch offen ist (verbleibende Probleme, die nicht jetzt gefixt wurden — z. B. uncommittete Files, Doppel-Migrationen in backend/migrations/, IONOS-Server-Anpassungen)
  8. Nächste 3 Schritte (Empfehlung für Owner, z. B. „committe Stand, Server-Setup beginnen, Audit-Subagent einrichten")

STYLE
- Dark-mode (Hintergrund #0f1419), Akzentfarbe blau-grün
- Konsistent mit existierender STATUS.html (gleicher Style-Block)
- Tabellen wo passend, ansonsten Prosa
- Passwort-Box mit dickem Rahmen, „COPY"-Hinweis, einmalig sichtbar

ZUSÄTZLICH: Markiere im Git die Änderungen als noch nicht committed.
  - git status --short als Code-Block in HTML
  - Empfehlung im Footer: „diff durchschauen, dann commit in 2 Blöcken: chore(m14): fix migrations + bootstrap path + feat: post-fix infrastructure"

CHECKPOINT 5 — FINALER BERICHT
- HTML-Datei wurde geschrieben (Pfad nennen)
- Admin-Passwort einmalig im Chat ausgeben (markiert mit ⚠ DELETE_AFTER_READ ⚠)
- /tmp/pp-admin-password-*.txt löschen
- Liste, was der Owner JETZT tun sollte (max 3 Bullets)
- ENDE.

═══════════════════════════════════════════════════════════════════════
WAS DU NIE TUST
═══════════════════════════════════════════════════════════════════════
- git push / git reset --hard / git checkout <other-branch>
- rm -rf außerhalb von dist/, node_modules/, .turbo/, .next/
- Production-Server berühren (keine SSH-Calls auf Hetzner/IONOS)
- Klartext-Passwörter loggen
- .env in git stagen
- Eigenmächtig neue npm-Pakete installieren ohne Owner-Freigabe
- Im Code „creative Workarounds" — wenn etwas Spec-konform sein soll, frag

═══════════════════════════════════════════════════════════════════════
WENN DU IN EINER PHASE FESTHÄNGST
═══════════════════════════════════════════════════════════════════════
- Stoppe sofort
- Zeige den exakten Fehler / Output / Stacktrace
- Stelle 1–3 Hypothesen vor, was die Ursache sein könnte
- Mache 1 konkreten Vorschlag, wie weiter
- Frage den Owner — keine Selbst-Reparatur

ENDE — beginne mit Pflicht-Kontext lesen, dann Phase 1.

===== PROMPT ENDE =====
```

---

## Bedienungs-Hinweise (nicht in den Prompt kopieren)

**Vor dem Senden:**
- Nimm Opus, nicht Sonnet/Haiku. Der Prompt erwartet Tiefe.
- Stelle sicher, dass Postgres läuft (`docker ps | grep postgres`) — sonst startet Phase 1.3 ohne Daten.
- Backup-mäßig: `cp -r /Users/donandrejo/Documents/ProzessPilot/prozesspilot /Users/donandrejo/Documents/ProzessPilot/prozesspilot.bak-vor-fix` (kostet 10 Sekunden, gibt dir Sicherheit).

**Während des Laufs:**
- Bei Phase-1-Bericht: **wirklich** lesen. Wenn die Root-Cause-Hypothese nicht plausibel klingt, sage das, statt durchzuwinken.
- Bei Phase-2-Plan: jeden Schritt mental durchgehen. Wenn du einen Schritt nicht verstehst, frag.
- Bei Phase 3: lass dir die Backup-Pfade nennen.
- Bei Phase 4: der curl-Login-Test muss wirklich 200 + JWT zurückgeben, sonst war's umsonst.

**Nach Phase 5:**
- HTML im Browser öffnen, Admin-Passwort einmal in den Passwort-Manager kopieren
- HTML-File **löschen** oder in einen `.gitignore`-Pfad legen (`Konzeptentwicklung/_secrets/` mit gitignore-Eintrag)
- Login in Webapp testen, Passwort sofort wechseln
- Erst dann committen — der erste Commit darf das temp-Passwort niemals enthalten

**Falls Phase 4 oder 5 nicht erreicht wird** (z. B. Phase 1 stellt fest, dass argon2 nicht installiert ist und das nicht in 5 min lösbar ist):
- Claude Code wird mit ehrlichem Bericht stoppen — keine Selbst-Reparatur
- Du kommst hierher, ich helfe mit dem konkreten Problem
- Der Audit-Befund aus Phase 1 ist auch isoliert wertvoll

---

**Realistische Zeit:** 30–60 min, davon ~20 min Claude-Generierung + 10–40 min dein Review der Checkpoints (je nachdem wie viel zu reparieren ist).
