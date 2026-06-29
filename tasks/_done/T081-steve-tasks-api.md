# T081 — Mitarbeiter-Aufgaben-Dashboard: Backend-API (m-tasks)

**ID:** T081
**Verantwortlich:** Steve
**Priorität:** P1 (Build-out — Mitarbeiter-Aufgaben-Dashboard, Backend)
**Branch:** `steve/T081-T082-tasks-dashboard`
**Dependencies:** T080 (Datenmodell, Migration 127) ✅
**Ziel-Meilenstein:** Build-out Phase C (Task-System)

---

## Was zu tun ist

Backend-API auf dem T080-Datenmodell (`tasks` / `task_collaborators` / `task_activity_log`,
Migration 127). Neues Modul `backend/src/modules/m-tasks/`, registriert in `app.ts` unter
`/api/v1/tasks` — **nur** `m14StaffAuthHook` (JWT-Cookie), **bewusst ohne** `m14TenantContextHook`
(`tasks` ist cross-tenant Staff-Tabelle, kein x-pp-tenant-id-Scoping; nie über `withTenant`).

**Anker:** T080-Spec + Review-Invarianten (PR #194), CLAUDE.md §3.6/§3.7, m-webchat als Modul-Vorlage.

## Endpoints

- `GET /api/v1/tasks?view=mine|team|done[&priority=…]` — Liste (Sichtbarkeitsfilter IM SQL).
- `GET /api/v1/tasks/assignees` — aktive Mitarbeiter für „Zuweisen"/„Helfer einladen".
- `GET /api/v1/tasks/:id` — Detail inkl. Helfer + Aktivitäts-Historie.
- `POST /api/v1/tasks` — anlegen (support = 403; Zuweisen an andere nur GF).
- `PATCH /api/v1/tasks/:id` — bearbeiten (Mutations-Gate).
- `POST /api/v1/tasks/:id/status` — Status (claim/pause/complete/discard/reopen; Self-Claim).
- `POST /api/v1/tasks/:id/collaborators` — Helfer einladen (idempotent).

## Umgesetzte Review-Invarianten (aus T080 PR #194)

1. Jeder Endpoint hinter authentifizierter Staff-Session (JWT `pp_auth`). ✅
2. Rollen-Gate auf allen Schreibaktionen (`tasks.permissions.ts`: support = read-only). ✅
3. „Meine"-Filter IM SQL (`assigned_to`/collaborator), nie im Frontend. ✅
4. `tasks` NIE in `withTenant()` — direkter Pool-Zugriff. ✅
5. `payload`/`description`/`title` nur Meta, kein Endkunden-PII; `task_activity_log` ≠ GoBD-Audit. ✅
6. `priority` per `CASE` sortiert (kritisch→hoch→normal→niedrig). ✅
7. Test: Mitarbeiter A kann Aufgabe von B nicht ohne Berechtigung mutieren. ✅ (HTTP-Test)

## Tests

- `src/modules/m-tasks/tests/tasks-http.test.ts` — 24 HTTP-Tests (Auth/Rollen/Validierung/Permissions, Mock-Pool).
- `src/__tests__/integration/tasks-repository.test.ts` — SQL gegen echtes Postgres (CASE-Sortierung,
  mine/team/done, Claim/Complete-Zeitstempel, Helfer-Sichtbarkeit, tenant SET NULL). CI-gegated.

## Status

✅ Implementiert. `npm run build` + `npm test` grün (844 passed / 34 skipped); Biome sauber.
