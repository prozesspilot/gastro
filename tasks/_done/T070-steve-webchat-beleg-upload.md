# T070 — Web-Chat: Beleg-Upload übers Widget → belege-Pfad (Backend)

**ID:** T070
**Verantwortlich:** Steve
**Priorität:** P0
**Branch:** `steve/T070-webchat-upload`
**Geschätzt:** 1 Tag Claude-Code-Session
**Dependencies:** [T068, T069] — müssen in `_done/`
**Ziel-Meilenstein:** Build-out Phase C (Web-Chat-Widget)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Der **Eingangskanal**: Der Wirt lädt im Widget (per Token) ein Beleg-Foto/eine Datei hoch; diese
mündet in den **bestehenden** belege-Pfad (`SourceChannel 'web_chat'`) → OCR-Worker → M03 → M05.
**Nicht neu erfinden** — die robuste Upload-Pipeline aus `m01-receipt-intake` wiederverwenden;
nur die Stellen anpassen, an denen der Wirt **kein Staff-User** ist.

---

## Akzeptanz-Kriterien

- [ ] Neuer Handler in `chatPublicRoutes`: `POST /api/v1/chat/:token/belege` (Multipart),
      Tenant aus `resolveChatSession` (T068, SECURITY-DEFINER) — **kein** `m14StaffAuthHook`.
- [ ] Upload-Pipeline aus `m01-receipt-intake/handlers/upload.handler.ts` wiederverwenden:
      `detectMimeFromBytes` (Magic-Bytes), Größen-/MIME-Gate, **SHA256(file_bytes+tenant_id)**-
      Idempotenz, MinIO `uploadObject` nach `<tenant>/originals/<yyyy>/<mm>/<uuid>.<ext>`,
      danach `enqueueOcrJob({tenantId, belegId, reason:'upload'})`.
- [ ] `insertBeleg` **rückwärts-kompatibel** lockern (1 Single Source of Truth, **keine** Zweit-
      Funktion): `InsertBelegInputSchema.sourceChannel` → `z.enum(['manual_upload','web_chat'])`,
      `uploadedByUserId` optional/nullable, Audit-Actor konditional — bei `web_chat`
      `actor:{type:'customer', id:null}` (erlaubt, `audit-log.ts:37-38`; Muster
      `wizard.repository.ts:245`). Bestehende `manual_upload`-Pfade unverändert grün.
- [ ] Nach Insert: `chat_messages`-Row mit `beleg_id` = neuer Beleg (`sender_type='customer'`,
      `body=NULL`) → das Foto erscheint als Chat-Bubble im Thread.
- [ ] Optional/Folge: bei OCR-fertig/`categorized` `sseManager.emit(tenantId,'beleg.status',…)`
      (OCR-Worker/M03 an SSE anbinden) — wenn Scope zu groß, als eigenen Mini-Task ausgliedern
      und hier dokumentieren.
- [ ] Upload-spezifisches RateLimit (Bulk-Upload großzügiger als 30/min, aber begrenzt).

### Tests
- [ ] Integration (echte DB, `PP_E2E=1`): Token-Upload → Beleg mit `source_channel='web_chat'`,
      Audit-Actor `customer`, OCR-Job enqueued, verknüpfte `chat_message` vorhanden.
- [ ] Idempotenz: zweimal dieselbe Datei → ein Beleg (SHA256-Gate).
- [ ] Bestehende `manual_upload`-Tests bleiben grün (Non-Regression der `insertBeleg`-Lockerung).
- [ ] CI grün, Coverage ≥ 80 %, code-reviewer OK.

---

## Spec-Referenzen
- `Web_Chat_Widget.md` §5.3/§5.4 (Upload, Beleg-Kontext) — auf belege-Welt portiert
- Referenz: `m01-receipt-intake/handlers/upload.handler.ts`, `services/beleg.repository.ts`, `core/queue/ocr-queue.ts`
- CLAUDE.md §3.6, §5.6 (Idempotenz), §5.7 (Audit)

---

## Offene Fragen (während der Bearbeitung)
- `insertBeleg` lockern vs. separate Funktion → **gelockert** (1 SSoT): `sourceChannel`
  `z.enum(['manual_upload','web_chat'])`, `uploadedByUserId` nullable, Audit-Actor konditional
  (`staff` mit id / `customer` mit null). M01-Verhalten unverändert.
- **Beleg-Status-`emit` in den OCR-Worker → als Folge-Mini-Task ausgegliedert** (nicht in T070).
  Begründung: berührt den OCR-Worker/M03-Pfad (eigener Scope/Review). Der Wirt bekommt schon
  Live-Feedback über das `chat.message`-Event beim Upload (T069-SSE). Live-`beleg.status`
  (extracting→extracted→categorized) ist die Folge-Verfeinerung. **TODO: Backlog-Task anlegen.**

---

## Lessons Learned (Implementierung 2026-06-25)
- **DRY statt Duplikat:** Die M01-Upload-Pipeline (Magic-Bytes, SHA256-Dedup/Undelete, MinIO,
  insertBeleg, OCR-Enqueue) wurde aus `upload.handler.ts` in den geteilten Service
  `m01-receipt-intake/services/beleg-upload.service.ts` (`processBelegUpload`) extrahiert. Beide
  Eingänge (Staff `manual_upload`, Wirt `web_chat`) nutzen ihn; M01-Handler hält nur noch
  Auth/Rolle/Tenant. **Netto-Gewinn:** der zuvor ungetestete M01-Upload-Pfad hat jetzt
  Test-Abdeckung (Integrationstest deckt beide Kanäle ab).
- Service liefert `{ ok:false, code, body }` statt zu werfen → Handler sendet 1:1 als HTTP-Antwort
  (M01-Response-Form unverändert: 201 neu / 200 dup+undelete).
- Integrationstest nutzt **Fake-S3** (`{ send: async ()=>({}) }`) + `vi.mock` der OCR-Queue → kein
  MinIO/Redis nötig; läuft als pp (kein gastro_app-Grant), daher keine Parallel-DDL-Kollision.
