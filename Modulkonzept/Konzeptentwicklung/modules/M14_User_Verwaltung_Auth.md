# M14 — User-Verwaltung & Authentifizierung

> **Status (2026-05-15):** Komplett neu konzipiert nach Konzept-Reboot. Alte Version (Tenant-Customer-Auth) verworfen, weil Endkunden im neuen Konzept keinen Login mehr haben.
> **Code-Zielort:** `backend/src/modules/m14-auth/`, `backend/src/core/auth/`, `webapp-internal/src/auth/`
> **Migration:** `020_users_auth.sql` (Audit-Finding F13: Spec hatte fälschlicherweise `031_users_auth.sql` angegeben — real existiert `backend/migrations/020_users_auth.sql`)
> **Paket:** alle (Pflicht-Modul, jeder Mitarbeiter braucht es)
> **Vorausgesetzt durch:** Mitarbeiter-Webapp, Discord-Integration

---

## 1. Zweck

Authentifizierung der **ProzessPilot-internen Mitarbeiter** (Steve, Andreas, zukünftige Mitarbeiter) für die Mitarbeiter-Webapp. Endkunden (Wirte) haben **keinen** klassischen Login — sie nutzen Magic-Link-Tokens (siehe `Web_Chat_Widget.md` und `Onboarding_Wizard.md`).

### 1.1 Was sich gegenüber der alten Spec geändert hat

| Bereich | Alt (vor 2026-05-15) | Neu |
|---|---|---|
| Zielgruppe | Tenant-Customer-User (1 User → 1 Tenant) | ProzessPilot-Mitarbeiter (1 User → alle Tenants) |
| Login-Mechanismus | Email + Passwort | **Discord OAuth 2.0** + Notfall-Login mit TOTP |
| Token-Storage | JWT in HttpOnly-Cookie | gleich, aber Discord-Token-Refresh via OAuth |
| Multi-Tenant | 1 User → 1 Tenant | Mitarbeiter haben Zugriff auf **alle** Tenants gemäß Rolle |
| Rollen | super_admin / admin / operator / viewer | **geschaeftsfuehrer / mitarbeiter / support** |
| MFA | nicht in V1 | **TOTP für Notfall-Login zwingend** (für Geschäftsführer) |

---

## 2. Architektur-Entscheidungen (verbindlich)

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Standard-Login | Discord OAuth 2.0 | Einfach für Mitarbeiter (haben eh Discord), kein Passwort-Mgmt nötig |
| Notfall-Login | Email + Argon2id-Passwort + TOTP | Falls Discord ausfällt, müssen Geschäftsführer ins System können |
| Wer hat Notfall-Login | Nur Rolle `geschaeftsfuehrer` | Mitarbeiter und Support müssen warten oder GF ansprechen |
| Auth-Token-Format | JWT (HS256, eigener Secret) | Stateless, schnell zu validieren |
| Access-Token-Lebensdauer | 24h bei Discord-Login, 4h bei Notfall-Login | Discord = bequem, Notfall = sicherheitskritisch |
| Refresh-Token | nicht nötig — Discord OAuth-Refresh wird genutzt | Reduziert Komplexität |
| Token-Storage | HttpOnly + Secure + SameSite=Strict Cookie | XSS-Schutz |
| MFA-Zwang | TOTP zwingend für Notfall-Login | Sonst zu unsicher |
| Customer-Login | **kein klassischer Login**, Magic-Link mit DB-Token | Customer haben keine Accounts |

---

## 3. Datenmodell

