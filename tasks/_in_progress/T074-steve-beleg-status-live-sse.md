# T074 — Beleg-Status Live-SSE: Webapp-Consumer + Endpoint absichern

**ID:** T074
**Verantwortlich:** Steve
**Priorität:** P2
**Branch:** `steve/T074-beleg-status-live-sse`
**Geschätzt:** 0,5–1 Tag
**Dependencies:** SSE-Backend (sseManager + emitBelegStatus + Emits an allen 6 Status-Writern) bereits gebaut & getestet
**Ziel-Meilenstein:** Build-out Phase C (Staff-Betreuung) / Audit-Blocker „SSE tot"
**Anker:** Memory `buildout-phase-status`/`audit-2026-06-24-pilot-blocker`; `backend/src/routes/sse.ts`; `backend/src/core/sse/`; Web-Chat-EventSource-Muster `web-chat-widget/src/components/ChatWindow.tsx`

---

## Ausgangslage (verifiziert per Read-only-Recherche 2026-06-30)

Der **Backend-/Worker-Teil ist bereits erledigt und getestet**:
- `sseManager` (tenant-scoped subscribe/emit), `emitBelegStatus(tenantId, belegId, status)` (PII-frei `{beleg_id,status}`, nach Commit, best-effort).
- Emits an allen 6 Status-Writern (`updateBelegStatus`, `confirmBelegReview`, `updateBelegCategorization`, `updateBelegOcrResult`, `markBelegOcrFailed`, `markBelegExported`) → deckt den ganzen OCR-Worker-Pfad (extracting → extracted/requires_review → categorized → error) + Export ab.
- Integrationstest `beleg-status-sse.test.ts` (grün-fähig, testet alle 6 Writer + PII-Garantie).

**Was fehlt (= dieser Task):**
1. Die **Mitarbeiter-Webapp konsumiert SSE gar nicht** (kein `EventSource`, kein Polling). Status aktualisiert sich nur durch manuelles Neuladen.
2. `/api/v1/events` erwartet den Tenant als **Header** `x-pp-tenant-id` — `EventSource` kann aber keine Custom-Header setzen. Außerdem ist die Route **auth-frei** (nur Tenant-Header), für einen Staff-Stream ein Sicherheits-Punkt.

**GF-Entscheidung (2026-06-30):** Option A — echtes SSE + Endpoint absichern. Cookie-Auth (`pp_auth` JWT, von EventSource same-origin automatisch mitgesendet) + Tenant aus Query-Param.

---

## Was zu tun ist

### Backend — `backend/src/routes/sse.ts`
- Auth erzwingen: `getM14Staff(req)` (liest `pp_auth`-Cookie); kein gültiges Cookie → **401**.
- Tenant aus **Query-Param** `?tenant=<id>` lesen (primär), `x-pp-tenant-id`-Header als Fallback (rückwärtskompatibel); fehlt beides → **400**.
- Auth-/Tenant-Auflösung in eine **reine Helper-Funktion** `resolveSseSubscription(req)` extrahieren (testbar ohne den `reply.hijack()`-Stream).
- Per-Route `config.rateLimit` ergänzen (CodeQL-Falle, siehe Memory `codeql-missing-rate-limiting`).
- Header-Kommentar aktualisieren (nicht mehr „öffentlich/kein HMAC").

### Webapp
- Shared Hook `webapp/src/hooks/useBelegStatusStream.ts`: öffnet `EventSource('/api/v1/events?tenant=<id>')` (Guard `typeof EventSource === 'undefined'`, Guard kein Tenant), hört `beleg.status`, parst `{beleg_id,status}`, ruft `onStatus`-Callback; cleanup (removeEventListener + close).
- `BelegeListPage.tsx`: Hook einbinden; eingehende Events patchen den Status der betroffenen Zeile in-place (`setBelege(prev => prev.map(...))`). Callback via `useCallback` stabil halten (sonst Re-Subscribe pro Render).

(Detail-Seite Live-Update = optionaler Folge-Schritt; dieser Task liefert die Queue-/Listen-Ansicht — den primären Operator-Mehrwert.)

---

## Akzeptanz-Kriterien
- [ ] `/api/v1/events` ohne gültiges `pp_auth`-Cookie → 401
- [ ] mit Cookie + `?tenant=<id>` → subscribe auf den Tenant-Kanal; Header-Fallback bleibt funktionsfähig
- [ ] mit Cookie, aber ohne Tenant (weder Query noch Header) → 400
- [ ] Webapp-Belege-Liste aktualisiert den Status einer Zeile live, wenn ein `beleg.status`-Event eintrifft (Test mit gemocktem `EventSource`)
- [ ] Hook ist robust: kein `EventSource` (jsdom) → no-op; kein aktiver Tenant → no-op; fehlerhaftes Event → ignoriert
- [ ] Backend `npm run lint` + build + Tests grün; Webapp tsc + Tests grün; CodeQL grün

---

## Spec-Referenzen
- `backend/src/routes/sse.ts` (Route)
- `backend/src/core/sse/sse.manager.ts`, `backend/src/core/sse/beleg-status.ts`
- `backend/src/core/auth/m14-staff-auth.ts` (`getM14Staff`), `backend/src/modules/m14-auth/m14-jwt.ts`
- `web-chat-widget/src/components/ChatWindow.tsx` (EventSource-Muster)
- `webapp/src/pages/BelegeListPage.tsx`, `webapp/src/api/_client.ts` (`getActiveTenantId`)

---

## Notes
- Tenant-Modell: Staff ist cross-tenant; nach Authentifizierung wird der Client-gelieferte Tenant (Query/Header) vertraut — konsistent mit dem Rest der App (`x-pp-tenant-id`).
- Broadcast-Scope: Der SSE-Kanal ist tenant-weit; `beleg.status` erreicht damit auch den Wirt-Chat-Stream. Falls je unerwünscht → event-/rollen-spezifisches Routing als Folge-Task (heute kein Bedarf, Events sind PII-frei).
