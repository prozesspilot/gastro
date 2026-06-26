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
- [x] `updateBelegStatus` / `updateBelegOcrResult` / `updateBelegCategorization` (oder der
      OCR-Worker-Pfad) emittiert nach dem Commit `sseManager.emit(tenantId, 'beleg.status', …)`.
      **Nach** dem Commit (nicht in der Tx), best-effort (kein Fail bei Emit-Fehler).
      → `core/sse/beleg-status.ts` (`emitBelegStatus`), verdrahtet in allen 6 Status-Writern
      (5× `beleg.repository.ts` + `markBelegExported` für `exported`).
- [x] Nur Status-Metadaten im Payload (`beleg_id`, `status`) — **keine** PII/Extraktionsfelder.
      → Test asserted `toEqual({beleg_id,status})` + PII-Guard (kein raw_text/Lieferant im Stream).
- [x] Tenant-scoped (wie T069); Wirt-`/:token/events` empfängt es bereits (gleicher Kanal).
- [x] Test: Subscriber-Sink empfängt `beleg.status` nach einem Status-Update.
      → 5 Integrationstests (echtes Postgres): extracting/extracted/categorized/error +
      Negativ-Fall (nicht-existenter Beleg → KEIN Emit).
- [ ] CI grün, code-reviewer OK. *(läuft auf dem PR — lokal kein Node/npm-Toolchain auf
      diesem Rechner, daher build/test/lint ausschließlich in CI; statisch + adversarial
      3-Lens-reviewt: Biome-Import-Order-Blocker gefunden & gefixt.)*

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

- **Repository-Schicht emittiert SSE** (wie T069 `chat.message`): zentraler Best-Effort-Helper
  `core/sse/beleg-status.ts`, aufgerufen **nach** `COMMIT` in allen 6 Status-Writern — ein
  Pfad statt Verdrahtung pro Aufrufer (OCR-Worker/Webapp/Export profitieren automatisch).
- **rowCount/`if(updated)`-Gate ist Pflicht:** der Emit darf nie für einen nicht-committeten
  Statuswechsel feuern. `markBelegExported` emittierte zunächst unbedingt → im Review auf
  `RETURNING id` + `if (rowCount === 1)` gehärtet (Symmetrie zu den M01-Writern).
- **PII-Garantie strukturell:** Payload hart auf `{beleg_id, status}` begrenzt; Test mit
  `toEqual` (exakt) statt nur Substring-Checks beweist, dass nichts aus `payload.extraction`
  in den Wirt-Stream leakt (§6.6).
- **DB-Test-Cleanup:** `audit_log` ist append-only (BEFORE-DELETE-Trigger) → Löschen nur in
  einer Tx mit `SET LOCAL app.bypass_rls/app.audit_maintenance = 'on'` (Pattern aus
  `tests/migrations/schema.test.ts`) → Test lokal re-runnable, nicht nur in der ephemeren CI-DB.
- **Lokaler Toolchain nachgerüstet:** Node 20 unter `%LOCALAPPDATA%\nodejs20` installiert; seither
  build/lint/test lokal fahrbar (DB-Tests brauchen zusätzlich Postgres — laufen sonst nur in CI).
  Windows-Checkout brauchte `core.autocrlf=false`, sonst meckert biome CRLF.
