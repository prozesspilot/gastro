# Discord-Integration — Mitarbeiter-Workflow + Customer-Bridge

> **Status:** Erstfassung 2026-05-15
> **Zielgruppe:** Andreas (Entwickler), Steve (Geschäftsführung), Anwalt (Subunternehmer-Liste + Datenschutz)
> **Verhältnis zu anderen Dokumenten:** Setzt `00_Architektur_Hauptdokument.md` voraus. Wird referenziert von `Mitarbeiter_Webapp.md`, `M14_User_Verwaltung_Auth.md` und allen Konzept-Dokumenten, die Mitarbeiter-Workflows betreffen.
>
> **⚠️ ÜBERHOLT — Customer-Support-Bridge gestrichen (GF Steve, 2026-06-25):** Der Support läuft
> **komplett über das Web-Chat**: der Wirt schreibt im Widget (`chat.prozesspilot.net`), Mitarbeiter
> antworten in der **Mitarbeiter-Webapp** (`admin.prozesspilot.net/chats`, T073). Die in §1.1 („Bridge"),
> §3.2 und §7 beschriebene **Customer-Chat-Bridge** und **„Reply-aus-Discord"** (Spiegeln der
> Customer-Messages nach `#support-tickets`, Antworten aus dem Discord-Thread) wird **NICHT gebaut**.
> Discord bleibt: Mitarbeiter-**Login** (M14, live), interne **Team-Koordination** und optionale
> **System-Notifications** (Deploy/Ops/Uptime). Der Phase-C-Web-Chat (T068–T073, gebaut) ist damit die
> finale Support-Architektur — `chat_messages` ist die Single Source of Truth, kein Discord-Mapping nötig.

---

## 1. Was Discord in ProzessPilot ist und was nicht

### 1.1 Was Discord ist

- **Primärer Kommunikations-Kanal für Mitarbeiter** (interne Team-Chats, Voice, Async)
- **Authentifizierungs-Anbieter** für die Mitarbeiter-Webapp via Discord OAuth 2.0
- **Notification-Hub** für System-Events: neue Tasks, Fehler, Customer-Anfragen, Deploy-Status
- **Action-Layer** für leichtgewichtige Aktionen: Task übernehmen, Helfer einladen, Status-Updates
- **Bridge** zwischen Customer-Web-Chat-Widget und Mitarbeiter-Team (in beide Richtungen)

### 1.2 Was Discord ausdrücklich nicht ist

- **Keine Source of Truth für Daten.** Customer-Konversationen, Tasks, Tenant-Stammdaten leben in der ProzessPilot-Datenbank (IONOS EU), nicht in Discord.
- **Kein Customer-Touchpoint.** Endkunden (Wirte) sehen Discord nie. Sie sehen ein Web-Chat-Widget — die Discord-Spiegelung passiert nur auf Mitarbeiter-Seite.
- **Kein dauerhaftes Archiv.** GoBD-relevante Daten werden in der EU-DB archiviert, nicht in Discord-Channels.
- **Kein Workflow-Engine-Ersatz.** Komplexe Logik (Auto-Eskalation, SLAs, Berichts-Generierung) bleibt in n8n + Backend.

### 1.3 Warum Discord — und nicht Slack / Microsoft Teams / Mattermost

| Kriterium | Discord | Slack | Teams | Mattermost (self-hosted) |
|---|---|---|---|---|
| Kosten bis 10 Personen | 0 € | 0 €, eingeschränkt | 0 €, ab 4 € MA | 0 €, eigener Server-Aufwand |
| Bot-API-Qualität | sehr gut | sehr gut | mittel | gut |
| Voice-Channels | nativ | bezahlpflichtig | nativ | extern |
| Buttons / Interactive Components | nativ seit 2021 | nativ | nativ | begrenzt |
| Verbreitung in der Tech-Szene | hoch | hoch | mittel | niedrig |
| DSGVO / Drittland-Transfer | US-Server, SCCs nötig | US-Server, SCCs nötig | US-Server, SCCs nötig | EU-self-hosted möglich |
| Lern-Aufwand für neue MA | gering (viele kennen Discord schon) | mittel | mittel | hoch |
| Skalierungs-Grenze | komfortabel bis ~50 MA | unbegrenzt | unbegrenzt | unbegrenzt |

