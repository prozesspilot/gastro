# T037 — Customer-Chat-View (Webapp) + Web-Chat-Widget

> **Owner:** Steve (Frontend, Widget + View) + Andreas (Backend, Chat-Persistenz/Magic-Link)
> **Priorität:** P2 (Post-Pilot — Pilot startet mit WhatsApp/E-Mail; XL)
> **Dependencies:** keine harten; groß — ggf. in Teil-Tasks splitten
> **Welle:** 8
> **Spec-Referenzen:** `Web_Chat_Widget.md` · `Mitarbeiter_Webapp.md` §3.5 (Customer-Chat-Übersicht) · CLAUDE.md §3, §5.2 (chat.prozesspilot.net)
> **Audit:** REPORT-2026-05-26 F06, F21

---

## Ziel

Zwei zusammenhängende Lücken: (a) das **Web-Chat-Widget** (`chat.prozesspilot.net` / `/c/{token}`) für Customer existiert nicht, (b) die **Customer-Chat-Übersicht** in der Mitarbeiter-Webapp (§3.5) fehlt. Beide aus dem jeweiligen Konzept bauen.

---

## Akzeptanz-Kriterien

- [ ] **Web-Chat-Widget** gemäß `Web_Chat_Widget.md`: Magic-Link-Token-Zugang (kein Account, CLAUDE.md §5.3), Nachrichten senden/empfangen, Beleg-Upload.
- [ ] **Customer-Chat-Übersicht** (§3.5): Mitarbeiter sehen Chats, in denen sie angesprochen wurden; antworten; Magic-Link senden.
- [ ] Chat-Persistenz tenant-isoliert (RLS), Magic-Link-Token in DB (CLAUDE.md §5.3).
- [ ] Drei-Frontend-Trennung gewahrt (§5.2): Widget ≠ Mitarbeiter-Webapp ≠ Wizard.
- [ ] Tests (Backend + Frontend); CI grün.

---

## Hinweise

- **XL** — vor Umsetzung in kleinere Tasks splitten (Widget / Chat-Persistenz / Mitarbeiter-View getrennt).
- Iframe-Einbettung: Widget-Domain ohne `X-Frame-Options DENY` (siehe Caddyfile `chat.prozesspilot.net`).
- Post-Pilot — Pilot läuft mit WhatsApp + E-Mail-Eingang.
