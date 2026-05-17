# M14 — User-Verwaltung & Authentifizierung

Spec: [`/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md`](../../../../../Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md)

## Übersicht

Echte Authentifizierung mit JWT Access-Token (15 min) + Refresh-Token (30 Tage,
HttpOnly Cookie, Replay-Detection via Token-Familien). argon2id für Passwort-
Hashing. Granulare Permissions per Wildcard-Match. Tenant-Isolation per RLS.

## Datei-Struktur

```
backend/src/
├── core/auth/
│   ├── jwt.ts                          ← Access-Token sign + verify (HS256)
│   ├── jwt.middleware.ts               ← jwtAuthMiddleware + requirePermission
│   ├── password.ts                     ← argon2id hash + verify + strength
│   └── permissions.ts                  ← matchPermission + PRESETS
│
└── modules/users/
    ├── routes.ts                       ← authPublicRoutes / authProtectedRoutes / usersRoutes
    ├── bootstrap.ts                    ← CLI: erster super_admin
    ├── handlers/
    │   ├── login.handler.ts            ← POST /auth/login
    │   ├── refresh.handler.ts          ← POST /auth/refresh (Token-Rotation)
    │   ├── logout.handler.ts           ← POST /auth/logout
    │   ├── me.handler.ts               ← GET  /auth/me
    │   ├── change-password.handler.ts  ← POST /auth/change-password
    │   ├── list-users.handler.ts       ← GET  /users
    │   ├── create-user.handler.ts     ← POST /users
    │   ├── get-user.handler.ts        ← GET  /users/:id
    │   ├── update-user.handler.ts     ← PATCH /users/:id
    │   ├── delete-user.handler.ts     ← DELETE /users/:id (soft)
    │   └── reset-user-password.handler.ts  ← POST /users/:id/reset-password
    ├── services/
    │   ├── auth.service.ts             ← Login/Refresh/Logout-Logik
    │   ├── user.repository.ts          ← pg-Layer für users
    │   ├── refresh-token.repository.ts ← pg-Layer + Token-Hashing
    │   ├── auth-event.logger.ts        ← Schreibt in auth_events
    │   ├── lockout.service.ts          ← Failed-Attempts-Tracking
    │   └── cookie.helper.ts            ← Refresh-Cookie set/clear/read
    ├── schemas/
    │   ├── login.schema.ts             ← Zod: LoginInput, ChangePasswordInput
    │   └── user.schema.ts              ← Zod: CreateUserInput, UpdateUserInput
    └── tests/
        ├── lockout.test.ts
        ├── refresh-token.test.ts
        └── jwt-middleware.test.ts
```

## ENV-Variablen (Pflicht)

| Variable                          | Default        | Bemerkung                                      |
|-----------------------------------|----------------|------------------------------------------------|
| `JWT_SECRET`                      | (Pflicht!)     | `openssl rand -hex 32`. Production-Pflicht.    |
| `JWT_ACCESS_TTL_SECONDS`          | `900`          | 15 min                                         |
| `JWT_REFRESH_TTL_SECONDS`         | `2592000`      | 30 Tage                                        |
| `ARGON2_MEMORY_COST`              | `65536`        | 64 MB                                          |
| `ARGON2_TIME_COST`                | `3`            |                                                |
| `ARGON2_PARALLELISM`              | `1`            |                                                |
| `AUTH_MAX_FAILED_ATTEMPTS`        | `5`            | Lockout-Schwelle                               |
| `AUTH_LOCKOUT_MINUTES`            | `15`           | Lockout-Dauer                                  |
| `AUTH_REFRESH_COOKIE_NAME`        | `pp_refresh`   |                                                |
| `AUTH_REFRESH_COOKIE_SAMESITE`    | `strict`       | `strict` / `lax` / `none`                      |
| `AUTH_REFRESH_COOKIE_SECURE`      | `1`            | In Production immer `1`, lokal-http: `0`       |
| `INITIAL_SUPER_ADMIN_EMAIL`       | (optional)     | Für CI-Bootstrap. Sonst interaktiver Prompt.   |
| `INITIAL_SUPER_ADMIN_PASSWORD`    | (optional)     | dito                                           |

## Endpoint-Übersicht (alle unter `/api/v1`)

| Method | Pfad                          | Auth         | Permission        |
|--------|-------------------------------|--------------|-------------------|
| POST   | `/auth/login`                 | —            | —                 |
| POST   | `/auth/refresh`               | Cookie       | —                 |
| POST   | `/auth/logout`                | —            | —                 |
| GET    | `/auth/me`                    | Bearer       | —                 |
| POST   | `/auth/change-password`       | Bearer       | —                 |
| GET    | `/users`                      | Bearer       | `users.read`      |
| POST   | `/users`                      | Bearer       | `users.manage`    |
| GET    | `/users/:id`                  | Bearer       | `users.read`      |
| PATCH  | `/users/:id`                  | Bearer       | `users.manage`    |
| DELETE | `/users/:id`                  | Bearer       | `users.manage`    |
| POST   | `/users/:id/reset-password`   | Bearer       | `users.manage`    |

## Migration

```bash
npm run migrate
```

