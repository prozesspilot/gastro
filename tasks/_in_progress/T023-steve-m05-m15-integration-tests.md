# T023 — Integrationstests gegen echte DB für M05-Export + M15-POS

**Priorität:** P2 — Qualitäts-Schuld aus Pilot-pragmatischem Merge
**Module:** M05 (lexoffice), M15 (pos-connector)
**Herkunft:** Review-Findings aus PR #59 (T009), #60 (T005), #61 (T018) —
bewusst als Follow-up zurückgestellt (Funktions-/Daten-Bugs wurden vor Merge
gefixt, die fehlenden Integrationstests nicht).

## Kontext

Mehrere Kern-Pfade sind aktuell nur gegen **gemockte** Pools getestet. Die
eigentliche SQL-/RLS-/Retry-Logik wird nie gegen echtes Postgres ausgeführt.
Setup-Rezept für lokale Test-DB: siehe `webapp-test-stack`-Memory bzw.
`.github/workflows/ci-backend.yml` (postgres:16 + redis:7, Rolle `gastro_app`).

## Zu schreibende Integrationstests

### M05 — Lexware-Export (`exportBelegToLexware`)
- Kern-Service ist komplett ungetestet (Handler-Tests mocken ihn weg).
- Abdecken: Idempotenz-Skip (bereits gepusht), Happy-Path-Push, 4xx → kein
  Retry, 5xx → Retry-dann-Erfolg, finaler Fail → Discord-Alert, Anhang-Best-
  Effort. `vi.useFakeTimers()` für die Backoff-Delays (1s/4s/16s).
- Idempotency-Key-Pfad (PR #59) end-to-end verifizieren.

### M15 — SumUp RLS (`listActiveSumUpTenants`)
- Integrationstest gegen echte DB mit **aktiver RLS** auf einer Spiegel-Tabelle:
  beweist, dass das Tenant-Listing unter RLS funktioniert (bzw. dass die
  Owner-Connection aus [[T022]] nötig ist).

### M15 — POS-Cleanup Lösch-Kriterien (`purgeInactivePosCredentials`)
- Drei Fixtures gegen echte DB:
  1. aktive Credential → bleibt,
  2. inaktiv aber innerhalb Retention (z.B. 29 Tage bei 30d) → bleibt,
  3. inaktiv außerhalb Retention (31 Tage) → wird gelöscht.
- Boundary-Test exakt auf der Grenze (`updated_at = now() - retention`).
- Verifizieren, dass der `audit_log`-Eintrag tenant-isoliert geschrieben wird
  (PR #61) und `auth_audit_log` NICHT mehr genutzt wird.

## Akzeptanz
- Tests laufen in CI (`Backend — Lint, Build, Migrate, Test`) grün.
- Coverage der drei Kern-Funktionen ≥ 80%.

---

## Umsetzung (2026-06-30, Steve)

Ist-Stand-Abgleich vor dem Schreiben (Anti-Drift) — die eingefrorene Spec ist pre-reboot:

- **M05 `exportBelegToLexware`** → `src/__tests__/integration/m05-lexware-export.test.ts` (7 Tests):
  Happy-Path (status=exported + export_log), Idempotenz-Skip (kein Doppel-Push), Status-Gate
  (`not_categorized`), 4xx→kein Retry, 5xx→Retry-dann-Erfolg, Final-Fail (attempts=3),
  Anhang-Best-Effort. DI-Hooks `lexofficeClient`/`s3`/`fetchImpl`. **Backoff mit ECHTEN
  Wartezeiten** (1 s / 1 s+4 s) statt `vi.useFakeTimers()` — Fake-Timer kollidieren mit der
  echten DB-I/O des Exporters und können in CI hängen; Tests mit 20 s-Timeout.
- **M15 `purgeInactivePosCredentials`** → `src/__tests__/integration/m15-pos-cleanup.test.ts`:
  active-Gate + Retention-Grenze (718 h innen / 722 h außen, race-frei via Stunden-Margin) +
  tenant-isolierte audit_log-Inserts über 2 Tenants. `updated_at` per INSERT gesetzt
  (`set_updated_at`-Trigger ist BEFORE UPDATE). Fixtures respektieren UNIQUE(tenant_id, pos_system).
- **M15 SumUp-RLS (`listActiveSumUpTenants`)** — **bewusst verschoben** (korrigiert nach
  code-reviewer-Befund PR #222): Die Funktion existiert weiterhin
  (`kasse-transactions.repository.ts:220`, live genutzt von `cron/sumup-daily.ts:43`). Der von der
  Spec gewünschte RLS-Beweis ist aber **noch nicht möglich**: `pos_credentials` hat **keine RLS**
  (Migration 022, Z. 9–10 — RLS-Härtung explizit auf **T020** vertagt); das `bypass_rls` im
  Listing ist auf einer RLS-freien Tabelle ein No-Op. Die Query-Logik ist bereits per Mock-Test
  (`kasse-transactions.repository.test.ts`) abgedeckt. → Real-DB-RLS-Test auf **T020/T022** verschoben.

**Verifikation:** Lokal keine Postgres → DB-Integrationstests skippen (Repo-Norm, `dbAvailable`-Guard).
Beweis läuft in CI (postgres:16 + `CI=true` ⇒ REQUIRE_DB). Lint (299) + build lokal grün.
