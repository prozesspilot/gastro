/**
 * D4 — Zentraler Schema-Export
 *
 * Alle Schemas über einen einzigen Import beziehen:
 *   import { apiOk, uuidSchema, buildPaginationMeta } from './core/schemas';
 *
 * Hinweis (2026-06-30): Die Legacy-`customer`-Welt-Schemas (customer/document/
 * profile/routing-job/tenant) wurden entfernt — sie waren nach dem belege-Reboot
 * in Live-`src` ungenutzt (nur barrel-exportiert + in schemas.test.ts getestet).
 */

export * from './common';
