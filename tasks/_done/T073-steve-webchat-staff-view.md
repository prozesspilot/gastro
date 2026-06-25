# T073 — Web-Chat: Staff-Chat-Ansicht in der Mitarbeiter-Webapp

**ID:** T073
**Verantwortlich:** Steve
**Priorität:** P1
**Branch:** `steve/T073-webchat-staff-view`
**Geschätzt:** 1 Tag Claude-Code-Session
**Dependencies:** [T069] — muss in `_done/` (T070 hilfreich, nicht zwingend)
**Ziel-Meilenstein:** Build-out Phase C (Web-Chat-Widget)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Die **Staff-Gegenseite**: In der **bestehenden** Mitarbeiter-Webapp (`admin.prozesspilot.net`)
eine Chat-Ansicht, in der Staff eingehende Customer-Chats sieht und beantwortet — Discord-OAuth-
geschützt, auf den aktiven Mandanten gescopet. **Keine neue App.**

---

## Akzeptanz-Kriterien

- [ ] Neue Pages `webapp/src/pages/ChatsPage.tsx` (Liste) + `ChatDetailPage.tsx` (Thread),
      Routen `/chats` + `/chats/:id` in `webapp/src/App.tsx` innerhalb `ProtectedRoute`/`Layout`/
      `ErrorBoundary` (Discord-OAuth wie der Rest).
- [ ] Nav-Eintrag in `Layout.tsx` (`{ to:'/chats', icon:'💬', label:'Chats' }`) + Pending-Badge für
      **offene/unbeantwortete** Chats (bestehendes Polling-Badge-Muster, 30 s, wie `requires_review`).
- [ ] Neuer Client `webapp/src/api/chats.ts` über `apiRequest` (Bearer + `x-pp-tenant-id` via
      `getActiveTenantId`): `listChats({status})`, `getChat(id)` + Verlauf, `sendStaffReply(id,text)`.
      In `api/index.ts` re-exportieren.
- [ ] Detail-View: Tenant/Mandant, eingegangene Belege (Link in bestehende `/belege/:id`-Detailseite),
      Support-Nachrichten in einem Thread; Antworten im selben Thread. Bestehende Bausteine
      (`ToastProvider`, `StatusBadge`, `EmptyState`, `Skeleton`, `ConfirmModal`) wiederverwenden.
      `TenantSelector` scopet die Liste.
- [ ] Live-Aktualisierung via SSE (T069) wenn vorhanden, sonst Polling.
- [ ] Tests (vitest + MSW): `getActiveTenantId`-Mock + `noTenant`-Guard beachten (Memory
      `webapp-test-stack`); Liste/Detail/Reply. Coverage ≥ 80 %. code-reviewer OK. CI grün.

---

## Spec-Referenzen
- `Web_Chat_Widget.md` §8 (Staff-Gegenseite), `Mitarbeiter_Webapp.md` (Webapp-Konventionen)
- Referenz: `webapp/src/pages/BelegeListPage.tsx`, `components/Layout.tsx`, `api/_client.ts`, `api/belege.ts`
- Memory `webapp-test-stack`, `webapp-design-system`, `a3-webapp-reboot-plan`

---

## Offene Fragen (während der Bearbeitung)
- Staff-Benachrichtigung bei neuer Customer-Message ohne Discord-Bot (noch ungebaut): Webapp-
  Polling-Badge reicht für den Piloten; Discord-Bridge (#support-tickets) ist Phase E.

---

## Lessons Learned (Implementierung 2026-06-25)
- **Staff-Live = Polling, KEIN SSE:** Der `/api/v1/events`-SSE-Kanal liest den Tenant aus dem
  Header `x-pp-tenant-id` — EventSource kann aber keine Header setzen. Für die Staff-Webapp daher
  Polling (Chat-Liste 30 s, Thread 10 s) statt SSE. Der Widget-Wirt nutzt SSE via Token-im-Pfad
  (`/:token/events`); für Staff gibt es keinen header-losen SSE-Pfad → Polling ist korrekt.
- **Unread-Badge:** Layout pollt zusätzlich `listChats()` und summiert `unread_count` → Pending-Dot
  auf `/chats` (gleiches Muster wie der requires_review-Badge auf `/belege`).
- **Lokale Test-Falle (bekannt):** `npm test` bricht lokal an `_client.test.ts` + `ProtectedRoute.test.tsx`
  (8 Tests) mit „localStorage undefined" — Node-lokal ohne `--localstorage-file` (Memory
  `webapp-test-stack`: CI=Node 20 grün). NICHT durch T073 verursacht; Chat-Tests nutzen gemocktes
  `getActiveTenantId`. tsc + build + die 7 neuen Chat-Tests sind grün.
- Beleg-Nachrichten (chat_messages.beleg_id) verlinken in die bestehende `/belege/:id`-Detailseite.
