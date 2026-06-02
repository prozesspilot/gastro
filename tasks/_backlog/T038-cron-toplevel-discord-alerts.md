# T038 — Cron-Scripts: Top-Level Discord-Alert bei Crashes

> **Owner:** Andreas (Backend)
> **Priorität:** P1 (Pilot-Operativ — sonst keine Sichtbarkeit auf Cron-Crashes)
> **Dependencies:** keine (kann unabhängig laufen)
> **Welle:** 6
> **Audit:** Lane-A Bug-Audit 2026-06-02

---

## Ziel

Die zwei produktiven Cron-Scripts (`sumup-daily.ts`, `pos-credentials-cleanup.ts`) haben aktuell **keinen Top-Level Discord-Alert**. Discord-Ping wird nur INNERHALB der jeweiligen Service-Funktion ausgelöst (z.B. `syncDay()` bei OCR-Fail). Wenn der Cron **vorher** crasht — etwa wenn `listActiveSumUpTenants()` schon ein DB-Connection-Loss erlebt — gibt's null Sichtbarkeit, weil die Discord-Logik nie erreicht wird. Steve + Andreas merken Crashes erst, wenn Almaz reklamiert.

systemd loggt zwar lokal Exit-Codes, aber wir monitoren weder `systemctl status` noch `journalctl` aktiv — Discord ist unser primärer Operations-Kanal.

---

## Akzeptanz-Kriterien

- [ ] In `backend/src/cron/sumup-daily.ts`: Top-Level `try/catch` um `runDailySumUpSync()`, der bei jedem Throw eine Discord-Webhook-Nachricht (`DISCORD_OPS_WEBHOOK_URL`) sendet mit:
  - Script-Name (`sumup-daily.ts`)
  - Error-Message + Stack (gekürzt)
  - Hostname (`os.hostname()`)
  - Zeitstempel (UTC)
- [ ] Dasselbe Pattern in `backend/src/cron/pos-credentials-cleanup.ts`.
- [ ] Beide Wrapper nutzen denselben Helper (z.B. `core/notify/discord-alert.ts`), um Duplication zu vermeiden. Helper akzeptiert `{ scriptName, error, context? }`.
- [ ] Wenn `DISCORD_OPS_WEBHOOK_URL` leer ist: Wrapper logged nur via Pino, **kein zweiter Crash** (graceful skip).
- [ ] Unit-Tests: Helper mit Mock-Fetch, einer Test-Case „webhook gesetzt", einer „leer".
- [ ] Integration: ein Smoke-Test, der gegen einen Test-Webhook (z.B. `https://discord.com/api/webhooks/.../<test-channel>`) eine Test-Nachricht sendet.

---

## Hinweise

- Existierender Discord-Webhook-Call-Code: `backend/src/modules/m15-pos-connector/sumup-sync.service.ts:198` und `m02-ocr/*` — als Vorlage, aber Top-Level-Wrapper sollte unabhängig vom Service-internen Alert sein.
- Format der Discord-Nachricht: kurz + scannbar. Vorschlag:
  ```
  ⚠️ Cron-Crash: sumup-daily.ts auf gastro-prod
  Error: connection refused (postgres)
  Time: 2026-06-02T03:00:12Z
  ```
- Stack-Trace optional in `embeds[0].description` (Discord-Limit 4096 chars).
- `config.loadConfig()`-Crash kommt VOR dem try/catch (passiert beim Import). Wenn nötig, separates `process.on('uncaughtException')`-Handler um auch diesen Pfad zu fangen — aber wahrscheinlich Overkill, weil Missing-ENV beim Backend-Start auch schon kracht und Steve es merkt.

## Anti-Goals

- KEIN generelles Monitoring-System aufbauen — nur das Loch im Cron-Pfad stopfen.
- KEINE Pagerduty / Sentry-Integration jetzt — wir sind im Pilot.
