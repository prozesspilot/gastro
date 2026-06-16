# T058 — Backend: GET /api/v1/tenants (Staff-Cross-Tenant-Listing via SECURITY DEFINER)

**ID:** T058
**Verantwortlich:** Steve
**Priorität:** P1 (Build-out A3 — Voraussetzung für den Webapp-Tenant-Selector / Belege-Liste)
**Branch:** `steve/T058-tenants-list`
**Geschätzt:** 0,5–1 Tag
**Dependencies:** keine
**Ziel-Meilenstein:** Build-out Phase A3 (Webapp-Reboot)
**Anker:** `migrations/010_tenants.sql` (RLS-Kommentar Z.47–56: „tenants wird von der Mitarbeiter-Webapp cross-tenant gelesen … über is_rls_bypassed()") · M14-Muster `modules/m14-auth/users.repository.ts` (SECURITY DEFINER) · `Mitarbeiter_Webapp.md`

---

## Problem / Kontext

Die interne Webapp braucht eine **Liste aller Mandanten** (Tenant-Selector → setzt `x-pp-tenant-id`).
`m14TenantContextHook` verlangt diesen Header, leitet ihn NICHT aus der Session ab. Es gibt **keine
lebende** `GET /tenants`-Route (die `modules/tenants/tenant.routes.ts` ist nicht registriert + hat
Spalten-Drift `name`/`active` — NICHT nachbauen).

`tenants`-RLS (010): `is_rls_bypassed() OR current_tenant_id() = id`. Die App läuft als `gastro_app`
(NOBYPASSRLS) → `set_config('app.bypass_rls')` ist zur Laufzeit ein No-op. Cross-Tenant-Listing geht
deshalb nur über eine **`SECURITY DEFINER`-Funktion** (Owner `gastro_owner`), die mit Definer-Rechten
läuft und die RLS-Policy umgeht — eng gefasst, damit kein genereller Bypass entsteht.

## Was zu tun ist

1. **Migration `121_list_tenants_fn.sql` (+ Rollback):** `SECURITY DEFINER`-Funktion
   `list_tenants_for_staff()` (Owner `gastro_owner`), die NUR `SELECT id, slug, display_name, package,
   deletion_status FROM tenants WHERE deleted_at IS NULL ORDER BY display_name` liefert.
   - **Security-Härtung:** `SET search_path = pg_catalog, public` in der Funktion (gegen search_path-
     Hijack), `STABLE`, keine Parameter (keine Injection-Surface), `REVOKE ALL ... FROM PUBLIC` +
     `GRANT EXECUTE ... TO gastro_app`. Kommentar, warum DEFINER nötig ist.
2. **Repository** `modules/.../tenant-list.repository.ts` (oder in m14/core): ruft `SELECT * FROM
   list_tenants_for_staff()` über den normalen `gastro_app`-Pool.
3. **Route** `GET /api/v1/tenants`: nur `m14StaffAuthHook` (KEIN `m14TenantContextHook` — Listing ist
   nicht tenant-scoped). Antwortet `apiOk([{ id, slug, display_name, package, deletion_status }])`.
   Im LIVE-Block von `app.ts` registrieren.
4. **Tests:** Unit (Repository gegen gemockten Pool) + Integration (RLS-Beweis, falls PP_E2E/CI-DB:
   unter `gastro_app` liefert die Funktion ALLE aktiven Tenants — beweist DEFINER-Bypass — UND ein
   direktes `SELECT FROM tenants` unter `gastro_app` ohne Tenant-Context liefert 0 → der Bypass gilt
   NUR für die Funktion, nicht generell) + Handler (401 ohne Auth).

## Akzeptanz-Kriterien
- [x] `GET /api/v1/tenants` LIVE in `app.ts`, m14StaffAuthHook (kein TenantContext), 200 → Liste (id/slug/display_name/package/deletion_status), nur `deleted_at IS NULL`
- [x] 401 ohne gültige Session — Handler-Test
- [x] SECURITY-DEFINER-Funktion `list_tenants_for_staff()`: fixe Spalten, keine Params, `SET search_path=pg_catalog,public`, `set_config('app.bypass_rls',true)` lokal, `REVOKE PUBLIC` + `GRANT gastro_app`
- [x] Integration-Test (CI-DB): Funktion liefert cross-tenant alle aktiven; direktes `SELECT FROM tenants` unter gastro_app ohne Context = 0
- [x] Migration 121 + Rollback; Build + 672 Tests grün; Biome sauber
- [ ] CodeQL ohne neuen High-Alert (via PR-CI)

## Review-Nachschärfung (PR #133, code-reviewer)
- **MAJOR Role-Gating (Entscheidung):** `GET /tenants` lässt BEWUSST alle Staff-Rollen zu (auch `support`). `support` hat im A3-Rollenmodell `tenants.read` und braucht die Liste für den Tenant-Selector (read-only Belege-Sicht je Mandant). Exponiert sind nur nicht-sensible Business-Metadaten, keine PII. Im Route-Kommentar dokumentiert.
- **MAJOR Test-Tiefe gefixt:** Integration-Test übt jetzt den echten Prod-Pfad (Funktion-Owner `gastro_owner` NOSUPERUSER via `ALTER FUNCTION … OWNER`), nicht nur den CI-Superuser-Kurzschluss.
- **MINOR gefixt:** Funktions-Kommentar präzisiert (Reset am Transaktionsende); `set_config('app.bypass_rls','off')` am Funktionsende als Defense-in-Depth; Tests für leere Liste, `deleted_at`-Ausschluss und Bypass-Leak-Sequenz (Funktion + danach direktes SELECT in derselben Transaktion → 0).

## Nicht in dieser Task
- Tenant-Detail/Settings (`GET /tenants/:id`) → T060/T061
- Tenant-Erstellung („Kunde eintragen") → Onboarding-Wizard / Tenant-Admin (Phase B/C)
- Webapp-Tenant-Selector + Reboot → T059

## Spec-Referenzen
- `backend/migrations/010_tenants.sql` (RLS + Cross-Tenant-Read-Intent)
- `backend/src/modules/m14-auth/users.repository.ts` (SECURITY-DEFINER-Muster)
- `backend/src/core/auth/m14-tenant-context.ts` (warum kein TenantContextHook)
- `.claude/CLAUDE.md` §5.5 (Multi-Tenancy/RLS), §6.6
