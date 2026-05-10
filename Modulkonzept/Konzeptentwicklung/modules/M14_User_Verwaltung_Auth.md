# M14 — User-Verwaltung & Authentifizierung

> **Status (2026-05-07):** ⬜ noch nicht implementiert.
> **Code-Zielort:** `backend/src/modules/users/`, `backend/src/core/auth/`, `webapp/src/pages/UsersPage.tsx`, `webapp/src/auth/`
> **Migration:** `031_users_auth.sql`
> **Paket:** alle (jeder Tenant braucht User-Login)
> **Vorausgesetzt durch:** Server-Deployment, erster Pilotkunde

---

## 1. Zweck

Echte Authentifizierung statt aktuellem Tenant-Select-Platzhalter, und Möglichkeit für Admins, weitere Admins/Operatoren/Viewer im eigenen Tenant anzulegen und mit feingranularen Berechtigungen auszustatten.

Aktueller Zustand:
- `webapp/src/auth/AuthContext.tsx` speichert nur Tenant-ID in sessionStorage
- `webapp/src/pages/LoginPage.tsx` hat ein Tenant-Dropdown ohne Passwort
- Backend hat **keinen** Login-Endpoint, **keine** `users`-Tabelle
- Backend-`core/auth/` enthält nur HMAC für Service-zu-Service-Auth

Dieser Spec ersetzt diesen Platzhalter durch ein vollständiges Auth-System.

## 2. Architektur-Entscheidungen (verbindlich)

| Bereich           | Entscheidung                                                     | Begründung                                          |
|-------------------|------------------------------------------------------------------|-----------------------------------------------------|
| Auth-Mechanismus  | JWT Access-Token (15 min) + Refresh-Token (30 Tage)              | Stateless, sicher, modern; Refresh-Token in DB → revocable |
| Token-Storage     | Access-Token: Memory; Refresh-Token: HttpOnly + Secure Cookie    | XSS-Schutz für Refresh, Access-Token nie persistiert |
| Multi-Tenant      | 1 User → 1 Tenant                                                | Hält Berechtigungs-Logik einfach, super_admin global |
| Rollen-Modell     | Permission-basiert (granular)                                    | Maximal flexibel, Presets als Komfort-Schicht       |
| Password-Hashing  | argon2id (Node-Lib `argon2`)                                     | Aktueller Stand der Technik (besser als bcrypt)     |
| User-Anlage       | Admin setzt temporäres Passwort, User muss bei erstem Login wechseln | Funktioniert ohne Mail-Server, Passwort-Übergabe out-of-band |
| MFA               | Nicht in V1 (Spec-Erweiterung später)                            | Spätere optionale Erweiterung                       |

## 3. Permission-Modell

### 3.1 Format

Permission = String im Format `<resource>.<action>` oder `<resource>.<action>.<scope>`.

Beispiele:
- `receipts.read` — alle Belege im eigenen Tenant lesen
- `receipts.write` — Belege bearbeiten, Re-Run, manuelle Korrektur
- `receipts.delete` — Belege löschen (DSGVO)
- `users.manage` — andere User im Tenant anlegen/ändern/löschen
- `settings.edit` — Tenant-Einstellungen + Integrationen ändern
- `plugins.install` — Custom-Plugins für Tenant installieren
- `*` — Wildcard, **nur für super_admin**

### 3.2 Standard-Resources

| Resource    | Aktionen                       | Bemerkung                                            |
|-------------|--------------------------------|------------------------------------------------------|
| `receipts`  | read, write, delete, export    | Belege                                               |
| `customers` | read, write, delete            | Kunden des Tenants (nicht zu verwechseln mit Tenants)|
| `users`     | read, manage                   | User-Liste sehen / verwalten                         |
| `settings`  | read, edit                     | Tenant-Settings, Integrationen                       |
| `plugins`   | read, install, configure       | Plugin-System (Pro)                                  |
| `reports`   | read, export                   | M08-Reports                                          |
| `dsgvo`     | read, execute                  | DSGVO-Anfragen (M12) — bewusst restriktiv            |
| `audit`     | read                           | Audit-Log einsehen                                   |
| `*`         | (alle)                         | Wildcard, super_admin                                |

