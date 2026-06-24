# T066 — Tenant aktivieren bei Stammdaten-Eingabe (Wizard Schritt 1)

**ID:** T066
**Verantwortlich:** Steve
**Priorität:** P1
**Branch:** `steve/T066-stammdaten-aktivierung`
**Geschätzt:** 1 Tag Claude-Code-Session
**Dependencies:** [T016, T058, T059] — alle in `_done/`
**Ziel-Meilenstein:** Build-out Phase B (Onboarding-Wizard)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Sobald der Wirt im Onboarding-Wizard **Schritt 1 (Stammdaten)** absendet und der Server
validiert, wird der Tenant **automatisch aktiv gesetzt** (`tenants.onboarding_status =
'activated'`) und die Stammdaten werden **vollständig in echte `tenants`-Spalten**
übernommen (eigene Migration). Der Aktiv-Status wird zusätzlich in der **Mitarbeiter-Webapp**
(Mandanten-Liste) als Status-Badge sichtbar.

---

## ⚠️ Bewusste Spec-Abweichung (verankern, nicht still einbauen)

Die dokumentierte Spec (`Onboarding_Wizard.md`, `Mitarbeiter_Webapp.md` §4.x — Auto-Task
„Tenant X freischalten") sieht vor, dass ein **PP-Mitarbeiter nach Wizard-Abschluss
manuell freischaltet**. Für den **Build-out-Testkunden** (CLAUDE.md §3.6: „Testkunde spielt
alles selbst durch") wird die Aktivierung **automatisiert** und an die **Stammdaten-Eingabe
(Schritt 1)** gehängt — entschieden von GF Steve am 2026-06-24. Die manuelle
Mitarbeiter-Freischaltung entfällt im Self-Service-Pfad. Diese Abweichung ist in der
Task-Datei + im Code-Kommentar dokumentiert.

---

## Akzeptanz-Kriterien

### Migration (`123_tenant_stammdaten_activation.sql` + `_rollback.sql`)
- [ ] Neue `tenants`-Spalten (alle `ADD COLUMN IF NOT EXISTS`, nullable, rückwärts-kompatibel):
      `legal_form`, `owner_name`, `address_street`, `address_postal_code`, `address_city`,
      `vat_id`, `tax_number`, `industry`, `employee_count` (SMALLINT),
      `monthly_receipt_volume` (INTEGER), `advisor_cost_monthly` (NUMERIC(10,2)).
- [ ] `contact_phone` auf `VARCHAR(40)` geweitet (Zod `telefon` erlaubt 40 Zeichen).
- [ ] `list_tenants_for_staff()` um Spalte `onboarding_status` erweitert — via **`DROP FUNCTION`
      + `CREATE`** (Postgres erlaubt kein `CREATE OR REPLACE` bei geänderter `RETURNS TABLE`),
      inkl. erneutem `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO gastro_app`. SECURITY-DEFINER-
      Muster + `SET search_path` exakt wie Migration 121 beibehalten.
- [ ] Rollback-Skript: `DROP COLUMN IF EXISTS` für die neuen Spalten + `list_tenants_for_staff()`
      auf die 121-Definition zurück (DROP + CREATE).
- [ ] `onboarding_status`-CHECK aus 122 unverändert — `'activated'` ist dort bereits erlaubt.

### Backend (`m16-wizard`)
- [ ] Neue Repository-Funktion `saveStammdatenAndActivate(pool, { tenantId, token, stammdaten })`:
      in **einer** Transaktion (RLS-Context wie bestehende Funktionen) →
      (a) `step_data['1']` mergen + `current_step` auf 2 vorrücken (wie `saveOnboardingStep`),
      (b) Stammdaten → `tenants`-Spalten promoten (Mapping s. u.),
      (c) `onboarding_status = 'activated'` setzen (unkonditional → idempotent, `activated` terminal),
      (d) `logAuditEvent` `tenant.activated` (entityType `tenant`, actor `{type:'customer'}`,
      payloadAfter minimal, **keine PII**).
- [ ] `saveOnboardingStep` bleibt generisch für Schritte 2–7 (unverändert).
- [ ] `save-step.handler.ts`: bei `step === 1` → `saveStammdatenAndActivate(parsed.data)`,
      sonst → `saveOnboardingStep`. Session-Status bleibt `started` (Wizard fortsetzbar).
- [ ] **FSM-Regression verhindern:** `completeOnboardingSession` setzt `onboarding_status` nur
      noch regressions-frei: `CASE WHEN onboarding_status = 'activated' THEN 'activated'
      ELSE 'wizard_done' END` — übrige Promotion (advisor_system etc.) bleibt.

### Backend (`/tenants`-Listing)
- [ ] `tenants.repository.ts`: `TenantListItem` + SELECT um `onboarding_status` erweitert
      (weiter über `list_tenants_for_staff()`, **nie** `FROM tenants`).
- [ ] `tenants.routes.ts` / Response gibt `onboarding_status` mit aus.

### Webapp (Mitarbeiter)
- [ ] `webapp/src/api/tenants.ts`: `onboarding_status: string` im `TenantListItem`-Typ.
- [ ] `TenantsPage.tsx`: neue Spalte „Onboarding" mit Status-Badge (bestehende `.badge`-Klassen):
      `activated`→`badge active` „Aktiv", `wizard_done`→`badge info` „Wizard fertig",
      `wizard_started`→`badge info` „Wizard läuft", `pending`→`badge pending` „Offen".
      **Klar abgegrenzt** vom bestehenden Button „Als aktiv setzen" (= Arbeits-Tenant wählen,
      NICHT Onboarding-Aktivierung).

### Tests
- [ ] Integration (`onboarding-wizard.test.ts`, echte DB): neuer Test
      create → `saveStammdatenAndActivate(valide Stammdaten)` → `onboarding_status='activated'`
      + alle gemappten Spalten befüllt → `complete` → **weiterhin `activated`** (Non-Regression).
- [ ] Bestehender Integration-Test (generischer `saveOnboardingStep` für Step 1) bleibt grün
      (endet weiter bei `wizard_done`).
- [ ] HTTP (`wizard-http.test.ts`): bestehender Step-1-Test bleibt 200/`current_step=2`;
      neuer Test prüft per Query-Capture, dass `UPDATE tenants … onboarding_status='activated'`
      ausgelöst wird.
- [ ] `tenants-routes.test.ts`: Mock-Row + Assertion um `onboarding_status`.
- [ ] Webapp `TenantsPage.test.tsx`: Badge-Assertion (`activated` → „Aktiv"); MSW-Handler
      `onboarding_status` ergänzt.
- [ ] CI grün (lint + typecheck + tests + build), DB-Tests mit `PP_E2E=1`.
- [ ] Test-Coverage ≥ 80% für neue/geänderte Dateien.
- [ ] code-reviewer-Agent gibt OK.

---

## Stammdaten → tenants Mapping

| Stammdaten (Zod, step1) | tenants-Spalte | Hinweis |
|---|---|---|
| `firmenname` | `legal_name` (bestehend) | display_name bleibt staff-kuratiert |
| `email` | `contact_email` (bestehend) | überschreibt |
| `telefon` | `contact_phone` (auf 40 geweitet) | überschreibt |
| `inhaber` | `owner_name` (neu) | |
| `rechtsform` | `legal_form` (neu) | SSoT = Zod-Enum in `wizard.types.ts`, kein DB-CHECK |
| `strasse` | `address_street` (neu) | |
| `plz` | `address_postal_code` (neu) | |
| `stadt` | `address_city` (neu) | |
| `ust_id` | `vat_id` (neu) | `''`/undefined → NULL |
| `steuernummer` | `tax_number` (neu) | |
| `branche` | `industry` (neu) | SSoT = Zod-Enum |
| `mitarbeiter_anzahl` | `employee_count` (neu) | |
| `belegvolumen_monat` | `monthly_receipt_volume` (neu) | |
| `steuerberater_kosten_monat` | `advisor_cost_monthly` (neu) | optional → NULL |

---

## Spec-Referenzen

- `Modulkonzept/Konzeptentwicklung/Onboarding_Wizard.md` §2.2 (Stammdaten), §5.2 (tenants-Output-Spalten)
- `Modulkonzept/Konzeptentwicklung/Mitarbeiter_Webapp.md` §4 (Freischaltung — hier bewusst automatisiert)
- CLAUDE.md §3.6 (Build-out: Testkunde spielt alles selbst durch)

---

## Notes / Gotchas

- **Migration:** `list_tenants_for_staff()` erweitern = `DROP FUNCTION` + neu anlegen (Return-Type-
  Änderung). `tenants-list-rls.test.ts` selektiert nur `id` → bricht nicht; `beforeAll` setzt
  Owner neu. `tenants-routes.test.ts` SQL-Assertion `not /FROM\s+tenants\b/` bleibt erfüllt
  (`FROM list_tenants_for_staff()`).
- **`activated` ist terminal** — unkonditionales Setzen ist idempotent; deshalb muss `complete`
  regressions-frei sein (CASE), sonst geht die Aktivierung beim späteren Abschluss verloren.
- **Naming-Kollision UI:** „Als aktiv setzen" (TenantsPage-Button) = lokaler Arbeits-Tenant
  (`setActiveTenantId`), NICHT Onboarding. Badge ≠ Button sauber trennen.
- DB-Spalten English snake_case (Konvention); Enum-Werte bleiben deutsch (Wire-JSON).

---

## Offene Fragen (während der Bearbeitung)

_(keine offen — Scope per AskUserQuestion am 2026-06-24 geklärt: Auslöser=Schritt 1,
Promotion=vollständig in neue Spalten, Webapp=Badge sichtbar.)_

---

## Lessons Learned (nach Abschluss)

_(nach Merge ausfüllen)_
