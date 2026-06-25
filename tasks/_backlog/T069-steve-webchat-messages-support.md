# T069 — Web-Chat: Chat-Nachrichten + Support-Text + SSE-Live (Backend)

**ID:** T069
**Verantwortlich:** Steve
**Priorität:** P0
**Branch:** `steve/T069-webchat-messages`
**Geschätzt:** 1 Tag Claude-Code-Session
**Dependencies:** [T068] — muss in `_done/`
**Ziel-Meilenstein:** Build-out Phase C (Web-Chat-Widget)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Der Support-Teil des Widgets: Tabelle `chat_messages` (Migration 125) + Endpoints, damit der
**Wirt (via Token)** Text-Nachrichten sendet/liest und **Staff (via Cookie)** antwortet — alles
in **denselben** Thread (Single Source of Truth). Dazu den **toten SSE-Kanal verdrahten**
(`sseManager.emit`) für Live-Nachrichten, mit Polling-Fallback.

---

## Akzeptanz-Kriterien

### Migration (`125_chat_messages.sql` + `_rollback.sql`)
- [ ] `chat_messages`: `id`, `tenant_id` (FK tenants, CASCADE), `session_id` (FK chat_sessions,
      CASCADE), `sender_type VARCHAR(20) CHECK IN ('customer','staff','system')`,
      `sender_user_id UUID NULL REFERENCES users(id)` (nur bei `staff`),
      `body TEXT NULL`, `beleg_id UUID NULL REFERENCES belege(id) ON DELETE SET NULL`
      (Brücke in die belege-Welt; gesetzt von T070), `created_at`, `read_at TIMESTAMPTZ NULL`.
- [ ] CHECK: `body IS NOT NULL OR beleg_id IS NOT NULL` (Nachricht hat Text **oder** Beleg).
- [ ] `INDEX idx_chat_messages_session ON chat_messages(session_id, created_at)`.
- [ ] RLS `ENABLE`+`FORCE` + tenant-isolation-Policy (Muster wie 124). **Vor** Schreiben läuft der
      `SECURITY-DEFINER`-Token-Lookup aus T068 → danach normaler RLS-Write (`app.current_tenant`).
- [ ] `sender_user_id`-FK gegen die **real existierende** `users`-Tabelle (Discord-OAuth-Welt)
      prüfen — nicht gegen das alte Spec-Schema (Memory: Email+Passwort-users entfernt).

### Backend
- [ ] Wirt-Endpoints (chatPublicRoutes, Token): `POST /api/v1/chat/:token/messages` (Text senden,
      `sender_type='customer'`, `sender_user_id=NULL`), `GET /api/v1/chat/:token/messages` (Verlauf).
- [ ] Staff-Endpoints (chatStaffRoutes, Cookie + `m14StaffAuthHook`+`m14TenantContextHook`):
      Liste offener Chats, Verlauf je Session, `POST …/reply` (`sender_type='staff'`).
      **Rolle `support` DARF hier schreiben** (Support ist sein Job) — kein `support`-403.
- [ ] SSE verdrahten: nach jedem `chat_messages`-Insert `sseManager.emit(tenantId,'chat.message',…)`.
      Wirt-SSE-Endpoint `GET /api/v1/chat/:token/events` (Token → Tenant via SECURITY-DEFINER,
      dann `sseManager.subscribe`). Polling-Fallback bleibt nutzbar.
- [ ] Per-Route-RateLimit auf allen neuen Routen (CodeQL-Falle).
- [ ] `logAuditEvent` für relevante Events; `read_at` beim Lesen setzen (optional Pilot).

### Tests
- [ ] Integration (echte DB, `PP_E2E=1`): customer→message, staff→reply, Verlauf chronologisch;
      RLS-Isolation; CHECK greift (leere Nachricht ohne Beleg → Fehler).
- [ ] SSE: emit wird nach Insert aufgerufen (Subscriber-Mock empfängt Event).
- [ ] HTTP: Token-Endpoints 200/404/410; Staff-Endpoints 401 ohne Auth.
- [ ] CI grün, Coverage ≥ 80 %, code-reviewer OK.

---

## Spec-Referenzen
- `Web_Chat_Widget.md` §2.3/§3.1/§6/§8 (Support-Chat, Realtime, Staff-Gegenseite)
- Referenz: T068-Code, `core/sse/sse.manager.ts`, `core/auth/m14-*`
- CLAUDE.md §3.6, §5.5, §5.7

---

## Offene Fragen (während der Bearbeitung)
- **System-Event-Auto-Trigger:** soll eine eingehende Staff-Antwort/`requires_review` automatisch
  eine Session + Alarm-Mail (T068) erzeugen? Hier den Hook-Punkt vorsehen, Auto-Trigger ggf. T070.
- **`chat_threads`** bleibt im MVP weg (nur sessions+messages).

---

## Lessons Learned (nach Abschluss)
_(nach Merge ausfüllen)_