### 3.1 Tabelle `users`

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Discord-Identität (Standard-Login)
  discord_user_id VARCHAR(20) UNIQUE,             -- Discord User-Snowflake
  discord_username VARCHAR(80),                    -- Discord-Username für Anzeige
  discord_avatar_url TEXT,                         -- Avatar-URL aus Discord
  discord_access_token_encrypted BYTEA,            -- für Avatar-Refresh + Server-Mitgliedschaft-Check
  discord_refresh_token_encrypted BYTEA,
  discord_token_expires_at TIMESTAMPTZ,

  -- Anzeige
  display_name VARCHAR(80) NOT NULL,               -- "Steve Bernhardt", "Andreas Mustermann"

  -- Rolle
  role VARCHAR(30) NOT NULL,                       -- 'geschaeftsfuehrer' / 'mitarbeiter' / 'support'

  -- Notfall-Login (nur für Geschäftsführer)
  emergency_email VARCHAR(255) NULL,               -- separate Mail für Notfall (idealerweise andere als Discord-Mail)
  emergency_password_hash VARCHAR(255) NULL,       -- Argon2id-Hash
  emergency_totp_secret VARCHAR(60) NULL,          -- Base32-encoded TOTP-Secret
  emergency_backup_codes JSONB NULL,               -- 10 einmal-verwendbare Codes als Hashes

  -- Status
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_login_at TIMESTAMPTZ NULL,
  last_login_method VARCHAR(20) NULL,              -- 'discord' / 'emergency'
  last_login_ip INET NULL,

  -- UI-Vorlieben
  preferences JSONB DEFAULT '{}'                   -- Theme, Default-View, etc.
);

CREATE INDEX idx_users_discord_id ON users(discord_user_id) WHERE active = true;
CREATE INDEX idx_users_emergency_email ON users(emergency_email) WHERE emergency_email IS NOT NULL;
```

### 3.2 Tabelle `auth_sessions`

```sql
CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  jwt_jti VARCHAR(40) UNIQUE NOT NULL,             -- JWT-ID für Revocation
  login_method VARCHAR(20) NOT NULL,               -- 'discord' / 'emergency'
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoke_reason VARCHAR(50) NULL                   -- 'logout' / 'admin_revoke' / 'security_concern'
);

CREATE INDEX idx_auth_sessions_jti ON auth_sessions(jwt_jti);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id, expires_at);
```

### 3.3 Tabelle `auth_audit_log`

```sql
CREATE TABLE auth_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(40) NOT NULL,                 -- 'login_success' / 'login_failed' / 'logout' / 'emergency_login' / ...
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,                                   -- z.B. Fehlerursache bei login_failed
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_auth_audit_user ON auth_audit_log(user_id, created_at);
CREATE INDEX idx_auth_audit_event ON auth_audit_log(event_type, created_at);
```

### 3.4 Bootstrapping (kein Default-User in der Migration)

Aus Sicherheitsgründen werden keine Default-User in der Migration angelegt. Stattdessen:

```bash
# CLI-Command nach Migration:
npm run bootstrap:first-admin
```

Dieser Command fragt interaktiv nach:
- Discord-Username (Steve gibt seinen ein)
- Display-Name
- Notfall-Email
- Notfall-Passwort (mind. 16 Zeichen)
- TOTP-Setup (QR-Code wird generiert, in Authenticator-App scannen)

Erstellt einen Geschäftsführer-Eintrag.

---

## 4. Discord-OAuth-Flow (Standard-Login)

### 4.1 Setup bei Discord Developer Portal

- Application "ProzessPilot Admin" registriert
- OAuth-Redirect-URI: `https://admin.prozesspilot.net/auth/discord/callback`
- Scopes: `identify`, `guilds` (kein Mail, keine Server-Manage-Rechte)
- Client-Secret in `.env.prod`

### 4.2 Flow-Diagramm