**Entscheidung:** Discord für die Pilot- und Skalierungs-Phase (bis ~10–15 Mitarbeiter). Migration auf Slack oder Mattermost nur, wenn das Team über diese Schwelle wächst — voraussichtlich nicht vor 2028.

---

## 2. Discord-Server-Setup

### 2.1 Server-Struktur

Ein interner Discord-Server "**ProzessPilot Team**" wird angelegt mit folgender Channel-Struktur:

```
📢 INFORMATIONEN
├── 📌 #welcome                 (Server-Regeln, Quick-Start)
├── 📚 #wissensbasis            (Links zu Konzept-Docs, Wiki, Tutorials)
└── 📊 #monthly-reports         (Auto-Posts der Monats-Statistiken)

🛠️ OPERATIVES
├── 🚨 #alerts-critical         (Fehler-Alarme, Sentry, Production-Issues)
├── 📋 #tasks-neu               (Auto-Pings für neue Tasks aus Webapp)
├── ✅ #tasks-erledigt          (Archiv erledigter Tasks, Read-only)
├── 🆘 #support-tickets         (Customer-Anfragen, Threads pro Tenant)
└── 🔧 #deployment              (Deploy-Notifications aus CI/CD)

💼 VERTRIEB & KUNDEN
├── 💰 #sales-vertrieb          (Vertriebsagentur-Updates, neue Tenants)
├── 📞 #onboarding              (Aktive Onboarding-Prozesse, Wizard-Status)
└── 🎯 #pilot                   (Pilot-Wirt-spezifische Notizen)

🗣️ KOMMUNIKATION
├── 💬 #general                 (Team-Chat allgemein)
├── 🎉 #wins                    (Erfolge feiern, Customer-Lob)
├── 🤔 #fragen                  (Interne Fragen, Brainstorming)
└── 🔇 Voice — Daily Standup   (15-Min Voice-Calls)
```

### 2.2 Rollen im Discord-Server

| Rolle | Mitglieder | Discord-Rechte | ProzessPilot-Permissions |
|---|---|---|---|
| **Geschäftsführer** | Steve, Andreas | Admin: Server-Settings, Webhooks, Bot-Config | Alle Permissions in PP-DB |
| **Mitarbeiter** | Zukünftige Festangestellte | Standard: lesen + schreiben in alle Channels | Mitarbeiter-Rolle in PP-DB |
| **Support** | Externe Support-Kräfte (Phase 2+) | Eingeschränkt: nur #support-tickets, #fragen | Support-Rolle in PP-DB |
| **Bot** | ProzessPilot-Bot | Admin in allen Funktionen-Channels | — |

**Wichtig:** Die Discord-Rolle ist nur eine Voraussetzung für den Login. Die tatsächlichen ProzessPilot-Permissions kommen aus der PP-DB, nicht aus Discord-Rollen.

---

## 3. Authentifizierung — Mitarbeiter-Login via Discord OAuth

### 3.1 OAuth-Flow

```
1. Mitarbeiter geht zu admin.prozesspilot.net
2. Klick "Mit Discord anmelden"
   → Redirect zu discord.com/oauth2/authorize?client_id=...&scope=identify guilds&...
3. Discord zeigt: "ProzessPilot Admin will Zugriff auf deine Discord-ID und Server-Mitgliedschaften"
4. Mitarbeiter bestätigt → Discord redirected zurück zu admin.prozesspilot.net/auth/discord/callback?code=...
5. Backend tauscht Code gegen Access-Token (Server-zu-Server-Call zu Discord)
6. Backend ruft Discord-API:
   GET /api/users/@me → Discord-User-ID, Username, Avatar
   GET /api/users/@me/guilds → Liste Discord-Server-Mitgliedschaften
7. Backend prüft:
   - Ist der Discord-User Mitglied im ProzessPilot-Team-Server (Guild-ID)? Wenn nein: Login abgelehnt
   - Existiert ein User-Record in PP-DB mit dieser Discord-User-ID? Wenn nein: "Kontaktiere Geschäftsführer"
   - Wenn ja: PP-User-Rolle laden (Geschäftsführer/Mitarbeiter/Support)
8. PP-JWT-Session-Token erstellen, an Browser senden
9. Mitarbeiter ist eingeloggt
```

### 3.2 Discord OAuth Scopes

