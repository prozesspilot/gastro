# T005 — M15 SumUp Daily-Pull Cron + Transaktions-Sync

> **Owner:** Andreas
> **Geschätzt:** 2 Tage
> **Priorität:** P1 (wichtig für KW22-Pilot aber nicht Blocker — manueller Pull möglich)
> **Dependencies:** T004 SumUp OAuth-Flow muss fertig sein
> **Welle:** 2
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M15_Kassensystem_Connector.md` Sektion „Daily-Sync"

---

## Ziel

Cron-Job der täglich für alle Tenants mit aktiver SumUp-Integration die Transaktionen des Vortages aus SumUp pullt und in DB speichert.

---

## Akzeptanz-Kriterien

- [ ] DB-Tabelle `kasse_transactions` mit Spalten: `tenant_id`, `external_id`, `timestamp`, `amount_cents`, `currency`, `payment_method`, `description`, `raw_payload`
- [ ] Service `SumUpSyncService.pullDay(tenant_id, date)` — holt Transaktionen via SumUp Transactions API
- [ ] Cron-Job in n8n-Workflow ODER node-cron, läuft täglich 03:00 UTC
- [ ] Idempotent: bei Re-Run desselben Tags werden Duplikate via `external_id` ignoriert (UPSERT)
- [ ] Bei API-Fehler: Retry mit exponential backoff (max 3 Versuche), danach Discord-Alert in `#alerts-critical`
- [ ] Logging: jeder Sync-Run loggt Anzahl gepullter Transaktionen
- [ ] Webapp-Endpoint `GET /api/transactions?date=YYYY-MM-DD` für UI-Anzeige
- [ ] Manueller Trigger: `POST /api/integrations/sumup/sync` (für sofortigen Sync)
- [ ] Unit-Tests + Integration-Test mit SumUp-Sandbox

## Claude-Code-Start-Prompt

```
Implementiere T005 SumUp Daily-Pull. Service in backend/src/services/sumup-sync.ts.
Migration für kasse_transactions. Cron in n8n-Workflow (in n8n/workflows/) oder
backend/src/cron/sumup-daily.ts. UPSERT via Postgres ON CONFLICT.
Discord-Alert via existierender DiscordNotifier-Service.
Branch: andreas/T005-sumup-daily-pull
```