```
1. Mitarbeiter geht zu admin.prozesspilot.net
   → Frontend zeigt "Mit Discord anmelden"-Button

2. Klick auf Button → Frontend ruft GET /api/auth/discord/start
   → Backend generiert state-Token (CSRF-Schutz), speichert in Redis (TTL 5 Min)
   → Redirect-URL zu Discord:
     https://discord.com/api/oauth2/authorize?
       client_id=<CLIENT_ID>&
       response_type=code&
       redirect_uri=<URL>&
       scope=identify guilds&
       state=<state-token>

3. Discord zeigt Berechtigungs-Dialog
   → Mitarbeiter bestätigt
   → Discord redirected zu admin.prozesspilot.net/auth/discord/callback?code=<code>&state=<state>

4. Frontend ruft POST /api/auth/discord/callback mit { code, state }

5. Backend:
   a. Validiert state-Token (CSRF-Schutz)
   b. Tauscht code gegen access-Token bei Discord:
      POST https://discord.com/api/oauth2/token
   c. Holt User-Info bei Discord: GET /api/users/@me
      → discord_user_id, discord_username, discord_avatar
   d. Holt Server-Mitgliedschaft: GET /api/users/@me/guilds
      → prüft ob ProzessPilot-Team-Server (Guild-ID) drin ist
   e. Wenn nicht: 403 "Du bist nicht im ProzessPilot-Team-Server"
   f. Wenn ja: User in DB suchen oder anlegen-Hinweis
      - Existiert User mit dieser discord_user_id? → Login
      - Existiert nicht? → 403 "Account nicht autorisiert. Kontaktiere Geschäftsführer"
   g. Discord-Tokens verschlüsselt in users.discord_*_token_encrypted speichern
   h. JWT generieren (24h Lebensdauer)
   i. auth_sessions-Eintrag erstellen
   j. auth_audit_log-Eintrag 'login_success'
   k. JWT als HttpOnly + Secure + SameSite=Strict Cookie setzen

6. Frontend lädt Dashboard
```

### 4.3 Wenn Discord-Server-Mitgliedschaft fehlt

- 403-Response mit Hinweis "Du bist nicht im ProzessPilot-Team-Server. Bitte Steve oder Andreas um Invite-Link"
- auth_audit_log-Eintrag 'login_failed_no_server'

### 4.4 Wenn DB-User nicht existiert

- 403-Response mit Hinweis "Dein Discord-Account ist im Server, aber nicht autorisiert"
- auth_audit_log-Eintrag 'login_failed_no_user'

### 4.5 Permission-Auto-Refresh

- Bei jedem API-Call wird Discord-Server-Mitgliedschaft alle 24h einmal geprüft
- Wenn Mitarbeiter aus Discord-Server entfernt wurde → Session sofort revoziert
- Hintergrund: ehemaligen Mitarbeitern wird der Zugriff automatisch entzogen

---

## 5. Notfall-Login mit TOTP

### 5.1 Setup-Flow (einmalig pro Geschäftsführer)

1. Geschäftsführer ist regulär via Discord eingeloggt
2. Geht zu `admin.prozesspilot.net/settings/notfall-login`
3. Klickt "Notfall-Login einrichten"
4. Setzt Email (idealerweise nicht Discord-Email, separat)
5. Setzt Passwort (Validierung: mind. 16 Zeichen, mind. 1 Großbuchstabe + 1 Zahl + 1 Sonderzeichen)
6. Backend generiert TOTP-Secret + zeigt QR-Code
7. Geschäftsführer scannt mit Authenticator-App (Google Authenticator / Authy / 1Password)
8. Bestätigt mit einmaligem TOTP-Code
9. Backend speichert: `emergency_email`, `emergency_password_hash` (Argon2id), `emergency_totp_secret`
10. Backend zeigt 10 Backup-Codes (einmalig)
11. Geschäftsführer speichert Backup-Codes in Passwort-Manager

### 5.2 Notfall-Login-Flow

```
1. Discord ist down (oder Mitarbeiter ist ausgesperrt)
2. Geschäftsführer geht zu admin.prozesspilot.net/emergency-login
   → Diese URL ist NICHT im normalen UI verlinkt (Security-by-Obscurity)
3. Eingabe-Felder: Email + Passwort + TOTP-Code (oder Backup-Code)
4. Klick "Anmelden"
5. Frontend ruft POST /api/auth/emergency-login
6. Backend:
   a. User suchen via emergency_email
   b. Prüfen: User existiert + active + role = 'geschaeftsfuehrer'?
   c. Passwort gegen emergency_password_hash mit Argon2id verifizieren
   d. TOTP-Code prüfen (innerhalb ±30 Sek-Fenster)
      ODER Backup-Code prüfen + Backup-Code als verwendet markieren
   e. Wenn alles OK:
      - JWT generieren (4h Lebensdauer, NICHT 24h wie Discord)
      - Session erstellen mit login_method='emergency'
      - auth_audit_log-Eintrag 'emergency_login_success'
      - Discord-Notification an alle anderen Geschäftsführer in #alerts-critical
      - Wenn Discord nicht erreichbar: Email-Alert an alternative Mail-Adressen
   f. Bei Fehler:
      - auth_audit_log-Eintrag 'emergency_login_failed'
      - Rate-Limit prüfen (siehe 5.4)
```