- `identify` — Zugriff auf User-ID, Username, Avatar (nicht E-Mail per Default — wir brauchen die E-Mail nicht)
- `guilds` — Liste der Server-Mitgliedschaften, um zu prüfen ob Mitarbeiter im PP-Team-Server ist

Keine weiteren Scopes (kein Mail-Zugriff, kein Voice-Zugriff, keine Server-Manage-Rechte).

### 3.3 First-Login-Prozedur

Neue Mitarbeiter werden so onboarded:

1. Steve fügt den Discord-User manuell zum ProzessPilot-Team-Server hinzu (Invite-Link, einmalig)
2. Steve trägt den Discord-User in der PP-DB ein:
   - `users.discord_user_id = "123456789012345678"`
   - `users.discord_username = "AndreasMustermann#1234"` (Anzeige)
   - `users.role = "mitarbeiter"`
3. Neuer Mitarbeiter loggt sich via Discord OAuth ein → wird erkannt → Session erstellt
4. Erste Einrichtung-Schritte werden im Dashboard angezeigt

### 3.4 Tabellen-Schema users (Auszug)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id VARCHAR(20) UNIQUE,           -- z.B. "123456789012345678"
  discord_username VARCHAR(80),                  -- für Anzeige, kann sich ändern
  display_name VARCHAR(80),                      -- Manuell gesetzter Anzeigename
  role VARCHAR(30) NOT NULL,                     -- geschaeftsfuehrer / mitarbeiter / support
  email_for_emergency VARCHAR(255) NULL,         -- Nur Geschäftsführer, für Notfall-Login
  emergency_password_hash VARCHAR(255) NULL,     -- Argon2id, nur Geschäftsführer
  emergency_totp_secret VARCHAR(60) NULL,        -- TOTP für 2FA bei Notfall-Login
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login_at TIMESTAMPTZ NULL,
  last_login_method VARCHAR(20) NULL             -- 'discord' oder 'emergency'
);
```

---

## 4. Notfall-Login — Hintertür bei Discord-Ausfall

### 4.1 Warum nötig

- Discord hat gelegentliche Ausfälle (statistisch ~99,5 % Verfügbarkeit)
- Wenn ProzessPilot-Login ausschließlich an Discord hängt: bei Discord-Ausfall kann niemand ins System
- Insbesondere für **Geschäftsführer** muss ein Notfall-Zugang existieren

### 4.2 Wer hat Notfall-Zugang

- **Nur Geschäftsführer (Steve, Andreas)** — Rolle `geschaeftsfuehrer` in PP-DB
- Mitarbeiter und Support haben **keinen** Notfall-Login — sie müssen warten, bis Discord wieder läuft oder einen Geschäftsführer kontaktieren

### 4.3 Notfall-Login-Setup

```
URL: admin.prozesspilot.net/emergency-login
(nicht im normalen UI verlinkt, nur via Direct-Link erreichbar)

Login-Felder:
1. E-Mail-Adresse (aus users.email_for_emergency, nur Geschäftsführer)
2. Passwort (Argon2id-Hash in users.emergency_password_hash)
3. TOTP-Code (6-stellig, aus Google Authenticator / Authy)

Validierung:
- Email muss existieren UND Rolle == 'geschaeftsfuehrer' UND active == true
- Passwort gegen Argon2id-Hash prüfen
- TOTP gegen users.emergency_totp_secret prüfen (gültig ±30 Sekunden)
- Bei Erfolg: Session mit Lebensdauer 4h (statt 24h bei Discord-Login)

