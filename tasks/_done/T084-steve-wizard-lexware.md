# T084 — Wizard Schritt 3: echte Lexware-Office-Anbindung (API-Key + Live-Check)

**ID:** T084
**Verantwortlich:** Steve
**Priorität:** P1 (Build-out Phase B — Wizard-Folge-PR, kritischer Pfad)
**Branch:** `steve/T084-wizard-lexware`
**Dependencies:** T016/T017/T067 (Wizard), M05 (Lexware-Export) — alle ✅
**Ziel-Meilenstein:** Build-out Phase B (Onboarding self-service)

---

## Was zu tun ist

Schritt 3 des Onboarding-Wizards (`setup.prozesspilot.net`) von einem „kommt bald"-Platzhalter
auf eine **echte Lexware-Office-Anbindung** umstellen.

**Spec-Klärung (entscheidend):** Lexware Office hat **kein OAuth** — die Anbindung läuft über einen
**statischen API-Key** (Migration 100 `booking_credentials` speichert nur `api_token_encrypted`,
kein refresh/expiry; M05-Spec „Default: API-Key"; Bootstrap-Skript liest genau diesen Key). Daher
**kein OAuth-Redirect wie SumUp**, sondern ein **API-Key-Eingabefeld**.

**GF-Entscheidung (Steve):** API-Key-Eingabe im Wizard, **überspringbar** (Key gehört oft der
Steuerberaterin → später nachreichbar) + **Live-Check** (Token wird vor dem Speichern gegen
Lexware geprüft).

## Umfang

**Backend:**
- `lexoffice.client.ts`: neue Methode `getProfile()` (GET /v1/profile) für den Live-Check.
- `lexware-validate.service.ts` (neu): `validateLexwareToken` → ok+Firmenname / rejected (401/403) / unreachable (Netz/5xx).
- `connect-lexware.handler.ts` (neu): `POST /api/v1/wizard/:token/connect/lexware` — Session auflösen (nur `started`), Body validieren, Live-Check (rejected→422, unreachable→502), Token verschlüsselt in `booking_credentials` speichern (**Customer-Actor**, da kein Staff-User im Wizard).
- `booking-credentials.repository.ts`: `upsertBookingCredential` um optionalen `actor` erweitert (rückwärtskompatibel; Wizard nutzt `{type:'customer',id:null}`).
- `wizard.routes.ts`: Route registriert (öffentliches Plugin).

**Frontend (`onboarding-wizard/`):**
- `lib/api.ts`: `connectLexware(token, apiToken, displayName?)` → `{ ok, company_name }`.
- `steps/Step3OAuthAccountant.tsx`: Lexware-Branch = API-Key-Eingabe + „Speichern & prüfen" + „Überspringen — später nachreichen" + Verbunden-Ansicht (Firmenname). Andere Steuerberater-Systeme (DATEV-CSV/unbekannt) unverändert.

## Sicherheit

- Token nie im Response/Log; pgcrypto-verschlüsselt in `booking_credentials` (RLS, tenant-isoliert).
- Live-Check fängt ungültige Keys früh ab (nicht erst beim ersten Export).
- Öffentlicher Endpoint: Magic-Link-Token = Credential; Tenant via SECURITY-DEFINER-Lookup; nur `started`-Session editierbar; Per-Route-Rate-Limit.

## Tests

- `connect-lexware.test.ts` — 7 HTTP-Tests (404/410/409, 422-Schema, 422-rejected, 502-unreachable, 200-happy mit Customer-Actor + kein Token-Echo).
- `lexware-validate.service.test.ts` — 6 Unit-Tests (ok/rejected 401+403/unreachable 5xx+Netz).
- `Step3OAuthAccountant.test.tsx` — 5 (verbinden→Weiter, Disabled-Gate, Überspringen, abgelehnt-Fehler, DATEV-CSV).
- `api.test.ts` — +2 (connectLexware Happy + 422-Mapping).

## Status

✅ Implementiert. Backend 862 passed/34 skipped + Biome sauber; onboarding-wizard tsc + 36 passed + build grün.

**Bewusste Grenzen / Folge:** kein automatisches Befüllen der `lexoffice_category_map` beim Connect (passiert beim ersten Export, T054); Google-Drive/Dropbox-OAuth (Schritt 5) bleibt separater Wizard-Folge-PR.