### 5.3 Backup-Codes

- 10 Codes bei Setup generiert
- Jeder Code ist 12 Zeichen alphanumerisch
- Werden Argon2id-gehasht in DB gespeichert
- Bei Verwendung: Code wird auf "verwendet" gesetzt, kann nicht erneut genutzt werden
- Bei < 3 verbleibenden Codes: Warnung im UI

### 5.4 Brute-Force-Schutz

- Max. 5 Login-Versuche pro IP pro 15 Min, danach Captcha + 1h-Sperre
- Max. 10 falsche TOTP-Codes in Folge → Notfall-Login für diesen User für 24h gesperrt
- Sperre wird in Redis getrackt
- Nach Sperre: nur Geschäftsführer (anderer) kann manuell entsperren

### 5.5 Optional: IP-Whitelisting

- In `users.preferences` kann eine IP-Whitelist hinterlegt werden
- Bei aktiver Whitelist: Notfall-Login nur aus diesen IPs möglich
- Empfehlung: nur aus Deutschland zulassen (`/de/`-CIDR)

---

## 6. Rollen-Modell

| Rolle | Zugriff | Wer hat sie |
|---|---|---|
| `geschaeftsfuehrer` | Alle Funktionen + Notfall-Login + Mitarbeiter-Verwaltung + Provisions-Übersicht + System-Settings | Steve, Andreas |
| `mitarbeiter` | Tenant-Read + begrenzte Edits + Tasks + Beleg-Korrektur + Customer-Chat | zukünftige Festangestellte |
| `support` | Tasks (eigene + zugewiesene) + Customer-Chat + Beleg-Korrektur. Keine Tenant-Settings, keine Provisions. | externe Support-Kräfte (Phase 2+) |

### 6.1 Permission-Matrix

| Bereich | geschaeftsfuehrer | mitarbeiter | support |
|---|---|---|---|
| Tenants lesen | ✓ | ✓ | nur zugewiesene |
| Tenants Settings ändern | ✓ | ✗ | ✗ |
| Tenant anlegen / löschen | ✓ | ✗ | ✗ |
| Tasks: eigene | ✓ | ✓ | ✓ |
| Tasks: alle sehen | ✓ | ✓ | ✗ |
| Tasks: anderen zuweisen | ✓ | ✓ | ✗ |
| Beleg-Korrektur | ✓ | ✓ | ✓ |
| Customer-Chat | ✓ | ✓ | ✓ |
| Provisions-Übersicht | ✓ | ✗ | ✗ |
| Mitarbeiter-Verwaltung | ✓ | ✗ | ✗ |
| System-Settings | ✓ | ✗ | ✗ |
| Notfall-Login | ✓ | ✗ | ✗ |
| Audit-Log einsehen | ✓ | nur eigenes | nur eigenes |

### 6.2 Implementierung (Backend-Middleware)

```typescript
// requireRole-Middleware
export function requireRole(allowedRoles: Role[]) {
  return (req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      reply.status(403).send({ error: 'forbidden', required: allowedRoles });
      return;
    }
    done();
  };
}

// Beispiel-Verwendung
fastify.post('/api/tenants', { preHandler: requireRole(['geschaeftsfuehrer']) }, ...);
fastify.put('/api/tenants/:id/settings', { preHandler: requireRole(['geschaeftsfuehrer']) }, ...);
fastify.get('/api/tasks', { preHandler: requireRole(['geschaeftsfuehrer', 'mitarbeiter', 'support']) }, ...);
```

