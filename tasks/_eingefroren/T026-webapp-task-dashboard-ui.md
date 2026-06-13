# T026 — Webapp Task-Dashboard (/tasks Liste + Detail, Mock ersetzen)

> **Owner:** Steve (Frontend/Webapp)
> **Priorität:** P1 (Pilot — das ist die sichtbare „Admin-Seite wirkt wie früher"-Lücke)
> **Dependencies:** **T025** (Task-Backend-API) gemerged
> **Welle:** 7
> **Spec-Referenzen:** `Mitarbeiter_Webapp.md` §3.1 (Dashboard), §3.3 (Task-Dashboard, TaskList + TaskDetail), §9 (UI-Prinzipien)
> **Audit:** REPORT-2026-05-26 F01

---

## Ziel

Die `webapp/src/data/tasks.ts`-**Mock-Liste** durch echte Task-Daten aus der API (T025) ersetzen und das Task-Dashboard gemäß §3.3 bauen. Das ist die Komponente, deren Fehlen dazu führt, dass die Admin-Seite „wie früher" aussieht.

---

## Akzeptanz-Kriterien

- [ ] Neue Route `/tasks` im Router (`webapp/src/App.tsx`), in der Navigation verlinkt.
- [ ] **TaskList** (§3.3): 3 Tabs „Meine offenen" / „Team-Tasks" / „Erledigt"; Filter (Tenant, Typ, Priorität, Fälligkeit); Sortierung Default nach Fälligkeit; Quick-Actions (Übernehmen / Erledigt / Pausieren / Verwerfen / Helfer einladen) gegen T025-Endpunkte.
- [ ] **TaskDetail** (§3.3): vollständige Beschreibung, verknüpfte Daten (z.B. Beleg-Vorschau bei `beleg_pruefen`), Aktivitäts-Log, typ-abhängige Aktionen.
- [ ] **Dashboard** (`DashboardPage.tsx`) zieht „Meine offenen Tasks (oberste 5)" + „blockierende Tasks" aus der echten API statt aus `data/tasks.ts`.
- [ ] `webapp/src/data/tasks.ts` (Mock) entfernt oder nur noch in Tests als Fixture.
- [ ] API-Calls relativ über `BASE = '/api/v1'` mit `credentials: 'include'` (bestehendes Pattern).
- [ ] Vitest-Tests für TaskList/TaskDetail (MSW-Mocks); `tsc` + Build + CI grün.

---

## Hinweise

- Dark-Mode-Tailwind-Patterns + bestehende Page-Struktur als Vorlage (z.B. `BelegeListPage`, `ReceiptsPage`).
- UI-Prinzip §9.2: „Geschwindigkeit > Schönheit" — schnelle Liste, Tastatur-Shortcuts (§9.3) wo sinnvoll.
- Mock-Datei-Constraint beachten: keine `localStorage`-abhängigen Tests, die unter Node 26 lokal brechen (siehe Memory webapp-test-stack).