Nach erfolgreichem Login:
- Event-Log: "Notfall-Login von [Steve] um [Timestamp]"
- Discord-Notification an alle anderen Geschäftsführer in #alerts-critical (falls Discord erreichbar)
- Wenn Discord nicht erreichbar: E-Mail-Alert an alternative Mail-Adressen aller Geschäftsführer
```

### 4.4 Setup bei Geschäftsführer-Einrichtung

Initial-Setup einmalig durch Steve (oder den jeweiligen Geschäftsführer selbst):

1. Geschäftsführer loggt sich einmal regulär via Discord ein
2. Geht zu Settings → Notfall-Zugang
3. Setzt eine separate Notfall-Email (idealerweise andere als Discord-Email)
4. Setzt ein starkes Passwort (mind. 16 Zeichen, wird Argon2id-gehasht)
5. Scannt TOTP-QR-Code mit Google Authenticator / Authy
6. Bestätigt mit einmaligem TOTP-Code
7. Bekommt Backup-Codes (10 einmal-verwendbare Codes für Notfall-zum-Notfall-Login wenn TOTP-Gerät verloren)

### 4.5 Security-Hinweise

- Notfall-Login-URL wird **nicht im Quellcode-Repo dokumentiert** (Security-by-Obscurity-Komponente)
- Rate-Limiting: max. 5 Login-Versuche pro IP pro 15 Min, danach Captcha + Discord-Ping
- Brute-Force-Schutz: nach 10 falschen TOTP in Folge wird Notfall-Login für 24h gesperrt
- IP-Whitelisting optional konfigurierbar (z.B. nur aus Deutschland zulassen)

---

## 5. Discord-Bot — Funktionsumfang

### 5.1 Bot-Architektur

- Separater Node.js-Service mit **discord.js** (v14+)
- Läuft als eigener Docker-Container auf IONOS (Teil von docker-compose.prod.yml)
- Discord-Bot-Token: Sicher in `.env.prod`, niemals im Repo
- Bot kommuniziert mit ProzessPilot-Backend via interne REST-API + gegenseitige Webhooks
- Bot ist stateless — alle Daten bleiben in der PP-DB

### 5.2 Bot-Funktionen Übersicht

| Funktion | Aktiv ab | Beschreibung |
|---|---|---|
| Webhook-Empfang Tasks | P1.1 (KW 21) | Webapp sendet Webhook → Bot postet in #tasks-neu |
| Webhook-Empfang Alerts | P1.1 (KW 21) | Sentry/Backend sendet Webhook → Bot postet in #alerts-critical |
| Webhook-Empfang Deploys | P1.1 (KW 21) | CI/CD sendet Webhook → Bot postet in #deployment |
| Interactive Buttons (Claim) | P1.2 (KW 23) | "Übernehmen"-Button auf Task-Messages |
| Slash-Command `/task list` | P1.2 (KW 23) | Zeigt offene Tasks des aktuellen Users |
| Slash-Command `/task claim <id>` | P1.2 (KW 23) | Übernimmt Task per Command |
| Slash-Command `/tenant info <name>` | P1.2 (KW 23) | Zeigt Tenant-Stammdaten + aktueller Status |
| Customer-Chat-Bridge | P1.2 (KW 23) | Spiegelt Customer-Messages in #support-tickets (Thread pro Tenant) |
| Reply-aus-Discord | P1.2 (KW 23) | Mitarbeiter antwortet in Discord-Thread → Bot leitet an Customer-Web-Chat |
| Auto-Status-Updates | P1.2 (KW 23) | Bot postet "Task #4521 wurde von Lisa erledigt" |
| Slash-Command `/sales report` | Phase 2 | Aktuelle Vertriebs-Metriken auf Abruf |
| Voice-Channel-Aktivität-Logger | Phase 2 | Daily-Standup-Teilnahme automatisch loggen |

### 5.3 Bot-Permissions (Discord Server Settings)

Folgende Bot-Permissions werden benötigt:

- View Channels
- Send Messages
- Embed Links
- Use External Emojis
- Manage Messages (für Edit eigener Bot-Messages)
- Manage Threads (für Customer-Support-Threads)
- Use Slash Commands
- Read Message History
- Add Reactions

**Kein** Bot-Permission für Server Manage / Admin Manage / Webhook Manage — Privilege-Minimierung.

---

## 6. Task-Claim-Mechanik konkret

### 6.1 Task-Erstellung

```
1. Event passiert (z.B. OCR-Confidence < 80% bei einem Beleg)
2. Backend erstellt Task in DB:
   tasks {
     id: 4521,
     type: 'beleg_pruefen',
     tenant_id: 'mueller-bistro',
     title: 'Beleg unklar (62% Confidence)',
     description: 'Lieferant: Metro? Betrag: 127,30 €?',
     status: 'offen',
     assigned_to: NULL,
     created_at: now()
   }
3. Backend sendet Discord-Webhook an Bot:
   POST /bot/webhook/task-created
   { task_id: 4521, ... }