Wendet `031_users_auth.sql` + `031b_bootstrap_super_admin.sql` an. Beide
idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`).

## Bootstrap (erster super_admin)

Interaktiv:

```bash
npm run bootstrap:super-admin
# → fragt nach Email + Passwort
```

Nicht-interaktiv (CI):

```bash
INITIAL_SUPER_ADMIN_EMAIL=admin@deinedomain.de \
INITIAL_SUPER_ADMIN_PASSWORD='ein-langes-Passwort-MIND-12-Zeichen' \
  npm run bootstrap:super-admin
```

Idempotent: läuft 2× durch ohne Konflikt, wenn bereits ein aktiver super_admin
existiert.

## Curl-Beispiele

### Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -c /tmp/pp-cookies.txt \
  -d '{"email":"admin@deinedomain.de","password":"…"}'
```

### Aktuelle User-Info
```bash
TOKEN=… # aus Login-Response
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Refresh
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -b /tmp/pp-cookies.txt -c /tmp/pp-cookies.txt
```

### User anlegen
```bash
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"operator@kunde.de","display_name":"Operator","preset":"operator","tenant_id":"<UUID>"}'
```

### Logout
```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -b /tmp/pp-cookies.txt -c /tmp/pp-cookies.txt
```

## Sicherheits-Hinweise

- `JWT_SECRET` ist Production-Pflicht (Server-Start verweigert sonst).
- Refresh-Token wird als `sha256(plain)` gespeichert — niemals plain in DB.
- Bei Replay-Erkennung (alter Refresh-Token kommt nach Rotation) → ALLE Tokens
  derselben Familie werden revoked.
- Lockout: 5 Failed Logins in 15 min → 15 min gesperrt (Spec §5.7).
- OWASP: Login-Fehler immer "Login fehlgeschlagen" (kein User-Enum).
- Permission-Hide im UI ist Komfort — die Durchsetzung passiert server-side.
- Niemals Klartext-Passwörter loggen (Pino-Redaction empfohlen).

## DECISIONS

- **D1:** `tenant_id` ist UUID (statt TEXT wie in M14-Spec §4) — passt zur
  existierenden `tenants`-Tabelle in Migration 003.
- **D2:** Passwort-CLI nutzt `readline/promises`. Echte "silent input" nicht
  trivial in Node ohne extra dep; akzeptiert für Bootstrap-Tool.
- **D3:** `users.id` und `refresh_tokens.id` als `<prefix>_<uuid>` statt ULID,
  da bereits `crypto.randomUUID()` verfügbar und Sortbarkeit für diese Entitäten
  nicht kritisch ist.
- **D4:** HS256 statt RS256 — `JWT_SECRET` als Symmetric Key gemäß M14-Spec §7.
- **D5:** Custom-Permission-Liste validiert per Regex
  `^\*$|^[a-z_]+\.(\*|[a-z_]+)$`. Wildcard `"*"` darf nur durch super_admin
  vergeben werden.
- **D6:** Routes-Layout: `authPublicRoutes` + `authProtectedRoutes` +
  `usersRoutes` sind drei getrennte Plugins, damit JWT-Middleware nur dort
  läuft, wo nötig (und kein HMAC-Konflikt mit `/api/v1/*`).
- **D7:** Bei `change-password`-Erfolg werden ALLE Refresh-Tokens des Users
  revoked → User muss neu einloggen (sicherer Default).

## Acceptance Criteria (Spec §12)

### Backend
- [x] `POST /auth/login` mit gültigen Credentials → 200 + JWT + Cookie
- [x] Falsche Credentials → 401 + `auth_event(login_failed)`
- [x] 5× falsch → 6. Versuch 423 LOCKED
- [x] Refresh-Rotation: neuer Access + neuer Refresh, alter revoked
- [x] Replay alter Refresh → ALLE Tokens der Familie revoked, 401
- [x] `GET /users` ohne Permission → 403
- [x] `POST /users` mit `users.manage` → 201, temp-Passwort einmalig
- [x] `password_must_change=true` → User kann nur `/auth/me`, `/auth/change-password` benutzen (via Frontend-Guard; Backend lässt `me` + `change-password` durch)
- [x] super_admin sieht alle Tenants
- [x] Tenant-Admin sieht nur eigene-Tenant-User (RLS + Handler-Filter)
- [x] Login-Audit enthält IP + User-Agent + Zeit

### Frontend
- [x] LoginPage Email + Password → Redirect Dashboard
- [x] Bei `password_must_change` → Redirect `/change-password`
- [x] ProtectedRoute redirected wenn kein User
- [x] Buttons sind ausgeblendet (Hide), wenn Permission fehlt
- [x] Auto-Refresh 60 s vor Ablauf
- [x] Logout revoked Refresh-Token + leert Context
- [x] UserMenu zeigt User + Logout
- [x] UsersPage Liste + Create + Edit + Permission-Edit

### Sicherheit
- [x] Refresh-Cookie HttpOnly + Secure + SameSite=Strict
- [x] argon2id mit ≥ 64 MB
- [x] JWT_SECRET aus ENV, Production-Pflicht
- [x] CORS strikt (vorhandene Fastify-Config)
- [x] Keine Klartext-Passwörter in Logs
