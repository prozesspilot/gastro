# T093 — Mitarbeiter-Tool „Neuer Kunde" (Tenant-Anlage)

- **Owner:** Steve
- **Branch:** `steve/T093-tenant-anlage`
- **Größe:** M
- **Status:** done (PR #236, gemergt 2026-07-01; Folge-Task T094 = Setup-Link aus der Webapp)

## Anker

- Konzept: `Onboarding_Wizard.md` §1.3 („Backend erstellt Tenant + Magic-Link") — der Tenant wird **durch Sales/Staff vor dem Wizard** angelegt, **nicht** vom Wirt selbst (§1.2/§13: kein Self-Signup, kein Customer-Login).
- Vertriebsmodell (CLAUDE.md §1): Verkauf über Vertriebsagentur → Vertrag + Setup-Fee **vor** Onboarding.
- Code-Anker: `backend/src/modules/tenants/tenant.repository.ts` (aktuell nur `tenantExists`), `backend/migrations/123_tenant_stammdaten_activation.sql` (SECURITY-DEFINER-Write in `tenants` als Vorbild), `webapp/src/pages/TenantsPage.tsx` (Mandanten-Liste, T058).

## Problem / Warum

Es gibt **heute keinen Weg, einen neuen Kunden (Tenant) anzulegen** — außer per Datenbank-Hand. Die frühere Tenant-CRUD wurde in T043 entfernt; im aktiven Code legt nur der Dev-Seed (`seed-dev.ts`) Tenants an, produktiv nichts. Der Onboarding-Wizard setzt einen **bereits existierenden** Tenant voraus (`create-session` braucht `x-pp-tenant-id`). Damit ist der **erste Schritt der Onboarding-Kette** die einzige echte Lücke:

```
[Kunde/Tenant anlegen]   ← DIESE Task (heute nur per SQL)
  → [Setup-Link senden]   ✅ create-session (Backend live) — Webapp-Auslöser = Folge-Task T094
  → [Wirt macht Wizard]   ✅ 7 Schritte live (Lexware + SumUp echt)
```

## Scope (diese Task)

1. **Migration `131_create_tenant_fn.sql` (+ Rollback):**
   - SECURITY-DEFINER-Funktion `create_tenant_for_staff(...)` analog zu `list_tenants_for_staff()` (Migr. 121/123): `PERFORM set_config('app.bypass_rls','on',true)` → `INSERT INTO tenants (...)` → `RETURNING` → bypass off. `SET search_path = pg_catalog, public`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO gastro_app`.
   - Eingabe-Parameter: `slug`, `display_name`, `legal_name`, `contact_email`, `contact_phone`, `package`. Setzt `onboarding_status='pending'` (Default aus Migr. 122).
   - Leere Strings → `NULL` (`NULLIF`) für optionale Felder.
   - **Rückwärts-kompatibel** + Rollback-Skript (§6.5). Eine Migration pro PR.

2. **Backend `POST /api/v1/tenants` (Staff):**
   - Auth: `m14StaffAuthHook` — **kein** `m14TenantContextHook` (es wird ein *neuer* Tenant angelegt, es gibt noch kein `x-pp-tenant-id`).
   - Rollen-Gate: `gf`/`mitarbeiter` dürfen; `support` → 403 (Muster aus `create-session.handler.ts`).
   - Repository-Funktion `createTenant(pool, input)` in `tenants/tenant.repository.ts` → `SELECT * FROM create_tenant_for_staff($1,…)`.
   - Zod-Body: `display_name` (min 3), `legal_name?`, `contact_email?` (email), `contact_phone?`, `package` (enum `solo|standard|pro|filiale`, Default `standard`), `slug?` (optional; wenn leer aus `display_name` generieren: lowercase, Umlaute/ß transliterieren, `[^a-z0-9]+`→`-`, trimmen).
   - **slug-Kollision** (`UNIQUE`, PG-Code `23505`) → `409 conflict` mit klarer Meldung (kein 500).
   - Explizites Per-Route-Rate-Limit (`config.rateLimit`, Muster `wizard.routes.ts`; CodeQL-Falle, siehe Memory `codeql-missing-rate-limiting`).
   - Registrierung neben der bestehenden `GET /api/v1/tenants`-Route (T058) — dieselbe Modul-/Routen-Datei nutzen.

3. **Webapp — Anlage-UI in `TenantsPage.tsx`:**
   - Button „Neuer Kunde" → Formular (Modal oder Inline-Panel) mit Feldern: Firmenname (`display_name`), Firmenname laut Gewerbeschein (`legal_name`, optional), Kontakt-E-Mail (`contact_email`), Telefon (optional), Paket (Dropdown solo/standard/pro/filiale).
   - `api/tenants.ts`: `createTenant(input)` → `POST /api/v1/tenants`.
   - Nach Erfolg: Liste refresht, neuer Tenant erscheint. Fehler (409/422) verständlich anzeigen.
   - Design-System-Tokens verwenden (Memory `webapp-design-system`), keine hartkodierten Farben.

## Out of Scope (bewusst NICHT hier)

- **Setup-Link aus der Webapp verschicken** (Button ruft vorhandenes `POST /api/v1/wizard/sessions`) → **Folge-Task T094**. Backend ist dafür schon live; es fehlt nur der Webapp-Auslöser + Tenant-Context.
- Öffentliches Self-Signup (bewusst verworfen — widerspricht Konzept + Vertriebsmodell).
- Bearbeiten/Löschen von Tenants (separate Task bei Bedarf).

## Akzeptanzkriterien

- [x] `npm run build` + `npm test` grün (Backend + Webapp); DB-Integrationstests mit frischer Test-DB (Memory `backend-db-test-fresh-db`).
- [x] Migration 131 + Rollback laufen sauber; Rollback entfernt die Funktion.
- [x] `POST /api/v1/tenants` legt einen Tenant an (verifiziert per Folge-`GET /api/v1/tenants` in Liste) — Integrationstest gegen echte DB (RLS-Definer-Pfad, nicht gemockt; Memory `legacy-welt-schema-drift`).
- [x] `support`-Rolle → 403; fehlende Auth → 401; ungültiger Body → 422; slug-Kollision → 409.
- [x] Webapp: „Neuer Kunde" anlegen zeigt den Tenant sofort in der Liste; Tests für Formular (Happy + Fehlerpfad).
- [x] Kein `x-pp-tenant-id` nötig/erwartet für die POST-Route.

## Testplan

- Backend Unit: slug-Generierung (Umlaute/ß/Sonderzeichen), Zod-Validierung, Rollen-Gate.
- Backend Integration (echte DB): erfolgreiche Anlage über Definer-Funktion, RLS greift (kein Cross-Tenant-Leak), 409 bei Duplikat-slug.
- Webapp: Formular-Submit ruft `createTenant`, Erfolg refresht Liste, 409/422 werden angezeigt.