4. Bot postet in #tasks-neu mit Buttons
```

### 6.2 Discord-Message-Layout

```
┌────────────────────────────────────────────────┐
│ ⚠️  Task #4521 · Müller-Bistro                  │
│                                                 │
│ Beleg unklar (62% Confidence)                  │
│ Lieferant: Metro? Betrag: 127,30 €?             │
│                                                 │
│ Erstellt: vor 30 Sek                            │
│                                                 │
│ [🙋 Übernehmen]  [👁 In Webapp öffnen]          │
└────────────────────────────────────────────────┘
```

### 6.3 Übernahme-Logik (Race-Condition-sicher)

```sql
-- Bot empfängt Interaction "übernehmen" von User X
-- SQL-Logik:

UPDATE tasks
SET assigned_to = $user_id,
    status = 'in_bearbeitung',
    claimed_at = now()
WHERE id = $task_id
  AND assigned_to IS NULL
RETURNING id;

-- Wenn Zeile zurückkommt: erfolgreich übernommen
-- Wenn nichts zurückkommt: Task bereits anderweitig übernommen
```

### 6.4 Discord-Message nach erfolgreicher Übernahme

```
┌────────────────────────────────────────────────┐
│ ✓ Task #4521 · Müller-Bistro                   │
│                                                 │
│ Beleg unklar (62% Confidence)                  │
│                                                 │
│ Übernommen von: @SteveBernhardt                 │
│ Status: In Bearbeitung                          │
│                                                 │
│ [➕ Helfer einladen]  [✓ Erledigt]              │
└────────────────────────────────────────────────┘
```

### 6.5 Discord-Message wenn Übernahme fehlschlägt (Race-Condition)

Wird als **ephemeral message** (nur für den klickenden User sichtbar) gesendet:

```
❌ Task #4521 wurde bereits von @Andreas übernommen.
```

### 6.6 "Helfer einladen"

- Klick auf "➕ Helfer einladen" öffnet User-Select-Menu (Discord-Native)
- Auswählbare User: alle Mitarbeiter mit Rolle in PP-DB
- Auswahl → Bot sendet @-Mention an gewählten User in #tasks-neu:
  "@Andreas — @SteveBernhardt bittet um Hilfe bei Task #4521"

---

## 7. Customer-Chat-Bridge

### 7.1 Architektur (Variante B — eigene DB als Source of Truth)

```
[Customer im Web-Widget]
        │ HTTP/WebSocket
        ▼
[ProzessPilot Backend (IONOS EU)]
        │
        │ 1. Speichert Message in DB
        │    chat_messages { tenant_id, from: 'customer', content, ... }
        │
        │ 2. Sendet Discord-Webhook an Bot
        ▼
[ProzessPilot Discord-Bot]
        │
        │ 3. Postet/aktualisiert Thread in #support-tickets
        │    (ein Thread pro aktivem Tenant)
        ▼
[Mitarbeiter sieht im Discord-Thread]
        │
        │ 4. Mitarbeiter antwortet im Thread
        │    "Müller, das ist Metro, ich buch das."
        │
        ▼
[Discord-Bot empfängt Message-Event]
        │
        │ 5. Bot ruft Backend-API:
        │    POST /api/chat/reply { thread_id, content, mitarbeiter_id }
        │
        ▼
[ProzessPilot Backend]
        │
        │ 6. Speichert Reply in chat_messages
        │
        │ 7. Pusht via WebSocket zum Customer-Web-Widget
        ▼
[Customer sieht im Web-Widget die Antwort]
```

### 7.2 Datenfluss-Garantien

- **Customer-Daten leben in EU-DB.** Discord sieht Inhalte zwar (weil Bot postet), aber:
  - Discord ist nicht Source of Truth
  - Bei DSGVO-Lösch-Anforderung: alte Discord-Messages werden über Bot gelöscht; DB-Records werden gelöscht
- **Mitarbeiter können wahlweise Webapp oder Discord nutzen** zum Antworten — beides synchronisiert sich
- **Wenn Discord ausfällt:** Customer-Chat funktioniert weiter (Webapp-Mitarbeiter-View ist Backup)

### 7.3 Tenant-Thread-Verwaltung

- Pro Tenant wird **bei Bedarf** ein Discord-Thread in `#support-tickets` angelegt
- Thread bleibt offen solange Konversation aktiv (max. 7 Tage Discord-Standard)
- Bei Thread-Archivierung: Bot kann Thread reaktivieren bei neuer Customer-Message
- Thread-Name: `[Tenant-Kürzel] Kurzthema` z.B. `[mueller-bistro] Beleg-Klärung`

