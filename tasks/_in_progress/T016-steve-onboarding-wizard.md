# T016 — Onboarding-Wizard: Backend-Fundament + Frontend-Skelett (belege-Welt)

**ID:** T016
**Owner:** Steve
**Priorität:** P1 (Build-out Phase B — kritischer Pfad „Testkunde onboardet sich selbst")
**Geschätzt:** L (erster von mehreren Phase-B-PRs)
**Anker:** `Modulkonzept/Konzeptentwicklung/Onboarding_Wizard.md` (aktuelle Spec) · `00_Buildout_Roadmap.md` §Phase B · CLAUDE.md §5.2 (drei getrennte Frontends)

---

## Kontext / Spec-Portage (§3.7)

Das alte `tasks/_eingefroren/T016-onboarding-wizard-skeleton.md` ist **Geister-Welt-veraltet** (plante „Account anlegen mit Email+Passwort+TOTP" — das `users`-Email/Passwort-Modul wurde entfernt; Wirte haben **kein Login**, nur Magic-Link). Es wird **verworfen**. Gebaut wird nach der aktuellen `Onboarding_Wizard.md`-Spec (Magic-Link, keine Account-Erstellung) auf der belege/tenants-Welt.

A1 Mail-Service (T057, `core/mail/`) ist vorhanden und wird für die Magic-Link-Mail genutzt. M05 (Lexware-OAuth) + M15 (SumUp-OAuth) existieren; M02 (Archiv) + M10/M11 (Kanäle) **nicht** → Wizard-Schritte 4 (Kanal) & 5 (Archiv) und die OAuth-Schritte 3/6 + SSE-Test-Beleg (7) kommen in **Folge-PRs**.

## Scope dieses PRs (erster Schnitt)

### Backend — Modul `m16-wizard`
- **Migration 122:** `onboarding_sessions` (belege-Welt: `tenant_id` → `tenants(id)`, `token` UNIQUE, `status`, `current_step`, `step_data` JSONB, `premium_setup_requested`, `created_at`, `expires_at`, `completed_at`, `last_activity_at`) + RLS-Policies + Rollback. Plus `tenants`-Wizard-Spalten (`onboarding_status`, `setup_premium`, `advisor_system`, `input_channels`, `archive_provider`) per Spec §5.2.
- **Session-Erstellung (staff):** `POST /api/v1/wizard/sessions` (m14StaffAuthHook) — legt für einen `tenant_id` eine Session an, generiert Token (32-Z. Base64URL, 30 Tage), versendet Magic-Link-Mail via A1. (Der „bei Vertragsabschluss"-Trigger aus der Spec existiert nicht → staff-getriggert ist der einzige baubare Weg jetzt.)
- **Öffentliche Token-Endpoints (kein Staff-Cookie — Token IST die Credential):**
  - `GET /api/v1/wizard/:token` — Session + step_data laden
  - `POST /api/v1/wizard/:token/step/:n` — Schritt-Daten speichern, `current_step` vorrücken, `last_activity_at` updaten
  - `POST /api/v1/wizard/:token/complete` — step_data → tenants-Spalten promoten, `status='completed'`, `tenants.onboarding_status='wizard_done'`
  - `POST /api/v1/wizard/:token/premium` — `status='premium_handoff'`, `premium_setup_requested=true`
- **Schritt 1 (Stammdaten) strikt Zod-validiert** (der voll spezifizierte, abhängigkeitsfreie Schritt). Spätere Schritte: step_data flexibel gespeichert.
- Token-Expiry/Status-Guards (abgelaufen/abgeschlossen → klare Fehler), RLS-Context aus der Session-`tenant_id`.

### Frontend — neue App `onboarding-wizard/` (setup.prozesspilot.net, getrennt von webapp)
- Vite + React + TS, Konventionen von `webapp/` gespiegelt (Test-Stack, Design-Tokens).
- `App.tsx`: Token aus URL, Session-Validierung gegen `GET /:token`, Router.
- `components/ProgressBar.tsx` („Schritt X von 7").
- `steps/Step1Stammdaten.tsx`: Form (react-hook-form + Zod) gegen `POST /:token/step/1`.
- `lib/api.ts`, `hooks/useWizardSession.ts`.
- Mobile-First, ProzessPilot-Light-Design-Tokens.

### Tests (Pflicht, beidseitig)
- Backend: Repository + Handler (Token-Lifecycle, staff-create, step save/resume, complete-Promotion, expiry, premium, RLS-Isolation).
- Frontend: Step-1-Validation, Token-Validierungs-Flow.

## Akzeptanz-Kriterien

- [ ] Migration 122 (`onboarding_sessions` + tenants-Spalten) rückwärts-kompatibel + Rollback; RLS greift.
- [ ] `m16-wizard` in `app.ts` registriert; staff-Route mit `m14StaffAuthHook`, öffentliche Token-Routen ohne Staff-Cookie.
- [ ] Staff kann Session anlegen → Magic-Link-Mail (A1, Dry-Run im Test) wird ausgelöst.
- [ ] `GET/step/complete/premium` funktionieren; Session-Persistenz (verlassen + zurück) übers `step_data`.
- [ ] Schritt 1 server- UND clientseitig validiert.
- [ ] Neue `onboarding-wizard/`-App buildet; Step-1-Skelett lädt Session über Token + sendet Schritt 1.
- [ ] `npm run build` + `npm test` (backend + onboarding-wizard) grün (Backend-DB-Tests mit `PP_E2E=1`).

## Nicht in diesem PR (Folge-Tasks Phase B)
OAuth-Schritte 3 (Lexware) + 6 (SumUp) · Schritt 4 (Kanal, wartet M10/M11) · Schritt 5 (Archiv, wartet M02) · Schritt 7 Test-Beleg via SSE · Premium-Upsell-UI · Deployment-Config setup.prozesspilot.net · vollständige 7-Schritt-Frontend-Formulare.
