---
name: a3-webapp-reboot-plan
description: "A3 Webapp-Reboot — re-sequenzierter Plan (Backend /tenants zuerst), Tenant-Context-Mechanik, 2 mitzufixende Bugs"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9dad7ad0-0b6a-43a0-9a23-ca3262a982f2
---

Build-out Phase A3 (interne Mitarbeiter-Webapp aus der toten Legacy-Kunden-App). Design-Spike 2026-06-16 gemacht (Konzept-SOLL vs. Code-IST, code-verifiziert). Es ist überwiegend **Streichen + Umverdrahten**, kein Neubau — Auth-Gerüst/API-Client/Belege-Pages existieren und sind gesund.

**Steve-Entscheidungen (2026-06-16):** (1) **Clean Multi-Tenant**, KEIN fest verdrahteter Pilot-Tenant — der Pilot wird „wie jeder andere Kunde" als Tenant-Zeile geführt + per Tenant-Selector gewählt. (2) Styling: custom-CSS behalten, Tailwind-Migration (CLAUDE.md §6.1) als spätere Task.

**Tenant-Context (war der Blocker):** Backend `m14TenantContextHook` (`core/auth/m14-tenant-context.ts:41`) **verlangt** Header `x-pp-tenant-id` (UUID, sonst 400), leitet NICHT aus der Session ab. Frontend sendet ihn aus `localStorage` (`getActiveTenantId`/`setActiveTenantId` in `webapp/src/api/_client.ts`). → Es braucht eine Tenant-Auswahl im UI.

**Re-sequenzierter PR-Schnitt:**
- **T058 (Backend) ✅ ERLEDIGT (PR #133, 2026-06-16):** `GET /api/v1/tenants` LIVE — SECURITY-DEFINER-Funktion `list_tenants_for_staff()` (Migration 121), setzt `app.bypass_rls` lokal, fixe nicht-sensible Spalten, REVOKE PUBLIC + GRANT gastro_app. m14StaffAuthHook (alle Rollen inkl. support dürfen lesen — bewusst, für den Selector), KEIN TenantContext. Integration-Test übt den echten gastro_owner-Pfad. → Webapp kann jetzt Mandanten listen.
- **T059 (Webapp Reboot PR 1) ✅ ERLEDIGT (PR #136, 2026-06-16):** Geister-Welt gelöscht (−13.208 Z.), App.tsx auf /login,/,/belege,/belege/upload,/belege/:id,/tenants,/settings,*; Layout-Nav entschlackt + Pending-Badge auf `listBelege({status:'requires_review'})`; **TenantSelector** (`components/TenantSelector.tsx`, GET /tenants → setActiveTenantId → `window.location.reload()`); beide AuthContext/Layout-Bugs gefixt; jsdom exakt 25.0.1. **Wichtig für T060/T061:** alle belege-Seiten haben jetzt einen **noTenant-Guard** (kein API-Call ohne aktiven Tenant → `components/NoTenantHint.tsx` statt 400) — d.h. ihre Tests müssen `getActiveTenantId` mocken (`vi.mock('../api', () => ({ getActiveTenantId: () => 'tenant-001' }))`), sonst greift der Guard und die Liste/Detail lädt nie. Server-Rollen-Schreib-Gate: **T062 ✅ ERLEDIGT (PR #148, 2026-06-18)** — Befund: das Gate existierte schon inline in JEDEM Schreib-Handler (update/delete/categorize/lexware-push/batch/upload → `support` 403 bzw. nur `geschaeftsfuehrer`; `reprocess` bewusst für support offen), samt Tests; in T059/T060 mitgebaut. GF-Entscheidung: minimal abschließen (kein zentraler requireRole-Hook, kein Audit-bei-Reject), nur den veralteten AuthContext-Kommentar korrigiert. UI-Permission-Map ist also NICHT nur kosmetisch — der Server gatet deckungsgleich.
- **T060/T061:** Belege-Detail/Korrektur + Upload + Aktionen; Mandanten-Admin. Wiederverwendbare Bausteine dafür (StatusBadge/CategoryBadge/ConfidenceBadge/ConfirmModal) sind bewusst stehen geblieben (sonst Churn) — falls T060 sie nicht nutzt: löschen.

Vollständiger Spike-Output war in der Workflow-Task `w2ywp2av9` (temp). Beim Bauen je Task neu als Spec übernehmen. Arbeitsweise unverändert: [[review-merge-flow-solo]] (sequenziell, /start-task → PR → code-reviewer → --admin-Merge → _done).