### 3.3 Presets (UI-Komfort)

Im Frontend wählt der Admin ein Preset, dahinter steht eine konkrete Permission-Liste:

```typescript
const PRESETS = {
  super_admin: ['*'],
  admin:       ['receipts.*', 'customers.*', 'users.manage', 'settings.edit', 'plugins.*', 'reports.*', 'dsgvo.execute', 'audit.read'],
  operator:    ['receipts.read', 'receipts.write', 'customers.read', 'reports.read'],
  viewer:      ['receipts.read', 'customers.read', 'reports.read', 'audit.read'],
};
```

Permissions werden im DB-Feld als JSONB-Array gespeichert. Wildcard-Expansion (`receipts.*`) passiert beim Permission-Check zur Laufzeit.

### 3.4 super_admin

Genau **eine Rolle** ist tenant-übergreifend: `super_admin`. Diese User haben `tenant_id IS NULL` und `permissions = ["*"]`. Sie sind nur per direkten DB-Eintrag oder durch andere super_admins anlegbar.

Initial-super_admin wird per Migration / ENV-Variable angelegt (Bootstrapping).

## 4. Datenmodell (Migration 031_users_auth.sql)

```sql
-- ─────────────────────────────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id              TEXT PRIMARY KEY,                                   -- ULID, prefix "usr_"
    tenant_id       TEXT REFERENCES tenants(id) ON DELETE CASCADE,      -- NULL für super_admin
    email           TEXT NOT NULL,
    email_lower     TEXT NOT NULL,                                      -- für UNIQUE-Index, immer .toLowerCase()
    display_name    TEXT NOT NULL,
    password_hash   TEXT NOT NULL,                                      -- argon2id
    password_must_change BOOLEAN NOT NULL DEFAULT false,                -- bei temp-Passwort gesetzt
    permissions     JSONB NOT NULL DEFAULT '[]'::jsonb,                 -- ["receipts.read", ...]
    preset          TEXT,                                               -- 'super_admin' | 'admin' | 'operator' | 'viewer' | 'custom'
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,                                        -- bei zu vielen failed attempts
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      TEXT REFERENCES users(id),                          -- wer hat den User angelegt?

    -- Eindeutigkeit pro Tenant
    UNIQUE (tenant_id, email_lower)
);

CREATE INDEX idx_users_tenant ON users(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_users_email  ON users(email_lower);

-- Row-Level-Security: User sehen nur Tenant-eigene User (außer super_admin)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id = current_setting('pp.tenant_id', true) OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────
-- Refresh-Tokens (revocable Sessions)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
    id              TEXT PRIMARY KEY,                                   -- ULID, prefix "rft_"
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,                                      -- sha256 des plain-Tokens, nie plain speichern!
    family_id       TEXT NOT NULL,                                      -- Refresh-Token-Familie für Replay-Detection
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,                                        -- NULL = aktiv
    revoke_reason   TEXT,                                               -- 'logout' | 'rotation' | 'replay_detected' | 'admin_revoke'
    user_agent      TEXT,
    ip_address      INET
);

CREATE INDEX idx_refresh_user      ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_token     ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_expiring  ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- Auth-Audit (separat von audit_log, weil hochfrequent)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE auth_events (
    id              TEXT PRIMARY KEY,                                   -- ULID
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,       -- NULL bei failed login
    tenant_id       TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,                                      -- 'login_success' | 'login_failed' | 'logout' | 'password_changed' | 'user_created' | 'user_updated' | 'user_deleted' | 'permission_denied' | 'account_locked'
    email_attempted TEXT,                                               -- bei failed login: was wurde eingegeben
    ip_address      INET,
    user_agent      TEXT,
    details         JSONB                                               -- z. B. { "permission_denied": "users.manage" }
);

CREATE INDEX idx_auth_events_user_time ON auth_events(user_id, occurred_at DESC);
CREATE INDEX idx_auth_events_failed    ON auth_events(occurred_at DESC) WHERE event_type = 'login_failed';

-- ─────────────────────────────────────────────────────────────────────
-- Bootstrap: ersten super_admin anlegen
-- ─────────────────────────────────────────────────────────────────────
-- Wird in 031b_bootstrap_super_admin.sql gemacht (per Migration), liest aus
-- ENV-Variablen INITIAL_SUPER_ADMIN_EMAIL + INITIAL_SUPER_ADMIN_PASSWORD_HASH.
-- Hash wird vorher mit `npm run gen-password-hash` erzeugt.
```

