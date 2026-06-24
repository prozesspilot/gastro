# T067 — Onboarding-Wizard: vollständige 7-Schritt-Formulare

**ID:** T067
**Verantwortlich:** Steve
**Priorität:** P1
**Branch:** `steve/T067-wizard-7-schritt-formulare`
**Geschätzt:** 2–3 Tage Claude-Code-Session
**Dependencies:** [T016, T017, T066] — alle in `_done/`
**Ziel-Meilenstein:** Build-out Phase B (Onboarding-Wizard)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Den Onboarding-Wizard (`setup.prozesspilot.net/{token}`) von „nur Schritt 1" auf den
**vollständigen, navigierbaren 7-Schritt-Flow** ausbauen: Formulare für Schritte 2–7,
Zurück/Weiter-Navigation, „Überspringen → Premium" je Schritt, Fortschritt (bereits da).
Schritt 6 (SumUp) wird **echt** angebunden (neue öffentliche OAuth-Brücke). Schritt 7 ist
ein Abschluss-Screen (`completeWizard`). Anker: `Onboarding_Wizard.md` §2.1–2.8.

---

## Entscheidungen (vom GF gesetzt — nicht hinterfragen)

- **Alles in EINER Task** (ein großer, kohärenter PR).
- **Integrations-Tiefe:** SumUp-OAuth (M15) in Schritt 6 wird **echt verdrahtet**.
  Lexware (Schritt 3), Google Drive/Dropbox (Schritt 5) bleiben **klar markierte Platzhalter**
  („kommt bald", Button sichtbar-aber-deaktiviert) — Module fehlen.
- **Schritt 7 = nur Abschluss-Screen** (Zusammenfassung + „Setup abschließen"). **KEIN**
  Live-Test-Beleg, **kein SSE** (Recon: `sseManager.emit` wird nirgends aufgerufen, kein
  öffentlicher Beleg-Ingest, M10/M11-Kanäle fehlen). Live-Test-Beleg = Folge-Task, wenn Kanäle stehen.

## Defaults (Build-out — widersprechbar, in dieser Datei verankert)

- **advisor_system-Enum:** `lexware_office | datev_online | datev_csv | sevdesk | lexware_desktop | stotax | addison | unbekannt` (Spec §2.3).
- **SumUp-Varianten:** nur `sumup_lite | sumup_pos_pro` (von `pos.repository.ts` unterstützt; Solo/Standalone der Spec NICHT, da Typ sie nicht kennt).
- **Steuerberater-Kontaktdaten (Kanzlei/Ansprechpartner/E-Mail/Telefon):** nur in `step_data['2']` (kein neues Spalten-/Tabellen-Mapping; Contract promotet nur `advisor_system`).
- **Platzhalter-UX (Schritt 3/5):** Button sichtbar, deaktiviert, „Direkt-Anbindung kommt bald — wir übernehmen das beim Setup-Review."
- **Skip→Premium:** geteilte „Überspringen — wir machen es für dich"-Aktion je Schritt → `requestPremium(token)`.
- **Auto-Aktivierung/Discord-Notify bei complete (Spec §2.8):** OUT of scope → Folge-Task.

---

## Akzeptanz-Kriterien

### Backend — Validierung (`m16-wizard`)
- [ ] `wizard.types.ts`: strikte Zod-Schemas (`.strict()`) für Schritte 2/4/5/6, analog `step1StammdatenSchema`, inkl. der Enums oben. Schritt 3/7 bleiben generisch (Objekt-Check).
      - `step2`: `advisor_system` (enum, Pflicht) + `steuerberater_kanzlei` (min 2) + `ansprechpartner` (min 2) + `steuerberater_email` (email) + `steuerberater_telefon` (optional).
      - `step4`: `input_channels` = `z.array(z.enum(['whatsapp','email'])).min(1)`.
      - `step5`: `archive_provider` = `z.enum(['google_drive','dropbox','pp_internal'])`.
      - `step6`: `pos_choice` = `z.enum(['sumup','other_cloud','classic','skip'])` + `pos_system` = `z.enum(['sumup_lite','sumup_pos_pro']).optional()` + `pos_connected` (bool, optional).
- [ ] `save-step.handler.ts`: Schema-Map `{2,4,5,6}` strikt validieren (422 mit issues); 3/7 generischer Objekt-Check. **Promotion-Contract unverändert** (`complete.handler` liest weiter `step_data['2'].advisor_system`, `['4'].input_channels`, `['5'].archive_provider`, `['6'].pos_system`).

### Backend — SumUp-Brücke (öffentlicher Wizard)
- [ ] Neue öffentliche Route `POST /api/v1/wizard/:token/oauth/sumup/start` (in `wizardPublicRoutes`): `resolveSession(token)` → `tenant_id`; CSRF-State `{tenant_id, wizard_token}` (Base64URL) in Redis `sumup:oauth:state:<state>` (TTL 300 s); Antwort `{ redirect_url }` (JSON — Fetch-Client folgt keinem 302). Wiederverwendet `buildSumUpAuthUrl` aus `m15-pos-connector`.
- [ ] `m15-pos-connector/oauth.routes.ts`: `OAuthState` um `wizard_token?: string` erweitern; Callback-Redirect-Weiche: bei `wizard_token` → `WIZARD_URL/{token}?pos_connected=sumup`, sonst Staff-Pfad (`WEBAPP_URL/tenants/...`) unverändert. `upsertPosCredentials` identisch. Audit `userId=null` im Wizard-Flow.
- [ ] `core/config.ts` (+ `.env.example`): neue Env `WIZARD_URL` (Default Dev `http://localhost:5174`). `SUMUP_REDIRECT_URI` bleibt der eine registrierte Callback.

### Frontend (`onboarding-wizard/`) — Muster von `Step1Stammdaten` wiederverwenden
- [ ] Geteilte `Field`-Komponente extrahieren (heute in `Step1Stammdaten`) → `components/Field.tsx`.
- [ ] Step-Komponenten `Step2Steuerberater`, `Step3OAuthAccountant` (Platzhalter, conditional je `advisor_system`), `Step4InputChannel`, `Step5Archive`, `Step6POSConnector` (SumUp-Button + Rückkehr-Erkennung via `window.location.search ?pos_connected=sumup`), `Step7Summary` (Zusammenfassung + `completeWizard`).
- [ ] `App.tsx`: `current_step`-Switch auf alle 7 Schritte routen (`initialData=step_data[n]`, `onSaved=setSession`); Zurück-Navigation (lokaler Step-State, kann nicht über `current_step` hinaus); Skip→Premium-Aktion je Schritt.
- [ ] `lib/api.ts`: neue Fn `startSumupConnect(token) → { redirect_url }`.
- [ ] Native Inputs + manuelle Validierung (kein react-hook-form/zod im Frontend — bestehendes Muster), Design-System-Tokens.

### Tests
- [ ] Backend: `wizard-http.test.ts` um Step-2/4/5/6-Validierung (422 bei falschem Enum/Form) + SumUp-Bridge-Start (Redis-State gesetzt, `redirect_url` zurück) erweitern. Promotion-Pfad `complete` (2/4/5/6 → tenants) im Integrationstest prüfen.
- [ ] Frontend: je Step-Component Vitest (Render, Validierung, Submit→`saveStep`), analog `Step1Stammdaten.test.tsx`; Step6 Rückkehr-Erkennung; Step7 `completeWizard`.
- [ ] CI grün (lint + typecheck + tests + build), DB-Tests mit frischer DB ([[backend-db-test-fresh-db]]).
- [ ] code-reviewer-Agent gibt OK.

---

## Bau-Reihenfolge (bottom-up, sequenziell)

1. Backend Zod-Schemas (`wizard.types.ts`) + Enums.
2. `save-step.handler.ts` Schema-Map + Tests.
3. `config.ts` `WIZARD_URL`.
4. SumUp-Bridge: `OAuthState`-Erweiterung + Callback-Weiche + neue Route + Handler + Tests.
5. Frontend: `Field` extrahieren → Step2 → Step4 → Step5 → Step3 → Step6 → Step7.
6. `App.tsx` Navigation + `api.ts` `startSumupConnect`.
7. Tests komplettieren, Gate grün.

---

## Spec-Referenzen

- `Modulkonzept/Konzeptentwicklung/Onboarding_Wizard.md` §2.1–2.8 (alle Schritte), §4 (Tech-Stack)
- `m16-wizard` (bestehender Code) + `m15-pos-connector` (SumUp-OAuth wiederverwenden)

---

## Notes / Gotchas

- **tenant_id wird bewusst NICHT an den Client gespiegelt** (`PublicOnboardingSession`) → Schritt 4 kann die echte `t-{tenant}@beleg`-Adresse nicht anzeigen (Platzhalter-Text); alle tenant-gebundenen Live-Daten laufen über token-aufgelöste Brücken-Routen.
- **Promotion-Contract ist fragil** (`asString()`/Array-Filter ohne Enum-Prüfung): die Step-Formulare MÜSSEN exakt `step_data['2'].advisor_system` / `['4'].input_channels` (Array) / `['5'].archive_provider` / `['6'].pos_system` schreiben, sonst promotet `complete` still nichts. Strikte Backend-Zod-Schemas sind Pflicht.
- **SumUp End-to-End nur mit `SUMUP_CLIENT_ID/SECRET`** testbar; ohne Credentials nur bis zum Redirect.
- `sseManager`/Test-Beleg bewusst ausgelassen (Entscheidung GF) — nicht „nebenbei" mitbauen.

---

## Offene Fragen (während der Bearbeitung)

_(Scope per AskUserQuestion am 2026-06-24 geklärt: alles-in-einer-Task; SumUp echt; Test-Beleg = nur Abschluss-Screen. Übrige Recon-Fragen via Defaults oben.)_

---

## Lessons Learned (nach Abschluss)

_(nach Merge ausfüllen)_
