# T025 — Task-Backend-API (CRUD / claim / complete / collaborators)

> **Owner:** Andreas (Backend/Infra)
> **Priorität:** P1 (Pilot)
> **Dependencies:** **T024** (Datenmodell) gemerged
> **Welle:** 6
> **Spec-Referenzen:** `Mitarbeiter_Webapp.md` §3.3 (Quick-Actions, TaskDetail), §4 · CLAUDE.md §5.3 (Auth), §5.7 (Audit-Log)
> **Audit:** REPORT-2026-05-26 F01 · **Blockt:** T026

---

## Ziel

REST-API für das Task-Dashboard, sodass T026 (Webapp-UI) die Mock-Daten (`webapp/src/data/tasks.ts`) durch echte Daten ersetzen kann. JWT-geschützt (M14-Cookie-Session), tenant-isoliert via RLS-Context.

---

## Akzeptanz-Kriterien

- [ ] `GET /api/v1/tasks` — Liste mit Filtern (Tenant, `type`, `priority`, `status`, Fälligkeit) + Sortierung (Default `due_at` aufsteigend) + Pagination (`total` via separatem COUNT, nicht Window-Func — siehe T005-Lesson).
- [ ] `GET /api/v1/tasks/:id` — Detail inkl. verknüpfter Entität + `task_activity_log`.
- [ ] `POST /api/v1/tasks` — anlegen (auch programmatisch durch Trigger-Engine T027 nutzbar).
- [ ] Quick-Actions gemäß §3.3: `POST /:id/claim` (Übernehmen wenn unassigned), `POST /:id/complete`, `POST /:id/pause`, `POST /:id/discard`, `POST /:id/collaborators` (Helfer einladen).
- [ ] Jeder Statuswechsel + jede Aktion schreibt `task_activity_log` **und** `audit_log` (CLAUDE.md §5.7).
- [ ] Tenant-Context pro Request gesetzt (`set_config('app.tenant_id', …)`); kein Cross-Tenant-Zugriff (Test).
- [ ] Zod-Validierung aller Inputs, parametrisiertes SQL.
- [ ] Unit- + Integrationstests (Happy + Fehlerpfade, ≥80%); CI grün.

---

## Hinweise

- Auth-Pattern: `backend/src/core/auth/hmac.middleware.ts` (pp_auth-Cookie → authUser).
- Repository-/Routes-Vorlage: bestehende Module, z.B. `m15-pos-connector/kasse-transactions.repository.ts` (BEGIN/set_config/COMMIT-Pattern) + `kasse.routes.ts`.
- Pagination-`total`: separater COUNT-Query (Regression aus T005/#60 vermeiden).
