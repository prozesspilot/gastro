---
name: support-via-webchat-no-discord-bridge
description: GF-Entscheidung 2026-06-25 — Support läuft komplett über Web-Chat; die Discord-Customer-Bridge wird NICHT gebaut
metadata: 
  node_type: memory
  type: project
  originSessionId: ef071eaa-cf99-4cd6-b601-7ee35b873fd1
---

**GF Steve, 2026-06-25: „alle über Web-Chat".** Der Customer-Support läuft komplett über das Web-Chat:
- **Wirt** schreibt/lädt im Widget (`chat.prozesspilot.net/{token}`, T071).
- **Mitarbeiter** antworten in der **Webapp** (`admin.prozesspilot.net/chats`, T073) — Antwort → `chat_messages` (`sender_type='staff'`) → SSE → erscheint live beim Wirt.

**Die im Konzept (`Discord_Integration.md` §1.1/§3.2/§7, „Reply-aus-Discord", #support-tickets-Bridge) geplante Discord-Customer-Bridge wird NICHT gebaut.** Discord bleibt nur: Mitarbeiter-Login (M14, live), interne Team-Koordination, optionale System-Notifications (Deploy/Ops/Uptime). T031 (Discord-Bot-Service) ist dadurch scope-reduziert (Bridge-Teil gestrichen).

**Warum:** Der kundenseitige Loop (Staff-Antwort → Wirt sieht sie live) ist über die Webapp schon geschlossen; Discord wäre nur Mitarbeiter-Bequemlichkeit, kein neuer Customer-Baustein. Phase C (T068–T073) ist damit die **finale** Support-Architektur, kein Discord-Nachbau nötig.

**Falls je doch:** `chat_messages` ist Single Source of Truth — eine Discord-Bridge wäre additiv (weiterer Schreiber via `insertChatMessage`); bräuchte dann die Mapping-Spalten `discord_message_id`/`discord_thread_id` (in Migration 125 bewusst weggelassen). Doku-Notizen stehen oben in `Discord_Integration.md` + `Web_Chat_Widget.md`. Siehe [[buildout-phase-status]].