---

## 7. Customer-Authentifizierung (Magic-Link)

Endkunden haben **keinen** klassischen Login. Stattdessen Magic-Link-Tokens für:

- Onboarding-Wizard (siehe `Onboarding_Wizard.md`)
- Web-Chat-Widget (siehe `Web_Chat_Widget.md`)

### 7.1 Token-Generierung

- Random 32 Zeichen Base64URL (192 Bit Entropie)
- Tenant-gebunden in DB-Tabelle (z.B. `chat_sessions`, `onboarding_sessions`)
- Lebensdauer: 14 Tage (Chat) bzw. 30 Tage (Wizard)

### 7.2 Token-Validierung

```typescript
async function validateMagicToken(token: string, tableName: string) {
  const session = await db.query(
    `SELECT id, tenant_id, expires_at, revoked_at FROM ${tableName} WHERE token = $1`,
    [token]
  );

  if (!session.rows[0]) throw new Error('invalid_token');
  if (session.rows[0].revoked_at) throw new Error('revoked_token');
  if (session.rows[0].expires_at < new Date()) throw new Error('expired_token');

  // Update last_used_at
  await db.query(
    `UPDATE ${tableName} SET last_used_at = now() WHERE id = $1`,
    [session.rows[0].id]
  );

  return session.rows[0];
}
```

### 7.3 Browser-Session nach Klick

- HttpOnly + Secure Cookie mit kurzlebigem Session-Token (24h)
- Gebunden an Tenant-ID
- Erlaubt nur Zugriff auf Tenant-eigene Daten

---

## 8. API-Endpoints

| Methode | Pfad | Zweck | Auth |
|---|---|---|---|
| GET | /api/auth/discord/start | OAuth-Flow initiieren | öffentlich |
| POST | /api/auth/discord/callback | OAuth-Callback verarbeiten | öffentlich |
| POST | /api/auth/emergency-login | Notfall-Login | öffentlich (mit Rate-Limit) |
| POST | /api/auth/logout | Session beenden | eingeloggt |
| GET | /api/auth/me | aktueller User | eingeloggt |
| POST | /api/auth/notfall-setup/init | TOTP-QR generieren | geschaeftsfuehrer |
| POST | /api/auth/notfall-setup/verify | TOTP-Code bestätigen | geschaeftsfuehrer |
| GET | /api/auth/sessions | eigene aktive Sessions | eingeloggt |
| DELETE | /api/auth/sessions/:id | Session revozieren | eingeloggt (eigene) oder geschaeftsfuehrer (alle) |
| GET | /api/users | Mitarbeiter-Liste | geschaeftsfuehrer |
| POST | /api/users | neuen Mitarbeiter anlegen | geschaeftsfuehrer |
| PUT | /api/users/:id | Mitarbeiter ändern | geschaeftsfuehrer |
| DELETE | /api/users/:id | Mitarbeiter deaktivieren | geschaeftsfuehrer |

---

## 9. Sicherheits-Best-Practices

### 9.1 JWT-Konfiguration

- Algorithmus: **HS256** (HMAC mit Shared-Secret)
- Secret: 64+ Zeichen, in `.env.prod`
- Claims:
  - `sub` = user_id
  - `role` = Rolle
  - `display_name`
  - `discord_user_id`
  - `iat` (issued at)
  - `exp` (expiry)
  - `jti` (JWT-ID, für Revocation-Check in DB)

### 9.2 Cookie-Konfiguration

```typescript
reply.setCookie('pp_auth', jwt, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
  maxAge: 24 * 60 * 60, // Sekunden
  domain: '.prozesspilot.net'
});
```

### 9.3 Token-Revocation

- Bei jedem API-Call: JWT-Signature prüfen + JTI gegen `auth_sessions.revoked_at` prüfen
- Wenn revoziert: 401 + Cookie löschen
- Performance: Redis-Cache für aktive JTIs (TTL = JWT-Lebensdauer)

### 9.4 Logout

