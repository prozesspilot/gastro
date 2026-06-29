# T082 — Mitarbeiter-Aufgaben-Dashboard: Webapp-Seite (/tasks)

**ID:** T082
**Verantwortlich:** Steve
**Priorität:** P1 (Build-out — Mitarbeiter-Aufgaben-Dashboard, Frontend)
**Branch:** `steve/T081-T082-tasks-dashboard`
**Dependencies:** T081 (Backend-API) ✅
**Ziel-Meilenstein:** Build-out Phase C (Task-System)

---

## Was zu tun ist

Sichtbare Seite in der Mitarbeiter-Webapp (`admin.prozesspilot.net/tasks`), die die T081-API
nutzt. **Bewusst cross-tenant** — anders als die Belege-/Chat-Seiten **kein** `NoTenantHint`-Guard
(das Dashboard zeigt Aufgaben über alle Mandanten hinweg).

**Anker:** `Mitarbeiter_Webapp.md` §4.1–4.3, ChatsPage/BelegeListPage als Muster, Light Design System
(Memory `webapp-design-system`).

## Umfang

- `webapp/src/api/tasks.ts` — API-Modul (list/get/create/status/update/collaborator/assignees).
- `webapp/src/pages/TasksPage.tsx` — Tabs (Meine/Team/Erledigt), Tabelle mit Prio/Status/Mandant/
  Zuweisung/Fälligkeit, Schnellaktionen (Übernehmen/Pausieren/Fortsetzen/Erledigt/Wieder öffnen),
  Anlegen-Modal (Zuweisung rollenabhängig: GF → Dropdown, Mitarbeiter → „mir zuweisen").
- Rollen-Gate in der UI: `support` sieht keinen Anlegen-Button und keine Aktionen (read-only) —
  spiegelt nur das serverseitige Gate aus T081.
- `App.tsx` (`/tasks`-Route) + `Layout.tsx` (Nav-Eintrag „Aufgaben" ✓ + Breadcrumb-Label).

## Tests

- `webapp/src/pages/TasksPage.test.tsx` — 7 Tests (Liste, Empty, Error, Tab-Wechsel, „Übernehmen"
  schickt Status, support read-only, Anlegen-Modal). Vitest + MSW + Testing Library.

## Status

✅ Implementiert. `tsc --noEmit` + Vitest (237 webapp passed) + `vite build` grün.
