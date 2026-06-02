# T020 — receipt-flow.e2e.ts auf Discord-Auth + M14-Cookie umschreiben

> **Owner:** Steve (Webapp/Frontend)
> **Priorität:** P2 (nach KW22-Pilot)
> **Dependencies:** PR #64 gemerged
> **Welle:** 4
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md` + `Mitarbeiter_Webapp.md`

---

## Ziel

`webapp/src/tests/e2e/receipt-flow.e2e.ts` enthält 4 `test.describe`-Blöcke, alle aktuell mit `test.describe.skip` markiert. Sie testen ein veraltetes Login-Page-Design:
- Mandanten-Dropdown auf Login-Page
- "Anmelden"-Button als Primär-CTA
- `sessionStorage.setItem('pp_session', ...)` als Login-State

Aktuelle Architektur:
- Discord-OAuth ist Primär-Pfad
- Notfall-Login (Email+Passwort+TOTP) ist Sekundär, zugeklappt
- Auth-State läuft über M14-Cookie-Session (`pp_auth`), nicht über sessionStorage

---

## Akzeptanz-Kriterien

- [ ] `G1 — Receipt-Flow` umgeschrieben:
  - [ ] "Login-Page ist erreichbar" prüft Discord-Login-Button (kein "Anmelden")
  - [ ] "Login-Flow" Notfall-Login-Toggle öffnen + Email/Passwort/TOTP setzen
  - [ ] "Upload-Page nach Login erreichbar" nutzt M14-Cookie-Session-Stub (wie `auth.e2e.ts`)
- [ ] `G1 — Multi-Tenant-Switch` umgeschrieben oder entfernt (Mandanten-Dropdown gibt's nicht mehr auf Login-Page)
- [ ] `G1 — DSGVO-Lösch-Flow` umgeschrieben mit M14-Session
- [ ] `G1 — Steuerberater-Export-Download` umgeschrieben mit M14-Session
- [ ] Alle `test.describe.skip` entfernt
- [ ] CI grün

---

## Hintergrund

Diese Tests wurden in PR #64 (`steve/fix-webapp-jsdom-msw`) komplett geskippt. Damals stand der jsdom-Fix im Fokus, um 4 Andreas-PRs zu entblocken. Die E2E-Tests waren auf `main` durch Skip-Dependency der gebrochenen Webapp-Vitest-Tests latent versteckt und decken jetzt veraltete Spec-Erwartungen auf.

Der `auth.e2e.ts`-stubAuth-Helper aus PR #64 ist eine gute Blaupause für den M14-Cookie-Session-Mock.

---

## Hinweise

- TOTP-Code im Stub: `'123456'` (6 Ziffern, clientseitig validiert, Backend-Mock akzeptiert alles)
- `__ppLoggedIn`-Flag im window-Scope für State-Tracking (siehe `auth.e2e.ts:36-44`)
- Mock-Pfade: `/api/v1/auth/notfall/login`, `/api/v1/auth/session`, `/api/v1/auth/logout`
