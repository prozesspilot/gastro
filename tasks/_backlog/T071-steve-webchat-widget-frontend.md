# T071 — Web-Chat: Widget-Frontend (neue Vite-App)

**ID:** T071
**Verantwortlich:** Steve
**Priorität:** P0
**Branch:** `steve/T071-webchat-widget`
**Geschätzt:** 2 Tage Claude-Code-Session
**Dependencies:** [T068, T069, T070] — müssen in `_done/`
**Ziel-Meilenstein:** Build-out Phase C (Web-Chat-Widget)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Die Customer-Oberfläche: eine **neue Vite-App `web-chat-widget/`** (Schwester von
`onboarding-wizard/`), die der Wirt per Magic-Link `chat.prozesspilot.net/{token}` öffnet.
Ein Thread, zwei Funktionen: **Support-Text senden/empfangen** und **Beleg-Foto/Datei hochladen**
(→ belege-Pfad). Marke **„ProzessPilot"**, ProzessPilot-Light-Design, **mobil-first** (der Wirt
fotografiert am Handy).

---

## Akzeptanz-Kriterien

- [ ] Neue App `web-chat-widget/` nach Vorlage `onboarding-wizard/` (React 18 + Vite 5 + TS strict,
      vitest 2.1, **jsdom 25.0.1-Pin** — Memory `webapp-test-stack`). Vite-Port 5175,
      `/api`-Proxy → backend.
- [ ] Token-als-Credential: Token aus URL-Pfad (`getTokenFromPath` analog
      `onboarding-wizard/src/App.tsx`), **kein** Bearer/JWT, **kein** `x-pp-tenant-id`.
      Eigener `src/lib/api.ts` (BASE `/api/v1/chat`, Token im Pfad, `ChatApiError` mit status+code,
      404/410-Handling = „Link ungültig/abgelaufen").
- [ ] `useChatSession(token)`-Hook (loading/ready/error, active-Flag gegen Race) — lädt Session +
      bisherigen Verlauf beim Mount.
- [ ] **Support:** Nachrichtenliste (neueste unten), Eingabefeld, Quick-Reply-Buttons bei
      strukturierten Rückfragen; Live-Empfang neuer Staff-Antworten via **SSE** (T069),
      **Polling-Fallback** alle ~5 s.
- [ ] **Eingangskanal:** Datei/Foto-Upload (Multipart-FormData → `POST /chat/:token/belege`),
      Upload-Progress, hochgeladenes Beleg erscheint als Bubble; Status (in Prüfung/erkannt) wenn
      `beleg.status`-Event kommt.
- [ ] Design-System: `src/index.css`-Tokens aus `onboarding-wizard` übernehmen (Azure #0A95E0,
      Poppins/Manrope), **keine** hartkodierten Farben; „ProzessPilot Chat"-Header, dezenter
      „Powered by ProzessPilot"-Footer; Du-Anrede, einfache Sprache.
- [ ] Mobil-first: Vollbild, Tap-Targets ≥ 44 px; PWA-/Mobile-Meta in `index.html`.
- [ ] Tests (vitest + @testing-library): Token-Laden (ready/410/404), Nachricht senden,
      Upload-Flow (MSW). Coverage ≥ 80 %. code-reviewer OK. CI grün.

---

## Spec-Referenzen
- `Web_Chat_Widget.md` §2.x/§3.x (UI, Mobile, Branding) — auf belege-Welt portiert
- Referenz: `onboarding-wizard/` (App, lib/api, hooks, index.css, index.html, tests)
- Memory `webapp-design-system`, `webapp-test-stack`

---

## Offene Fragen (während der Bearbeitung)
- Gemeinsamer Thread (Message-Typen text/file/system) vs. zwei Streams → **gemeinsamer Thread**
  (entschieden, deckt sich mit T069-`chat_messages`).
- Same-origin Support-Einbettung auf `prozesspilot.net` = **Folge** (T072-Notes), nicht hier.

---

## Lessons Learned (nach Abschluss)
_(nach Merge ausfüllen)_
