---
name: ProzessPilot Coding Conventions
description: TypeScript-Regeln, Import-Stil, Env-Variablen-Schema, Fastify-Muster
type: project
---

## TypeScript

- `tsconfig`: CommonJS, ES2022, strict: true, skipLibCheck: true
- KEINE `.js`-Endungen in Imports (CommonJS-Modul-Resolution)
- Kein `any` — wenn unvermeidlich: eslint-disable-Kommentar mit Begruendung
- Fastify-Typ-Pattern: `FastifyRequest<{ Params: {...}; Body: {...} }>`
- Generics mit `as const` fuer labelNames in prom-client

## Fastify-Plugin-Muster

```ts
// Direkte Funktion (kein register()) fuer globale Hooks:
await requestLoggingPlugin(app);

// Register() fuer Routen-Plugins mit optionalem Prefix:
await app.register(myRoutes, { prefix: '/my-prefix' });
```

## Env-Variablen-Naming

- Sentry: `SENTRY_DSN`, `APP_VERSION`
- Prometheus/Grafana: `GRAFANA_ADMIN_PASSWORD`
- Allgemein: `PP_*` fuer ProzessPilot-spezifische Vars
- Jede neue Variable in `.env.example` mit Kommentar/Defaultwert dokumentieren

## Metriken-Naming-Convention

Format: `pp_<domain>_<metric>_<unit>`
- Beispiele: `pp_receipts_processed_total`, `pp_http_request_duration_seconds`
- Immer `as const` fuer labelNames-Arrays

## Logger-Konvention

- Pino-Logger aus `src/core/logger.ts` importieren
- `logger.info({ key: value }, 'Nachricht')` — strukturiertes Logging
- Im Error-Handler: `logger.error({ err: error }, 'Beschreibung')`
