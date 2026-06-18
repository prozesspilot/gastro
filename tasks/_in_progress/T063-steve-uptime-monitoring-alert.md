# T063 — Uptime-Monitoring + Alert (api/health → Discord)

**ID:** T063
**Priorität:** P1 (Betriebssicherheit — ein 4-Tage-Ausfall blieb unbemerkt)
**Geschätzt:** S
**Anker:** Prod-Vorfall 2026-06-17 (Stack seit ~14.06. down, niemand alarmiert) · `infra/monitoring/` (vorhandener Sentry/Prometheus/Grafana-Stack)

---

## Problem

Der Prod-Stack (Postgres + Backend + Stubs) war ~4 Tage unten, ohne dass jemand alarmiert wurde. Aufgefallen ist es nur, weil Steve sich zufällig einloggen wollte (502). Es gibt **kein Uptime-Monitoring mit Alert** auf die öffentlichen Endpoints.

## Was zu tun ist

1. Externer Uptime-Check (unabhängig vom Host selbst — sonst meldet niemand, wenn der Host weg ist) auf:
   - `https://api.prozesspilot.net/api/v1/health` (erwartet 200 + `{"ok":true}`)
   - `https://api.prozesspilot.net/api/v1/ready` (DB/Redis-Konnektivität)
   - optional `https://admin.prozesspilot.net/`, `https://setup.…/health`, `https://chat.…/health`
2. Bei Fehler (≥2 aufeinanderfolgende Fehlschläge, z.B. alle 60 s) → **Discord-Alert** an `DISCORD_ALERTS_WEBHOOK`.
3. Umsetzungs-Optionen (eine wählen): (a) externer Dienst wie UptimeRobot/Better Uptime → Discord-Webhook (am schnellsten, kein Eigen-Hosting), (b) GitHub-Actions-Cron (`schedule:`) der die Endpoints curlt und bei Fehler Discord pingt (kostenlos, im Repo), (c) der vorhandene Prometheus/Grafana-Stack mit Blackbox-Exporter + Alertmanager (mächtiger, aber läuft auf demselben Host → meldet Host-Ausfall nicht).
   → **Empfehlung:** (b) GitHub-Actions-Cron *oder* (a), weil host-extern. Der host-interne Stack (c) ist blind, wenn der Host selbst weg ist.

## Akzeptanz-Kriterien

- [ ] Ein host-externer Check auf `api/health` läuft periodisch.
- [ ] Bei Ausfall kommt innerhalb weniger Minuten ein Discord-Alert.
- [ ] Recovery-Meldung (wieder grün) ebenfalls.
- [ ] Dokumentiert in `infra/` wie man es ein-/ausschaltet.

## Kontext

Aufgedeckt durch den Prod-Vorfall am 2026-06-17. Behoben wurde der Ausfall durch den Recovery-Deploy (PR #138); dieser Task verhindert, dass ein künftiger Ausfall wieder tagelang unbemerkt bleibt. Siehe auch [[T064]] (Deploy-Härtung + Stack-Autostart).
