# T068 — Web-Chat: Chat-Sessions + Magic-Link-Fundament (Backend)

**ID:** T068
**Verantwortlich:** Steve
**Priorität:** P0
**Branch:** `steve/T068-webchat-sessions`
**Geschätzt:** 1 Tag Claude-Code-Session
**Dependencies:** [] — baut nur auf bereits gemergten Mustern auf (m16-wizard, core/mail, core/auth)
**Ziel-Meilenstein:** Build-out Phase C (Web-Chat-Widget — Eingangskanal + Support)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Das **Fundament** des Web-Chat-Widgets: eine neue Tabelle `chat_sessions` (Migration 124) plus
das **Magic-Link-Backend**, mit dem ein Wirt **ohne Account** über einen Token-Link in den Chat
kommt. Muster wird **1:1 vom Onboarding-Wizard gespiegelt** (`m16-wizard`, Migration 122,
`SECURITY-DEFINER`-Token-Lookup). Eine Staff-/System-Aktion **erzeugt eine Session + verschickt
eine Alarm-/Einladungs-Mail mit Link-Button**. Chat-Nachrichten & Beleg-Upload kommen in
T069/T070 — diese Task liefert nur Session + Token + Auflösung + Einladung.

> **Erst-Schritt (CLAUDE.md §3.7):** „Spec auf belege-Welt portieren". Die alte
> `Web_Chat_Widget.md` (2026-05-15) sagt §1.2/§5.4 noch **„kein Belegerfassungs-Kanal,
> Upload erst Phase 2"** — das ist durch **CLAUDE.md §3.6** (2026-06-15) überholt. Beim Bau
> gilt §3.6. Die portierten Kern-Entscheidungen stehen unten unter „Gelockte Entscheidungen".

---

## Gelockte Entscheidungen (GF Steve, AskUserQuestion 2026-06-24)

1. **Token-Lebensdauer:** **dauerhaft + widerrufbar** — kein hartes Ablaufdatum
   (`expires_at` nullable, Default NULL = unbefristet). Widerruf über `status='revoked'` +
   `revoked_at`. **Genau ein aktiver Link pro Mandant** (partieller Unique-Index).
2. **Auslieferung:** eigene Seite `chat.prozesspilot.net/{token}` (Frontend = T071/T072).
   Same-origin Support-Einbettung auf `prozesspilot.net` = **Folge-Ausbau** (T072-Notes).
3. **Link-Ausgabe (trigger-getrieben):** Session entsteht durch **Staff-Aktion** oder
   **System-Event** (z. B. Beleg `requires_review`); der Wirt klickt den **Alarm-/Aktions-Button
   in E-Mail** (jetzt) bzw. **WhatsApp** (später, M10 ungebaut). Diese Task baut den
   **Staff-/manuellen Trigger + E-Mail-Versand**; der automatische System-Event-Trigger
   (auf `requires_review`) ist ein Folge-Hook in T069/T070.

---

## Akzeptanz-Kriterien

### Migration (`124_chat_sessions.sql` + `124_chat_sessions_rollback.sql`)
- [ ] Tabelle `chat_sessions` (rückwärts-kompatibel, Muster exakt wie `122_onboarding_sessions.sql`):
      `id UUID PK DEFAULT gen_random_uuid()`,
      `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`,
      `token VARCHAR(64) UNIQUE NOT NULL`,
      `status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','closed'))`,
      `trigger_type VARCHAR(40) NULL` (z. B. `'staff_manual'`, `'beleg_review'`, `'reminder'`),
      `trigger_reference_id UUID NULL` (z. B. `belege.id`; **kein** FK, lose Referenz),
      `created_by_user_id UUID NULL REFERENCES users(id)` (Staff; NULL bei System),
      `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
      `expires_at TIMESTAMPTZ NULL` (NULL = unbefristet),
      `revoked_at TIMESTAMPTZ NULL`,
      `last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- [ ] `CREATE INDEX idx_chat_sessions_tenant ON chat_sessions(tenant_id)`.
- [ ] **Genau ein aktiver Link pro Mandant:**
      `CREATE UNIQUE INDEX uq_chat_sessions_active_tenant ON chat_sessions(tenant_id) WHERE status='active'`.
- [ ] RLS: `ENABLE` + `FORCE ROW LEVEL SECURITY`; Policy `chat_sessions_tenant_isolation FOR ALL
      USING (is_rls_bypassed() OR tenant_id = current_tenant_id()) WITH CHECK (…)` — exakt wie
      `122_onboarding_sessions.sql:53`.
- [ ] Cross-Tenant-Token-Lookup **nur** über `SECURITY-DEFINER`-Funktion
      `get_chat_session_by_token(p_token text)` (Muster `122:79` + `121_list_tenants_fn`):
      `bypass_rls` LOCAL setzen, `WHERE token = p_token`, danach zurücksetzen, `REVOKE ALL …
      FROM PUBLIC`, `GRANT EXECUTE … TO gastro_app`, `SET search_path`.
- [ ] Rollback: `DROP FUNCTION` + `DROP POLICY` + `DROP TABLE` (inkl. Indizes implizit).

### Backend (`m16` analog — neues Modul `backend/src/modules/m-webchat/` oder `routes/chat.*`)
- [ ] `generateChatToken()` = `randomBytes(24).toString('base64url')` (192 Bit) — Logik 1:1 aus
      `wizard.repository.ts:16` übernehmen.
- [ ] `createChatSession(pool, { tenantId, triggerType, triggerReferenceId, createdByUserId })`:
      in **einer** Transaktion mit RLS-Context (`setTenantContext`, Key **`app.current_tenant`**);
      **idempotent**: existiert bereits eine `status='active'`-Session für den Tenant → diese
      zurückgeben (statt Unique-Index-Verletzung), sonst neu anlegen. `logAuditEvent`
      `chat.session_created` (Actor `staff`/`system`, **keine PII**).
