// Decision: Zentrales Metriken-Modul im Core-Layer — alle Module importieren
// von hier, kein direktes prom-client-Coupling außerhalb dieses Files.
// Prefix "pp_" = ProzessPilot-Namespace für alle Custom-Metriken.
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'pp_' });

// ── Belege-Metriken ───────────────────────────────────────────────────────────

export const receiptsProcessed = new Counter({
  name: 'pp_receipts_processed_total',
  help: 'Anzahl verarbeiteter Belege',
  labelNames: ['status', 'tenant_id'] as const,
  registers: [registry],
});

export const receiptProcessingDuration = new Histogram({
  name: 'pp_receipt_processing_duration_seconds',
  help: 'Verarbeitungszeit pro Beleg in Sekunden',
  labelNames: ['module'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export const activeReceipts = new Gauge({
  name: 'pp_receipts_active',
  help: 'Belege aktuell in Verarbeitung',
  labelNames: ['tenant_id'] as const,
  registers: [registry],
});

// ── API-Metriken ─────────────────────────────────────────────────────────────

export const httpRequestDuration = new Histogram({
  name: 'pp_http_request_duration_seconds',
  help: 'HTTP Request Dauer',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: 'pp_http_requests_total',
  help: 'Anzahl HTTP Requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});
