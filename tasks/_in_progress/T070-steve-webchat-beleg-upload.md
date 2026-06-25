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
- `insertBeleg` lockern vs. separate Funktion → **lockern** (entschieden); falls beim Bau Risiken
  auftauchen, hier dokumentieren statt raten.
- Beleg-Status-`emit` in den Worker-Pfad: Teil dieser Task oder Folge-Mini-Task? Beim Bau entscheiden.

---

## Lessons Learned (nach Abschluss)
_(nach Merge ausfüllen)_