- [ ] `getChatSessionByToken(pool, token)` über die `SECURITY-DEFINER`-Fn (umgeht RLS kontrolliert).
- [ ] `resolveChatSession(token)`-Helper analog `m16-wizard/handlers/_resolve-session.ts`:
      **404** wenn nicht gefunden, **410** wenn `status IN ('revoked','closed')` **oder**
      (`expires_at IS NOT NULL AND expires_at < now()`). Bei gültig → `tenant_id` bekannt →
      `set_config('app.current_tenant', …, true)` für Folge-Writes; `last_activity_at` bumpen.
- [ ] `revokeChatSession(pool, { tenantId, sessionId })` → `status='revoked'`, `revoked_at=now()`,
      `logAuditEvent` `chat.session_revoked`.
- [ ] **Routen-Trennung** (Fastify-Encapsulation wie `wizard.routes.ts:32/40`):
      `chatStaffRoutes` (Session erzeugen/widerrufen) hinter `m14StaffAuthHook` +
      `m14TenantContextHook`; `chatPublicRoutes` (`GET /api/v1/chat/:token` → Session-Meta,
      kein Cookie, Tenant aus Token). In `app.ts` unter Prefix `/api/v1/chat` registrieren.
- [ ] **Per-Route-RateLimit-Konstante** (`config:{rateLimit:{max,timeWindow}}`) auf allen
      Chat-Routen — wegen CodeQL-Falle (Memory `codeql-missing-rate-limiting`); öffentlicher
      Token-Endpoint eng (z. B. 30/min).

### Einladungs-/Alarm-Mail
- [ ] Neue `chat-invite.template.ts` (`MailTemplate<Vars>` aus `core/mail/templates/types`),
      Marke **„ProzessPilot"**, Du-Anrede, prominenter Button → `${CHAT_BASE_URL}/${token}`.
- [ ] `createChatSession` (Staff-Trigger) versendet die Mail via `mailService.sendTemplate`
      (Best-Effort, Dry-Run ohne SMTP — wie Wizard-Invite).
- [ ] Neue ENV `CHAT_BASE_URL` in `core/config.ts` (Muster `SETUP_BASE_URL`, Prod-Default
      `https://chat.prozesspilot.net`) + `.env.example` ergänzen (nicht still lassen).

### Tests
- [ ] Integration (echte DB, **`PP_E2E=1`**): create → `getChatSessionByToken` findet Session
      (Cross-Tenant via SECURITY-DEFINER) → zweiter `createChatSession` für denselben Tenant gibt
      **dieselbe** Session zurück (Idempotenz/Unique-Index) → `revokeChatSession` → `resolveChatSession`
      liefert **410**.
- [ ] RLS-Test: Session von Tenant A ist unter `app.current_tenant = B` **nicht** sichtbar
      (analog `tenants-list-rls.test.ts`).
- [ ] HTTP: `GET /api/v1/chat/:token` → 200 (gültig) / 404 (unbekannt) / 410 (widerrufen);
      Staff-Create ohne Auth → 401.
- [ ] Mail: `chatInviteTemplate` rendert Button-URL korrekt; Versand bei Create ausgelöst (Mock).
- [ ] CI grün (lint + typecheck + tests + build), DB-Tests mit `PP_E2E=1`. Coverage ≥ 80 %.
- [ ] code-reviewer-Agent gibt OK.

---

## Spec-Referenzen
- `Modulkonzept/Konzeptentwicklung/Web_Chat_Widget.md` §2.2/§4 (Magic-Link, Token) — **auf belege-Welt portiert** (Upload-Trennung §1.2 entfällt per §3.6)
- `Modulkonzept/Konzeptentwicklung/Onboarding_Wizard.md` §6.3 (Token-Persistenz/Wiederverwendung — Vorbild)
- Referenz-Implementierung: `backend/src/modules/m16-wizard/` (`wizard.repository.ts`, `wizard.routes.ts`, `handlers/_resolve-session.ts`, `migrations/122_onboarding_sessions.sql`)
- CLAUDE.md §3.6 (Build-out), §5.3 (Magic-Link), §5.5 (RLS), §5.7 (Audit)

---

## Notes / Gotchas
- **RLS-GUC-Key = `app.current_tenant`** (Memory `rls-guc-key-mismatch`) — niemals `app.tenant_id`.
- **Audit:** zentrales `logAuditEvent`, **belege-Welt-Spalten** — NICHT die Legacy-Spalten
  `action/resource/payload` (Memory `legacy-welt-schema-drift`).
- **DB-Test-Lauf:** vorher `prozesspilot_test` drop/create/migrate (Memory `backend-db-test-fresh-db`);
  `CI=true` erzwingt `REQUIRE_DB`.
- **Eine Migration pro PR** (§6.5): `chat_messages` ist bewusst **T069** (Migration 125), nicht hier.
- **SSE bleibt T069/T070:** Live-Updates erst, wenn es Nachrichten/Status gibt. Diese Task ist Polling-fähig.

---

## Offene Fragen (während der Bearbeitung)
- **SSE-Granularität** (tenant- vs. session-scoped): für den Einzel-Tenant-Piloten **tenant-scoped**
  akzeptiert; session-Scoping als Tech-Debt notieren (relevant erst T069). _(vorab entschieden)_
- **System-Event-Auto-Trigger** (Session automatisch bei `requires_review` erzeugen): **nicht** in
  T068 — Folge-Hook in T069/T070. T068 = Staff/manuell + Mail-Mechanik.

---

## Lessons Learned (nach Abschluss)
_(nach Merge ausfüllen)_