## 5. Backend-Implementierung

### 5.1 Datei-Struktur

```
backend/src/
├── core/auth/
│   ├── hmac.ts                       (existiert)
│   ├── hmac.middleware.ts            (existiert)
│   ├── jwt.ts                        (NEU — JWT erzeugen + verifizieren)
│   ├── jwt.middleware.ts             (NEU — Request-Auth)
│   ├── password.ts                   (NEU — argon2 hash + verify)
│   ├── permissions.ts                (NEU — Permission-Check + Wildcard-Expand)
│   ├── jwt.test.ts
│   ├── password.test.ts
│   └── permissions.test.ts
│
└── modules/users/
    ├── routes.ts                      (NEU)
    ├── handlers/
    │   ├── login.handler.ts           (POST /auth/login)
    │   ├── refresh.handler.ts         (POST /auth/refresh)
    │   ├── logout.handler.ts          (POST /auth/logout)
    │   ├── me.handler.ts              (GET /auth/me)
    │   ├── change-password.handler.ts (POST /auth/change-password)
    │   ├── list-users.handler.ts      (GET /users)
    │   ├── create-user.handler.ts     (POST /users)
    │   ├── update-user.handler.ts     (PATCH /users/:id)
    │   ├── delete-user.handler.ts     (DELETE /users/:id)
    │   └── reset-user-password.handler.ts (POST /users/:id/reset-password)
    ├── services/
    │   ├── user.repository.ts
    │   ├── refresh-token.repository.ts
    │   ├── auth-event.logger.ts
    │   └── lockout.service.ts        (failed-attempts-Tracking)
    ├── schemas/
    │   ├── login.schema.ts
    │   ├── user.schema.ts
    │   └── permissions.schema.ts
    └── tests/
        ├── login.test.ts
        ├── permissions.test.ts
        ├── lockout.test.ts
        └── e2e.test.ts
```

### 5.2 Endpoints

| Methode | Pfad                                  | Auth          | Permission-Check         | Zweck                                   |
|---------|---------------------------------------|---------------|--------------------------|-----------------------------------------|
| POST    | `/api/v1/auth/login`                  | —             | —                        | Email + Password → Tokens               |
| POST    | `/api/v1/auth/refresh`                | Refresh-Cookie| —                        | Access-Token erneuern, Token-Rotation   |
| POST    | `/api/v1/auth/logout`                 | JWT           | —                        | Refresh-Token revoken                   |
| GET     | `/api/v1/auth/me`                     | JWT           | —                        | Aktueller User + Permissions            |
| POST    | `/api/v1/auth/change-password`        | JWT           | —                        | User ändert eigenes Passwort            |
| GET     | `/api/v1/users`                       | JWT           | `users.read`             | User-Liste im Tenant                    |
| POST    | `/api/v1/users`                       | JWT           | `users.manage`           | Neuen User anlegen + temp-Passwort      |
| GET     | `/api/v1/users/:id`                   | JWT           | `users.read`             | Einzel-User                             |
| PATCH   | `/api/v1/users/:id`                   | JWT           | `users.manage`           | User ändern (Permissions, Active-Flag)  |
| DELETE  | `/api/v1/users/:id`                   | JWT           | `users.manage`           | User löschen (Soft: is_active=false)    |
| POST    | `/api/v1/users/:id/reset-password`    | JWT           | `users.manage`           | Admin setzt neues temp-Passwort         |

### 5.3 JWT-Payload

```json
{
  "sub": "usr_01HYZ...",
  "tenant_id": "tnt_01HYZ...",
  "permissions": ["receipts.read", "receipts.write", "users.read"],
  "preset": "operator",
  "iat": 1730000000,
  "exp": 1730000900,
  "jti": "ulid"
}
```

