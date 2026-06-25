# T074 — Beleg-Status live in den Web-Chat (SSE `beleg.status`)

**ID:** T074
**Verantwortlich:** Steve
**Priorität:** P2
**Branch:** `steve/T074-beleg-status-sse`
**Geschätzt:** 0.5 Tag Claude-Code-Session
**Dependencies:** [T069, T070] — in `_done/`
**Ziel-Meilenstein:** Build-out Phase C (Web-Chat-Widget)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Aus T070 ausgegliedert: Der OCR-Worker (und M03-Kategorisierung) soll bei Beleg-Statuswechseln
`sseManager.emit(tenantId, 'beleg.status', { beleg_id, status })` pushen, damit der Wirt im
Web-Chat-Widget den Fortschritt seines hochgeladenen Belegs **live** sieht
(`received → extracting → extracted → categorized → exported`). Aktuell bekommt er nur das
`chat.message`-Event beim Upload (T069) — der Verarbeitungs-Fortschritt fehlt.

---

## Akzeptanz-Kriterien
- [ ] `updateBelegStatus` / `updateBelegOcrResult` / `updateBelegCategorization` (oder der
      OCR-Worker-Pfad) emittiert nach dem Commit `sseManager.emit(tenantId, 'beleg.status', …)`.
      **Nach** dem Commit (nicht in der Tx), best-effort (kein Fail bei Emit-Fehler).
- [ ] Nur Status-Metadaten im Payload (`beleg_id`, `status`) — **keine** PII/Extraktionsfelder.
- [ ] Tenant-scoped (wie T069); Wirt-`/:token/events` empfängt es bereits (gleicher Kanal).
- [ ] Test: Subscriber-Sink empfängt `beleg.status` nach einem Status-Update.
- [ ] CI grün, code-reviewer OK.

---

## Spec-Referenzen
- T069 (`sseManager.emit`-Verdrahtung), T070 (Web-Chat-Upload), `core/sse/sse.manager.ts`
- `m01-receipt-intake/services/beleg.repository.ts` (Status-Update-Funktionen), `workers/ocr-worker.ts`

---

## Notes
- SSE-Kanal ist im Pilot tenant-scoped (genau 1 aktiver Link/Tenant). Vor Multi-Session-pro-Tenant
  zusammen mit dem T069-TODO auf session-scoped umstellen.

---

## Lessons Learned (nach Abschluss)
_(nach Merge ausfüllen)_
