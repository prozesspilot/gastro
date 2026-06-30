---
name: vitest-include-excludes-cron
description: "vitest-include erfasst src/cron/ NICHT — Cron-Tests dort laufen nie (auch nicht in CI), gehören in Modul-Test-Pfad"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d088e383-41d5-4374-8342-1abdeba8a298
---

Die vitest-`include`-Pattern im Backend (`backend/vitest.config.*`) decken **nur** ab:
`tests/**/*.test.ts`, `src/modules/**/tests/*.test.ts`, `src/modules/**/*.test.ts`,
`src/__tests__/**/*.test.ts`, `src/core/**/*.test.ts`.

**`src/cron/` ist NICHT dabei.** Ein Test unter `src/cron/<x>.test.ts` wird von vitest
gar nicht gefunden — `vitest run src/cron/x.test.ts` meldet „No test files found", und
**CI läuft ihn ebenfalls nie** (still grün, falscher Sicherheits-Eindruck).

**How to apply:** Cron-Logik-Tests in den Modul-Test-Pfad legen, nicht neben das Cron-Skript.
Vorbild: `src/modules/m15-pos-connector/tests/pos-cleanup.test.ts` testet
`src/cron/pos-credentials-cleanup.ts`. Für M08-Cron liegt der Test in
`src/modules/m08-reporting/services/monthly-report-cron.test.ts` und importiert das
Skript via `../../../cron/monthly-report`; `vi.mock`-Pfade resolven auf dieselben Module,
die das Cron-Skript importiert → Mocking greift trotzdem.

**Why:** Lief mir bei T090 auf — der Cron-Test lag erst in `src/cron/`, Build+Lokal-Run
sahen grün aus (Test wurde einfach ignoriert), erst die explizite Datei-Angabe entlarvte es.
Verwandt: [[backend-db-test-fresh-db]] (DB-Tests skippen lokal ohne Postgres → CI ist die
erste echte Ausführung; doppelte Falle: ein Test kann lokal „grün" sein, weil er gar nicht
oder nur geskippt läuft).
