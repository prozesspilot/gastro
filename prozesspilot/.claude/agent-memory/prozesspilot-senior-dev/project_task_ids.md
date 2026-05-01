---
name: ProzessPilot Task ID Registry
description: Maps known task IDs to modules/features and their done status
type: project
---

Task IDs are stored in `/Users/donandrejo/Documents/ProzessPilot/prozesspilot/webapp/src/data/tasks.ts`.

Phase 4 (Hardening & Production) tasks - all done as of 2026-05-01:
- 500: Load Tests (k6, 100 concurrent uploads) — done: true
- 501: Sentry + Grafana Monitoring — done: true
- 502: Backup strategy — done: true
- 503: Security Review OWASP — done: true
- 504: DSGVO Compliance — done: true
- 505: CI/CD Pipeline GitHub Actions — done: true
- 506: Runbook / operational docs — done: true

Production mission tasks completed 2026-05-01:
- Docker Dockerfiles (backend + webapp) + nginx.conf created
- docker-compose.prod.yml created
- .env.example expanded with all required variables
- openapi.yaml completed with all missing endpoints + schemas
- Integration test suite created (receipt-pipeline + plugin-dispatcher)
- NotFoundPage.tsx created, App.tsx updated with 404 fallback
- EmptyState.tsx component created, used in Communications + Plugins pages
- Layout.tsx updated with grouped nav (Belege / Verwaltung / System)
- n8n workflows: WF-M09-SUPPLIER-COMM.json, WF-PLUGIN-DISPATCHER.json, WF-CRON-M09-EXPECTED.json
- n8n/README.md created with import instructions
- /health route enhanced with DB check, timestamp, version, checks object

Phase 2 adapter tasks completed 2026-05-01:
- 310: Excel/OneDrive Adapter (M07 §9.3) — done: true
- 311: Dropbox Archive Adapter (M02) — done: true

Key implementation details:
- Both adapters use native fetch (not SDK packages) — testable via vi.spyOn(global, 'fetch')
- DropboxAdapter takes optional db: Pool param in constructor (factory passes deps.db)
- MS Graph token refresh buffer: 5 min before expiry
- archive-storage/factory.ts updated to pass deps.db to DropboxAdapter
- dropbox-credentials.ts created (analog to drive-credentials.ts)
- Existing test in archive.handler.test.ts updated: no longer expects DROPBOX_NOT_IMPLEMENTED
- New tests in tests/adapters/ (not src/modules/ — vitest config includes tests/**)

**Why:** Keeping a registry of task IDs avoids duplicate work and helps locate the right tasks to update after implementation.

**How to apply:** After completing any task, locate the task by ID in tasks.ts and set done: true. The tasks.ts file uses TypeScript and must remain valid.