Ein super_admin hat `tenant_id: null` und `permissions: ["*"]`.

### 5.4 Login-Flow

```
1. POST /auth/login { email, password }
2. Backend:
   a) User per email_lower suchen (über alle Tenants)
   b) is_active prüfen → sonst 403
   c) locked_until prüfen → sonst 423 LOCKED
   d) argon2.verify(password, password_hash)
      - bei Misserfolg: failed_attempts++, ggf. locked_until = now()+15min,
        auth_event(login_failed) loggen, 401 zurück
      - bei Erfolg: failed_attempts=0, last_login_at=now()
   e) JWT (15 min) erzeugen, Refresh-Token (30 Tage, sha256-hash in DB) erzeugen
   f) auth_event(login_success) loggen
   g) Response: { access_token, user: { id, email, display_name, tenant_id, permissions, password_must_change } }
   h) Set-Cookie: pp_refresh=<token>; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000
3. Falls password_must_change → Frontend zeigt Passwort-Wechsel-Modal vor weitergehender Nutzung
```

### 5.5 Refresh-Flow (Token-Rotation)

```
1. POST /auth/refresh (Cookie pp_refresh wird automatisch gesendet)
2. Backend:
   a) Cookie auslesen, sha256 → in DB nachschlagen
   b) Falls revoked_at ≠ NULL und family_id existiert noch → REPLAY-DETECTED → ALLE Tokens der Familie revoken, 401
   c) expires_at prüfen → bei abgelaufen 401
   d) NEUEN Access-Token + NEUEN Refresh-Token (gleiche family_id) erzeugen
   e) Alten Refresh-Token revoken (revoke_reason='rotation')
   f) Neue Cookie setzen
   g) Response { access_token, user }
```

### 5.6 Permission-Middleware

```typescript
// jwt.middleware.ts hängt request.user an
// permissions.ts exportiert:

export function requirePermission(permission: string) {
  return async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const hasIt = matchPermission(req.user.permissions, permission);
    if (!hasIt) {
      logAuthEvent('permission_denied', req.user.id, { permission });
      return reply.code(403).send({ error: 'FORBIDDEN', required: permission });
    }
  };
}

// Wildcard-Match: "receipts.*" matcht "receipts.read", "receipts.write" etc.
// "*" matcht alles.
function matchPermission(grants: string[], required: string): boolean { ... }
```

Verwendung pro Route:
```typescript
app.get('/users', { preHandler: requirePermission('users.read') }, listUsersHandler);
```

### 5.7 Lockout-Service

- 5 fehlgeschlagene Logins in 15 min → Account 15 min gesperrt
- Sperre wird per `locked_until > now()` geprüft
- Admin kann manuell entsperren (`PATCH /users/:id { is_active: true, locked_until: null, failed_attempts: 0 }`)
- IP-basiertes Rate-Limiting zusätzlich auf Nginx-Ebene (nginx-config in Server_Umzug.md hat schon `limit_req_zone`)

## 6. Frontend-Implementierung

### 6.1 Datei-Struktur

```
webapp/src/
├── auth/
│   ├── AuthContext.tsx                (UMBAUEN — echte JWT-Logik)
│   ├── ProtectedRoute.tsx             (ERWEITERN — Permission-Check)
│   ├── permissions.ts                 (NEU — matchPermission Frontend-Helper)
│   ├── token-refresh.ts               (NEU — automatischer Refresh vor Ablauf)
│   ├── AuthContext.test.tsx
│   └── permissions.test.ts
│
├── pages/
│   ├── LoginPage.tsx                  (UMBAUEN — Email + Password)
│   ├── ChangePasswordPage.tsx         (NEU — Forced password change)
│   ├── UsersPage.tsx                  (NEU — Liste + Create + Edit)
│   ├── UserFormModal.tsx              (NEU — Anlegen / Bearbeiten)
│   ├── LoginPage.test.tsx
│   └── UsersPage.test.tsx
│
├── api/
│   ├── auth.ts                        (NEU — login, logout, refresh, me, changePassword)
│   ├── users.ts                       (NEU — CRUD)
│   └── _client.ts                     (ERWEITERN — Bearer-Token-Header, automatisches Refresh bei 401)
│
└── components/
    └── UserMenu.tsx                   (NEU — Avatar + Dropdown oben rechts in Layout)
```

