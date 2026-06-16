# T059 — Webapp-Reboot PR 1: Geister-Welt raus + Auth-Shell + Tenant-Selector + Dashboard + Belege-Liste

**ID:** T059
**Verantwortlich:** Steve
**Priorität:** P1 (Build-out A3 — interne Staff-Webapp nutzbar machen)
**Branch:** `steve/T059-webapp-reboot-pr1`
**Geschätzt:** L (Teil 1 von 3 des A3-Reboots; T060 Detail/Korrektur, T061 Tenants-Admin)
**Dependencies:** T058 (`GET /api/v1/tenants`) gemerged
**Anker:** A3-Design-Spike (Memory `a3-webapp-reboot-plan`) · `Mitarbeiter_Webapp.md` · CLAUDE.md §3.2/§5.2

---

## Was zu tun ist (überwiegend Streichen + Umverdrahten, kein Neubau)

**1. DROP (Geister-Welt-gebunden, löschen)** — Pages + zugehörige `.test.tsx`:
ReceiptsPage, ReceiptDetailPage, CustomersPage, CustomerDetailPage, CustomerProfilePage, PluginsPage,
CommunicationsPage, ReportsPage, StatsPage, AdvisorPortalPage, UsersPage (+ UserFormModal), UploadPage,
ChangePasswordPage. APIs (+ `.test.ts`): receipts, customers, plugins, communications, reports, stats,
advisor, users, dsgvo. Hooks: `useReceiptEvents`. E2E: `receipt-flow.e2e`.

**2. REWIRE (bleibt, wird angefasst):**
- `App.tsx` → nur Routen `/login`, `/` (Dashboard), `/belege`, `/belege/upload`, `/belege/:id`, `/tenants`, `/settings`, `*`.
- `components/Layout.tsx` → Nav: Dashboard/Belege/Mandanten/Einstellungen; Pending-Badge auf `listBelege({status:'requires_review'})` statt Geister-`/receipts/stats`; Breadcrumb-labelMap entschlacken.
- `auth/AuthContext.tsx` `m14UserToAuthUser` (**Bug-Fix**): gf→`['*']`, mitarbeiter→`['belege.read','belege.write','tenants.read']`, support→`['belege.read','tenants.read']`.
- `api/index.ts` Barrel → nur belege, tenants, categories, health, auth.
- `DashboardPage.tsx` → Status-Aggregat via `listBelege` statt `fetchReceiptStats`.
- `SettingsPage.tsx` → Geister-API-Teile raus; nur Health/Ready.
- `tests/msw/handlers.ts` → nur /belege, /belege/:id, /tenants, /auth/session, /health, /categories.

**3. NEU: Tenant-Selector** (Topbar/Layout): lädt `GET /api/v1/tenants`, `setActiveTenantId()` → setzt `x-pp-tenant-id` für die belege-Calls. Ohne aktiven Tenant: Auswahl-Hinweis.

**4. `package.json`:** jsdom exakt `25.0.1` pinnen (Memory `webapp-test-stack`).

## Akzeptanz-Kriterien
- [ ] `grep -rE "receipts|customers|/plugins|communications|/reports|/stats|/advisor|/users" webapp/src/api webapp/src/pages` = 0 (außer belege/categories)
- [ ] App.tsx hat nur die o.g. Routen; eingeloggter mitarbeiter sieht Dashboard + Belege-Liste
- [ ] Layout-Sidebar ohne Geister-Einträge; Pending-Badge via /belege
- [ ] AuthContext-Permission-Map auf belege-Welt (Unit-Test)
- [ ] Tenant-Selector lädt /tenants + setzt aktiven Tenant
- [ ] `npm run build` + `npm test` + `npm run lint` (webapp) grün; CI grün (Node 20)

## Nicht in dieser Task (Folge)
Belege-Detail/Korrektur + Upload-Aktionen → T060 · Mandanten-Admin → T061 · Task-System/Chat/DSGVO-UI → Phase C.

## Spec-Referenzen
- Memory `a3-webapp-reboot-plan` (vollständige DROP/KEEP/REWIRE-Listen)
- `webapp/src/auth/AuthContext.tsx`, `components/Layout.tsx`, `App.tsx`, `api/_client.ts` (getActiveTenantId)
