---
name: ProzessPilot Projekt-Architektur
description: Server-Entry, Fastify-Aufbau (buildApp in app.ts), Core-Layer-Struktur, Module-Konventionen
type: project
---

## Server-Entry

- `server.ts` — minimaler Entry: ruft `buildApp()` aus `app.ts` auf, startet Listen + Graceful Shutdown
- `app.ts` — Hauptdatei: Fastify-Instanz, alle Plugins, Routen, Error-Handler
- Fastify wird mit `CommonJS` kompiliert (tsconfig module: "CommonJS") — KEINE `.js`-Endungen in Imports nötig

## Fastify-Aufbau in app.ts

Reihenfolge (wichtig):
1. Content-Type-Parser (rawBody für HMAC)
2. `requestLoggingPlugin(app)` — direkt aufrufen, nicht per `register()`
3. Prometheus onRequest/onResponse Hooks (nach requestLoggingPlugin)
4. `/metrics` GET-Endpoint (kein Auth, intern)
5. Rate-Limiting (nicht in test-Umgebung)
6. Öffentliche Routen (health, SSE, docs, webhooks)
7. `/api/v1` mit HMAC-Middleware (`hmacMiddleware` als `preHandler`)
8. `onClose`: stopWorker, db.end(), redis.disconnect()
9. `setErrorHandler` (prod: kein Stack-Trace-Leak; dev: stderr)

## Fastify-Deklarationen

```ts
declare module 'fastify' {
  interface FastifyInstance { db: Pool; redis: Redis; s3?: S3Client }
  interface FastifyRequest { startTime?: number } // fuer Prometheus-Metriken
}
```

## Core-Layer (backend/src/core/)

- `config.ts` — Env-Variablen typisiert
- `logger.ts` — Pino-Instanz
- `sentry.ts` — initSentry(), captureException(), captureMessage() [NEU Task 501]
- `metrics.ts` — prom-client Registry + Custom-Metriken [NEU Task 501]
- `adapters/` — OCR-Adapter-Factory
- `auth/` — HMAC-Middleware
- `hooks/` — HookRunner, request-logging, hook-routes
- `db/`, `storage/`, `schemas/`, `webhooks/`, etc.

## Module-Struktur

- `/modules/m01-receipt-intake/` — OCR-Extraktion, uses metrics.ts
- `/modules/_shared/` — geteilte Repos (receipts, customers, errors)
- No-Go-Module: m04-datev, m05-lexoffice, m06-sevdesk, m08-reporting, m09-supplier-comm, plugin-system, dsgvo

**Why:** Die No-Go-Module werden von anderen Teams bearbeitet und sind abgeschlossen.
**How to apply:** Instrumentierung immer ueber Core-Layer-Hooks, nie direkt in No-Go-Modulen.