### 7.4 Magic-Link-Mechanik für Customer-Identifikation

Der Customer hat keinen Login. Stattdessen erhält er bei Bedarf einen Magic-Link via WhatsApp oder E-Mail:

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  token VARCHAR(64) UNIQUE NOT NULL,         -- random, kryptographisch sicher
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,           -- default: created_at + 14 Tage
  last_used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL
);
```

Generierungs-Trigger:

- Bei Task-Erstellung, die Customer-Aktion braucht (Beleg-Klärung, Bewirtungs-Notiz fehlt, ...)
- Bei aktiver Mitarbeiter-Aktion ("Schick dem Wirt einen Chat-Link")
- Bei Monats-Push-Mail (am 1. des Monats inkl. Chat-Link)

Versand:

- Per WhatsApp: "Hi Müller, du hast eine Frage von ProzessPilot: hier klicken: prozesspilot.net/c/Xa9Kp2..."
- Per E-Mail: Email-Template mit Link-Button

Beim Klick:

1. Backend prüft Token in `chat_sessions`
2. Wenn valid (nicht expired, nicht revoked): kurze Session mit 24h-Cookie für den Browser erstellt
3. Web-Widget öffnet, zeigt Konversations-History dieses Tenants
4. Customer kann schreiben

---

## 8. DSGVO und Drittland-Transfer

### 8.1 Discord Inc. als Subunternehmer

Discord Inc. (San Francisco, USA) wird in die Subunternehmer-Liste aufgenommen mit folgenden Eckdaten:

| Punkt | Stand |
|---|---|
| Verarbeitete Daten | Discord-User-IDs, Usernames, Server-Mitgliedschaften, Notification-Inhalte (Task-Titel, Customer-Message-Auszüge), Mitarbeiter-Login-Sessions |
| Verarbeitungs-Ort | USA |
| DSGVO-Grundlage | Art. 28 DSGVO + Standardvertragsklauseln (SCCs) für Drittland-Transfer |
| Datenschutz-Vertrag | Discord Data Processing Addendum (DPA) — bereits öffentlich verfügbar |
| Subunternehmer-Hinweis im AVV | Pflicht — Endkunde wird informiert |

### 8.2 Was Discord von Customer-Daten sieht

- **Bei Magic-Link-Customer-Chat-Bridge:** Customer-Message-Inhalt landet als Discord-Message im Thread → wird von Discord verarbeitet
- **Bei OCR-Belegen:** Discord sieht nichts (Belege werden nicht in Discord gepostet, nur Task-Hinweise)
- **Bei DSGVO-Lösch-Anfrage:** Bot löscht entsprechende Discord-Messages aus Threads

### 8.3 Hinweis im AVV / Endkundenvertrag

Der AVV (Auftragsverarbeitungsvertrag) zwischen ProzessPilot und Endkunde-Wirt muss explizit erwähnen:

> "Zur Bearbeitung von Customer-Anfragen wird Discord Inc. (USA) als Kommunikations- und Notifikations-Plattform eingesetzt. Customer-Anfragen können in pseudonymisierter Form im internen Discord-Server der ProzessPilot verarbeitet werden. Standardvertragsklauseln gemäß Art. 46 DSGVO liegen vor. Auf Wunsch kann der Endkunde dem Discord-Einsatz widersprechen; in diesem Fall wird der Customer-Support ausschließlich über die EU-basierte Webapp und E-Mail abgewickelt."

---

## 9. Sicherheits-Konzept

### 9.1 Bot-Token-Sicherheit

- Bot-Token wird ausschließlich in `.env.prod` gespeichert, niemals im Git-Repo
- Token rotation: alle 6 Monate oder bei Verdacht
- Token-Backup im Passwort-Manager (z.B. Bitwarden) der Geschäftsführer

### 9.2 OAuth-Client-Secret

- Discord OAuth Client Secret in `.env.prod`
- Niemals im Frontend-Code (nur Server-zu-Server-Calls)

### 9.3 Session-Management

- JWT-Tokens mit kurzer Lebensdauer (24h für Discord-Login, 4h für Notfall-Login)
- Refresh-Token-Mechanik optional (für Phase 2, "remember me")
- HttpOnly + Secure + SameSite=Strict Cookies

### 9.4 Audit-Log

Alle relevanten Events werden in `audit_log` Tabelle persistiert:

- Login (mit Methode: discord / emergency)
- Logout
- Notfall-Login (mit IP, User-Agent, Discord-Channel-Notification)
- Task-Übernahme
- Tenant-Modul-Toggles
- Mitarbeiter-Rolle-Änderungen

Aufbewahrungs-Dauer: 12 Monate.

---

## 10. Implementations-Reihenfolge

### 10.1 KW 21 (Pilot-Vorbereitung)

1. Discord-Server angelegt + Channel-Struktur
2. Discord-OAuth-App registriert
3. Mitarbeiter-Webapp Login via Discord OAuth implementiert
4. Webhook-Endpoints für Tasks/Alerts/Deploys konfiguriert
5. Sentry-Discord-Webhook eingerichtet
6. Steve + Andreas können sich via Discord einloggen

### 10.2 KW 22–23 (P1.1 läuft, Bot-Entwicklung parallel)

7. Discord-Bot in Node.js mit discord.js initialisiert
8. Bot deployed auf IONOS als eigener Docker-Container
9. Slash-Commands `/task list`, `/task claim`, `/tenant info` implementiert
10. Interactive Buttons für Task-Claim implementiert
11. Customer-Chat-Bridge implementiert (Webhook-Empfang + Thread-Management)

### 10.3 KW 23 (Pilot-Start P1.2)

12. Bot ist vollständig live
13. Customer-Web-Chat-Widget ist live (siehe separate Spec)
14. Erste echte Customer-Bridge-Tests mit Pilot-Wirt
15. Notfall-Login-Endpunkt implementiert + TOTP-Setup für Steve und Andreas

### 10.4 Phase 2 (nach Pilot-Validierung)

16. Weitere Slash-Commands nach Bedarf
17. Erweiterte Reporting-Bots (Auto-Daily, Auto-Weekly)
18. Voice-Channel-Activity-Logger
19. Eventuell: Integration mit anderen Tools (Linear, GitHub, etc.)

---

## 11. Risiken und Mitigation

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| Discord-Ausfall blockiert Mitarbeiter-Login | mittel (1–2× pro Jahr) | Notfall-Login für Geschäftsführer, Webapp-Funktionen funktionieren bei eingeloggten Sessions weiter |
| Bot-Token kompromittiert | niedrig | Token-Rotation, Audit-Log, Discord-Server-Audit-Log überprüfbar |
| Customer-Daten in Discord-Channels = DSGVO-Risiko | niedrig wegen Variante B | EU-DB ist Source of Truth, Discord ist Spiegelung, DPA + SCCs vorliegen |
| Discord ändert Bot-API breaking | mittel | discord.js Library wird gepflegt, Updates regelmäßig einspielen |
| Skalierung über 50 Mitarbeiter | niedrig in Pilot-Phase | bei Bedarf Migration auf Mattermost (self-hosted EU) oder Slack |
| Mitarbeiter verlässt Team / Bot-Zugriff entfernen | hoch (laufend) | User-Deaktivierung in PP-DB + Discord-Server-Kick + Audit |

---

## 12. Zusammenfassung in einem Absatz

ProzessPilot nutzt Discord als zentralen Mitarbeiter-Kommunikations- und Notifikations-Kanal. Mitarbeiter loggen sich via Discord OAuth in die Webapp ein; Geschäftsführer haben zusätzlich einen Notfall-Login mit TOTP. Discord-Webhooks (ab KW 21) und ein eigener Discord-Bot mit Buttons + Slash-Commands (ab KW 23) ermöglichen One-Click-Task-Übernahme, Fehler-Alarme und Customer-Chat-Bridge. Customer-Daten bleiben in der ProzessPilot-EU-Datenbank (Variante B), Discord ist nur Notification + Mitarbeiter-Komfort-Layer. Discord Inc. wird als Subunternehmer mit Standardvertragsklauseln im AVV genannt; Endkunde kann widersprechen. Skalierungs-tauglich bis ~10–15 Mitarbeiter, danach Migrations-Option zu Mattermost / Slack.

---

**Letzte Aktualisierung:** 2026-05-15
**Verantwortlich:** Andreas (Implementierung), Steve (Vertragliches + Discord-Server-Admin)