- POST /api/auth/logout
- `auth_sessions.revoked_at = now()`, `revoke_reason = 'logout'`
- Cookie wird geleert
- Discord-Token NICHT widerrufen (kann anders genutzt sein)

### 9.5 Mitarbeiter-Deaktivierung

- `users.active = false`
- Alle aktiven Sessions revoziert
- Bei Discord-Login-Versuch: 403
- Notfall-Login: 403
- Discord-Server-Kick durch Geschäftsführer (manuell)

---

## 10. Tests

### 10.1 Unit-Tests

- TOTP-Code-Verifikation (verschiedene Zeitversätze)
- Argon2id-Hashing
- JWT-Generierung + Validation
- State-Token-CSRF-Schutz

### 10.2 Integration-Tests

- Voller Discord-OAuth-Flow mit gemocktem Discord-API
- Voller Notfall-Login-Flow inkl. TOTP
- Brute-Force-Sperre triggern
- Session-Revocation
- Logout
- User-Deaktivierung

### 10.3 Security-Tests

- SQL-Injection-Versuche auf allen Auth-Endpoints
- XSS-Versuche im display_name
- Token-Replay-Versuche
- Discord-State-Token-Manipulation

---

## 11. Implementations-Reihenfolge

### 11.1 P1.1 (KW 21)

- DB-Migration `020_users_auth.sql` (real existierender Name — Spec hatte fälschlicherweise `031_users_auth.sql`)
- Bootstrap-Command für ersten Geschäftsführer
- Discord-OAuth-Flow Backend + Frontend
- JWT-Generierung + Cookie-Mgmt
- requireRole-Middleware

### 11.2 P1.2 (KW 23)

- Notfall-Login-Setup-Flow
- TOTP-Verifikation
- Backup-Codes
- Brute-Force-Schutz

### 11.3 Phase 2

- IP-Whitelisting für Notfall-Login
- Erweiterte Audit-Log-Reports
- Session-Manager-UI

---

## 12. Bezug zu anderen Dokumenten

- `Discord_Integration.md` — OAuth-App-Setup, Server-Mitgliedschaft-Check
- `Mitarbeiter_Webapp.md` — Auth-Frontend, Login-Page, Settings
- `Web_Chat_Widget.md` — Customer-Magic-Link-System (kein klassischer Login)
- `Onboarding_Wizard.md` — Customer-Magic-Link-System (Wizard)

---

## 13. Was bewusst nicht in M14 ist

- **Email + Passwort als Standard-Login** — nur als Notfall, nicht als Default
- **Customer-Login** — Wirte nutzen Magic-Link
- **MFA für reguläre Mitarbeiter** — Discord-2FA reicht (Discord erzwingt es schon bei Bedarf)
- **SAML / SSO mit Unternehmens-Tools** — irrelevant für unsere Größe
- **Public-API-Token für Drittanbieter** — kein API-Marketplace

---

## 14. Zusammenfassung in einem Absatz

M14 ersetzt den alten Tenant-Customer-Auth-Ansatz durch ein neues Mitarbeiter-zentriertes Modell. Standard-Login: Discord OAuth 2.0 (Mitarbeiter loggt sich mit seinem Discord-Account in admin.prozesspilot.net ein, Server-Mitgliedschaft im ProzessPilot-Team-Server wird geprüft). Notfall-Login: Email + Argon2id-Passwort + TOTP, nur für Geschäftsführer (Steve, Andreas). Drei Rollen: geschaeftsfuehrer / mitarbeiter / support mit klarem Permission-Matrix. Customer (Wirte) haben keinen Login — sie nutzen Magic-Link-Tokens für Wizard und Web-Chat. JWT-basiert mit HttpOnly-Cookies, Brute-Force-Schutz, Session-Revocation via Redis-Cache. Audit-Log für alle Auth-Events. Bootstrap via CLI-Command für ersten Geschäftsführer.

---

**Letzte Aktualisierung:** 2026-05-15 (komplett neu nach Konzept-Reboot)
**Verantwortlich:** Andreas (Backend), Steve (Frontend + Notfall-Login-Setup)
