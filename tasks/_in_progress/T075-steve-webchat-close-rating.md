# T075 — Web-Chat: Chat beenden + Sterne-Bewertung (1–5 + optionaler Kommentar)

> **Owner:** Steve (Frontend) / gemeinsam
> **Priorität:** P2 (Build-out Phase C — schließt den Support-Loop ab)
> **Welle:** Phase C (Web-Chat)
> **Dependencies:** T068–T073 (Web-Chat-Sessions/Messages/Widget/Staff-View) — alle gemergt
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/Web_Chat_Widget.md` (Support-Lifecycle) · CLAUDE.md §3.6/§3.7 (belege-Welt, sequenziell) · `support-via-webchat-no-discord-bridge` (Support komplett über Web-Chat)

---

## Ziel

Eine Chat-Session kann **beendet** werden — vom **Wirt** (im Widget) **oder** von einem **Mitarbeiter** (in der Webapp `/chats`). Nach dem Beenden erscheint **kundenseitig** (im Widget) eine **Sterne-Bewertung (1–5)** mit **optionalem Freitext-Kommentar**. Die Bewertung wird gespeichert, als `audit_log`-Event protokolliert (GoBD — „Log des Kunden") und für die Mitarbeiter in den **Chat-Views** angezeigt (Liste `/chats` + Detailseite).

GF-Entscheidungen (2026-06-26):
- Bewertungs-Anzeige für Staff → **in den Chat-Views** (Liste + Detail), zusätzlich `audit_log`.
- Bewertungs-Inhalt → **Sterne (1–5) + optionaler Kommentar**.

---

## Akzeptanz-Kriterien

### Backend
- [ ] Migration 126: `chat_sessions` += `closed_at`, `closed_by` (`customer|staff|system`), `rating` (SMALLINT CHECK 1..5), `rating_comment` (TEXT), `rated_at`. Rückwärts-kompatibel (alle nullable) + Rollback.
- [ ] `get_chat_session_by_token()` (SECURITY DEFINER) gibt die neuen Spalten mit zurück (DROP+CREATE, Re-GRANT) — sonst sieht das Widget die Bewertung nicht.
- [ ] `closeChatSession()` (RLS-tenant-gescopet): `active → closed`, setzt `closed_at`/`closed_by`/`last_activity_at`; Audit `chat_session.closed` (payload `{closed_by}`). Idempotent (kein Row wenn nicht `active`).
- [ ] `rateChatSession()`: nur auf `status='closed'` und `rating IS NULL`; setzt `rating`/`rating_comment`/`rated_at`; Audit `chat_session.rated` (payload **nur** `{rating}` — Kommentar ist PII, NICHT ins Log).
- [ ] Wirt-Endpoints: `POST /api/v1/chat/:token/close`, `POST /api/v1/chat/:token/rating` (Token = Credential). `resolveChatSession` erlaubt für diese + `GET /:token` den Status `closed` (neue Option `allowClosed`), `revoked`/`expired` bleiben 410.
- [ ] Staff-Endpoint: `POST /api/v1/chat/sessions/:id/close` (m14-Auth + Tenant-Context).
- [ ] `GET /api/v1/chat/sessions/:id/messages` (Staff-Thread) liefert zusätzlich Session-Meta (`status`, `rating`, `rating_comment`, `closed_at`, `closed_by`). `listChatsForStaff` += `rating`.
- [ ] DTO-Erweiterung: `PublicChatSession` += `rating`, `rating_comment`, `closed_at`; `StaffChatListItem` += `rating`.

### Widget (web-chat-widget)
- [ ] „Chat beenden"-Aktion (zwei-Schritt-Bestätigung, kein `window.confirm`). → `POST /:token/close` → Übergang zur Bewertung.
- [ ] `status='closed'` + `rating === null` → Sterne-Auswahl (1–5, Tap-Targets ≥ 44 px) + optionaler Kommentar + „Bewertung senden" → `POST /:token/rating`.
- [ ] `status='closed'` + `rating !== null` → „Danke"-Ansicht mit gefüllten Sternen (read-only) + ggf. Kommentar. `revoked` bleibt „nicht mehr aktiv".

### Webapp (Staff)
- [ ] `/chats`-Liste: bei beendeten Chats die Sterne-Bewertung anzeigen.
- [ ] Chat-Detailseite: Status + Bewertung (Sterne + Kommentar) prominent; „Chat beenden"-Button (nur wenn `active`); Antwort-Eingabe gesperrt/ausgeblendet wenn nicht `active`.

### Tests + Gates
- [ ] Backend-Integration: close (Wirt+Staff), rate, doppelte Bewertung → 409, Bewertung ohne Beenden → 409, `allowClosed`-Resolve, Liste/Thread enthalten `rating`.
- [ ] Widget-Unit: RatingView (Sterne rendern/auswählen/senden), App routet `closed → Bewertung`.
- [ ] `npm run build` + `npm test` (Backend mit DB) + Lint/Typecheck grün.

---

## Hinweise / Anker

- **belege-Welt**, kein Hardcode. Muster strikt an T068–T073 (Repository-Transaktionen mit `set_config('app.current_tenant', …, true)`, SECURITY-DEFINER-Token-Lookup, RL-Per-Route gegen CodeQL-Alert).
- **Kein PII ins audit_log** (CLAUDE.md §6.6/§9): `rating_comment` wird NICHT geloggt, nur die Zahl `rating`.
- Migration: Funktions-Rückgabetyp ändern = `DROP FUNCTION` + `CREATE FUNCTION` (CREATE OR REPLACE kann den RETURNS-TABLE-Typ nicht ändern).
- DB-Tests mit frischer DB laufen lassen (`audit_log` append-only) — Memory `backend-db-test-fresh-db`.
