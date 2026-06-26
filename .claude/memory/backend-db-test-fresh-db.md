---
name: backend-db-test-fresh-db
description: Backend-DB-Integrationstests (z.B. onboarding-wizard) brauchen lokal eine FRISCHE prozesspilot_test-DB — audit_log ist append-only + FK RESTRICT → Tenant-Seed-DELETE bricht sonst.
metadata: 
  node_type: memory
  type: reference
  originSessionId: ad4050f3-ed30-4beb-a342-f948a47662f3
---

`audit_log` hat Trigger `audit_log_no_delete` + `audit_log_no_update` (GoBD append-only) und der FK `audit_log_tenant_id_fkey` ist `ON DELETE RESTRICT`. Folge: **ein Tenant mit Audit-Historie ist nicht hart löschbar.**

Mehrere Integration-Tests (`backend/src/__tests__/integration/onboarding-wizard.test.ts`, vermutlich weitere) räumen im `beforeAll` per `DELETE FROM tenants WHERE id = <fixed test-tenant>` auf. Das funktioniert nur, wenn der Test-Tenant **noch keine** `audit_log`-Zeilen hat — also auf einer **frischen/ephemeren DB**. In CI ist die DB pro Run frisch (postgres:16 service) → grün. Lokal gegen die persistente Docker-Compose-DB (`prozesspilot-postgres-1`, `prozesspilot_test`) akkumulieren Audit-Zeilen über Läufe → `beforeAll` bricht mit `violates foreign key constraint "audit_log_tenant_id_fkey"` bzw. `audit_log is append-only`. Der `afterAll` swallowt seinen `DELETE FROM audit_log` bewusst per `.catch` (kann gar nicht löschen).

**How to apply:** Vor einem lokalen DB-Integrationslauf die Test-DB neu aufsetzen (matcht CI exakt):
1. Docker-Stack läuft (Docker Desktop startet ihn auto): `prozesspilot-postgres-1` + redis + minio.
2. `prozesspilot_test` drop/create via `pg` an der `postgres`-DB (pp ist Superuser): `pg_terminate_backend` für offene Connections → `DROP DATABASE IF EXISTS prozesspilot_test` → `CREATE DATABASE prozesspilot_test`. Rollen `gastro_app`/`gastro_owner` sind cluster-weit (überleben drop).
3. `npm run migrate` mit `DATABASE_URL=postgresql://pp:pp@localhost:5432/prozesspilot_test` (+ `PP_PGCRYPTO_KEY`/`JWT_SECRET`/`REDIS_URL`).
4. `npm test` mit `CI=true` (erzwingt `REQUIRE_DB`, sonst skippen DB-Tests still). Voller CI-äquivalenter Env-Satz steht in `.github/workflows/ci-backend.yml`.

Nicht `PP_E2E=1` setzen, wenn du „grün wie CI" willst: das aktiviert zusätzlich `audit.service`/`webhook.queue`-Tests, die gegen die nicht-existente `tenants.name`-Spalte schreiben ([[legacy-welt-schema-drift]]) und lokal rot sind — in CI laufen sie nicht. Webapp lokal: Node 26 bricht localStorage-Tests ([[webapp-test-stack]]).