### 6.2 LoginPage neu

- Email-Input
- Password-Input (mit Show/Hide-Toggle)
- "Anmelden"-Button
- Bei Fehler: rote Fehler-Box mit klarer Meldung (gemäß OWASP: nicht „Email unbekannt" vs. „Passwort falsch" — immer „Login fehlgeschlagen")
- Bei `password_must_change`: Redirect auf `/change-password`
- "Passwort vergessen?"-Link → wird in V2 implementiert (jetzt: Hinweis „Bitte deinen Admin kontaktieren")

### 6.3 UsersPage (neu)

- Tabelle: Email, Name, Preset, Aktiv, Letzter Login, Aktionen (Bearbeiten / Passwort zurücksetzen / Deaktivieren)
- "+ User anlegen"-Button öffnet UserFormModal
- UserFormModal:
  - Email
  - Display-Name
  - Preset-Dropdown (Super-Admin für super_admins ausgeblendet)
  - Permission-Editor (wenn Preset = "Custom"): Checkbox-Tree
  - Temporäres Passwort: Backend generiert + zeigt **einmalig** (Copy-Button)
- Permission-Sicht:
  - Eigene Permissions immer sichtbar (`/auth/me`)
  - Buttons/Aktionen ausgeblendet, wenn Permission fehlt — nicht nur disabled

### 6.4 ChangePasswordPage (neu)

- Erscheint zwingend nach Login mit `password_must_change=true`
- Aktuelles Passwort + neues Passwort + Bestätigung
- Anforderungen client-seitig + server-seitig: min 12 Zeichen, mind. 1 Ziffer + 1 Sonderzeichen
- Nach Erfolg: `password_must_change` ist false, Redirect ans Dashboard

### 6.5 AuthContext umbauen

```typescript
interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  tenantId: string | null;       // null bei super_admin
  permissions: string[];
  passwordMustChange: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email, password) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
  refreshAccessToken: () => Promise<void>;  // intern, von Token-Refresh-Hook verwendet
}
```

- Access-Token in `useState` (nicht persistent, beim Reload via Refresh-Cookie wiederhergestellt)
- Bei App-Start: `POST /auth/refresh` versuchen → wenn ok, User restoren; sonst Login-Page
- Auto-Refresh: 1 min vor Ablauf des Access-Tokens

### 6.6 UserMenu im Layout

- Avatar (Initialen) + Name oben rechts
- Dropdown:
  - Profil (zeigt Email + Tenant + Preset)
  - Passwort ändern
  - Logout
- Bei super_admin zusätzlich: Tenant-Switcher (zur Wartung kann er sich auf einen Tenant „aufschalten")

## 7. ENV-Variablen (neu)

```bash
# JWT
JWT_SECRET=<openssl rand -hex 32>            # Pflicht
JWT_ACCESS_TTL_SECONDS=900                    # 15 min
JWT_REFRESH_TTL_SECONDS=2592000               # 30 Tage

# Argon2
ARGON2_MEMORY_COST=65536                      # 64 MB
ARGON2_TIME_COST=3
ARGON2_PARALLELISM=1

# Lockout
AUTH_MAX_FAILED_ATTEMPTS=5
AUTH_LOCKOUT_MINUTES=15

# Bootstrap (nur initial, einmalig)
INITIAL_SUPER_ADMIN_EMAIL=du@deinedomain.de
INITIAL_SUPER_ADMIN_PASSWORD=<einmalig, danach in DB durch Hash ersetzen>
```

## 8. Events (Redis Streams)

- `pp.user.created`
- `pp.user.deleted`
- `pp.user.password_changed`
- `pp.auth.login_failed_burst` — wird emittiert, wenn ein Account binnen 1 min 5× failed (für Operator-Alert)

## 9. Sicherheits-Checkliste

- [ ] Rate-Limit auf `/auth/login` (Nginx + zusätzlich Backend pro IP+Email-Kombo)
- [ ] Generic Error bei Login-Fehler (nicht „Email unbekannt" vs. „Passwort falsch")
- [ ] argon2id mit zeitgemäßen Parametern
- [ ] JWT-Secret mind. 256 Bit
- [ ] Refresh-Token niemals plain in DB
- [ ] Refresh-Token-Rotation mit Replay-Detection
- [ ] HttpOnly + Secure + SameSite=Strict für Refresh-Cookie
- [ ] CORS-Whitelist auf eigene Webapp-Domain
- [ ] CSP-Header (Webapp-Server)
- [ ] Auth-Events in eigene Tabelle, kein PII außer email_attempted
- [ ] Permission-Check IMMER server-side (UI-Hide ist Komfort, kein Schutz)
- [ ] Password-Anforderungen: min 12 Zeichen, NIST-konform (kein erzwungenes „Sonderzeichen" wenn Length okay)

## 10. Test-Strategie

| Bereich                         | Test-Datei                                   | Ziel                                 |
|---------------------------------|----------------------------------------------|--------------------------------------|
| JWT erzeugen + verifizieren     | `core/auth/jwt.test.ts`                      | Round-Trip + Tampering-Detection     |
| Argon2 hash + verify            | `core/auth/password.test.ts`                 | Korrektheit + Performance              |
| Permission-Match                | `core/auth/permissions.test.ts`              | Wildcard, exakt, super_admin         |
| Login-Flow                      | `modules/users/tests/login.test.ts`          | Success / wrong password / locked    |
| Lockout                         | `modules/users/tests/lockout.test.ts`        | 5 fails → lock, nach 15 min wieder   |
| User-CRUD mit Permissions       | `modules/users/tests/crud.test.ts`           | Permission-Boundary, RLS              |
| E2E: Login → Action → Refresh   | `modules/users/tests/e2e.test.ts`            | Vollständiger Lifecycle              |
| Frontend-LoginPage              | `pages/LoginPage.test.tsx`                   | Form, Error-States, Redirect         |
| Frontend-AuthContext            | `auth/AuthContext.test.tsx`                  | Restore-on-Reload, Auto-Refresh      |
| Frontend-Permissions            | `auth/permissions.test.ts`                   | hasPermission(), Wildcard            |
| Frontend-UsersPage              | `pages/UsersPage.test.tsx`                   | List, Create, Edit, Permission-Hide  |
| Playwright-E2E                  | `webapp/tests/e2e/auth.spec.ts`              | Login → Page geschützt → Logout      |

Coverage-Ziel: > 90 % auf core/auth + modules/users.

## 11. Migrations-Reihenfolge

1. **`031_users_auth.sql`** — Tabellen anlegen
2. **`031b_bootstrap_super_admin.sql`** — Initial-super_admin aus ENV-Variablen anlegen (idempotent: macht nichts, wenn schon einer existiert)
3. **`031c_link_existing_data.sql`** — Falls Bestandsdaten existieren: `created_by_user_id`-Spalten zu `receipts`, `customer_profiles` etc. ergänzen, Default = Initial-super_admin

## 12. Acceptance Criteria

### Backend
- [ ] `POST /auth/login` mit gültigen Credentials → 200 + JWT + Cookie
- [ ] `POST /auth/login` mit falschen Credentials → 401 + auth_event(login_failed)
- [ ] 5× falsch in 15 min → 6. Versuch 423 LOCKED
- [ ] `POST /auth/refresh` mit gültigem Cookie → neuer Access + neuer Refresh, alter revoked
- [ ] Replay alter Refresh → ALLE Tokens der Familie revoked, 401
- [ ] `GET /users` ohne Permission → 403
- [ ] `POST /users` mit `users.manage` → 201, temp-Passwort im Response (einmalig)
- [ ] User mit `password_must_change=true` → kann nichts außer `/auth/me` und `/auth/change-password`
- [ ] super_admin sieht User aller Tenants
- [ ] Tenant-Admin sieht nur eigene-Tenant-User (RLS)
- [ ] Login-Audit-Log enthält IP + User-Agent + Zeit

### Frontend
- [ ] LoginPage: Email + Password → erfolgreich, Redirect Dashboard
- [ ] LoginPage bei `password_must_change`: Redirect zu /change-password
- [ ] ProtectedRoute redirected auf /login wenn kein User
- [ ] Buttons sind ausgeblendet, nicht nur disabled, wenn Permission fehlt
- [ ] Token läuft im Hintergrund still ab und wird automatisch refreshed
- [ ] Logout revoked Refresh-Token + leert Context
- [ ] UserMenu zeigt aktuellen User + Logout
- [ ] UsersPage Liste lädt + Create + Edit + Permission-Edit funktioniert

### Sicherheit
- [ ] Refresh-Cookie ist HttpOnly + Secure + SameSite=Strict
- [ ] argon2id mit Memory-Cost ≥ 64 MB
- [ ] JWT-Secret aus ENV, niemals im Code
- [ ] Rate-Limit auf /auth/login: max 10/min pro IP
- [ ] Bei Test mit Webapp-Domain CORS strikt: andere Origins → 403
- [ ] Niemals Klartext-Passwort in Logs

## 13. Implementations-Aufwand (Schätzung)

| Bereich                              | Aufwand   |
|--------------------------------------|-----------|
| DB-Migration                         | 1 h       |
| `core/auth/` (JWT, password, permissions) + Tests | 3 h |
| `modules/users/` Backend + Tests     | 6 h       |
| Frontend AuthContext + LoginPage + ChangePasswordPage | 4 h |
| Frontend UsersPage + UserFormModal   | 4 h       |
| Frontend UserMenu + Permission-Hide  | 2 h       |
| E2E-Tests + Playwright               | 2 h       |
| Bootstrap-Skript + Doku              | 1 h       |
| **Gesamt**                           | **~23 h** |

Mit Claude Code in 1–2 Sessions machbar (Spec wird übergeben, Generator läuft, Engineer reviewt + integriert).

## 14. Schritte für Claude Code

Empfohlene Generierungs-Reihenfolge:

```
Schritt 1: DB-Migration 031_users_auth.sql + 031b_bootstrap_super_admin.sql
Schritt 2: backend/src/core/auth/ (JWT, password, permissions) + Tests
Schritt 3: backend/src/modules/users/ (Routes, Handlers, Services, Tests)
Schritt 4: webapp/src/auth/AuthContext.tsx (umbauen)
Schritt 5: webapp/src/pages/LoginPage.tsx (umbauen) + ChangePasswordPage.tsx (neu)
Schritt 6: webapp/src/api/auth.ts + users.ts + _client.ts (erweitern)
Schritt 7: webapp/src/pages/UsersPage.tsx + UserFormModal.tsx
Schritt 8: webapp/src/components/UserMenu.tsx + Layout-Integration
Schritt 9: Playwright-E2E-Test
Schritt 10: Manuelle Smoke-Tests + Doku im Backend-README
```

Pro Schritt ein Prompt nach Template A aus [`06_Prompt_System.md`](../06_Prompt_System.md).

## 15. Bekannte Grenzen / spätere V2

- Keine MFA (TOTP/WebAuthn) — kommt in V2 wenn Pro-Kunden es brauchen
- Kein Self-Service „Passwort vergessen" — V2 mit Mail-Service-Integration
- Kein Single-Sign-On (SAML/OIDC) — nur wenn Enterprise-Kunde es fordert
- Audit-Log-Browser fehlt im UI — Rohdaten in `auth_events`-Tabelle vorhanden, UI später
- Keine Session-Liste pro User („meine angemeldeten Geräte") — V2

---

## Hinweis zum Verhältnis Plattform-Owner ↔ Tenant-Admins

Wichtig: Dieses Modul macht **keine Selbstregistrierung** möglich. Das ist Absicht: ProzessPilot ist B2B-SaaS, Tenants werden vom Plattform-Operator (du) per Webapp angelegt; der Tenant-Admin wird vom Operator erzeugt; weitere User innerhalb des Tenants legt der Tenant-Admin an. Damit ist das Berechtigungs-Modell sauber hierarchisch.
