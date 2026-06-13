# T031 — Discord-Bot-Service (Notifications / Customer-Bridge)

> **Owner:** Andreas (Backend/Infra)
> **Priorität:** P1 (Pilot — Team-Koordination + n8n/Task-Benachrichtigungen laufen über Discord)
> **Dependencies:** profitiert von T024/T025 (Task-Events), aber eigenständig startbar
> **Welle:** 5
> **Spec-Referenzen:** `Discord_Integration.md` · CLAUDE.md §3 (Discord-Bot „noch nicht gebaut"), §5.4 (Discord als Subunternehmer/SCC)
> **Audit:** REPORT-2026-05-26 F22

---

## Ziel

Aktuell existiert nur der **Discord-OAuth-Login** (M14). Der eigentliche **Bot-Service** aus `Discord_Integration.md` fehlt: Notifications (CI-Status, neue Tasks, Alerts) und ggf. Customer-Bridge. discord.js v14+ (CLAUDE.md §6.1).

---

## Akzeptanz-Kriterien

- [ ] Bot-Service-Grundgerüst (discord.js v14+) mit sicherem Token-Handling (`DISCORD_BOT_TOKEN` aus `.env`, nie geloggt).
- [ ] Mindest-Funktion pilot-relevant: strukturierte Notifications in den `#dev`-/Ops-Channel (z.B. neue Tasks aus T027, fehlgeschlagene Crons/Exports, Deploy-Status). Webhook-basiert ODER Bot — gemäß Spec wählen.
- [ ] Race-Condition-sicher (discord-bot-builder-Konventionen), mit Tests.
- [ ] Klare Trennung: was läuft über Bot vs. über die bestehenden Webhook-Alerts (z.B. `sendDiscordAlert` in M05/M15).
- [ ] Scope für Pilot bewusst eng halten; Customer-Bridge/OAuth-Flow nur wenn `Discord_Integration.md` es für KW22 vorsieht, sonst als Folge-Task abgrenzen.

---

## Hinweise

- Spec zuerst lesen — `Discord_Integration.md` definiert Channels, Bridge, OAuth-Flow.
- Bestehende Webhook-Alerts (`DISCORD_OPS_WEBHOOK_URL`, `sendDiscordAlert`) nicht doppeln, sondern integrieren/ablösen.
- Verwandt: T027 (erzeugt die Task-Events, die der Bot meldet).
