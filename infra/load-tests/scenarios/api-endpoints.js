/**
 * Load Test: API Endpoints
 * Tests the most important read endpoints under sustained load.
 * 50 VUs for 60 seconds — simulates dashboard and list usage.
 *
 * Endpoints tested:
 *   GET /api/v1/receipts          — Beleg-Liste (paginiert)
 *   GET /api/v1/receipts/:id      — Beleg-Detail
 *   GET /api/v1/stats/summary     — Dashboard-Zusammenfassung
 *
 * Run: k6 run scenarios/api-endpoints.js
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, TENANT_ID, DEFAULT_OPTIONS } from '../config.js';

export const options = {
  ...DEFAULT_OPTIONS,
  vus:      50,
  duration: '60s',
};

const apiErrors      = new Counter('api_errors');
const listLatency    = new Trend('list_latency_ms');
const detailLatency  = new Trend('detail_latency_ms');
const statsLatency   = new Trend('stats_latency_ms');
const successRate    = new Rate('success_rate');

// Test-Belegs-IDs — werden bei leerem System durch den ersten List-Call befüllt
let knownReceiptIds = [];

const headers = {
  'X-Tenant-ID': TENANT_ID,
  'Content-Type': 'application/json',
};

export default function () {
  // ── 1. Beleg-Liste abrufen ────────────────────────────────────────────────
  group('GET /api/v1/receipts', () => {
    const start = Date.now();
    const res   = http.get(`${BASE_URL}/api/v1/receipts?limit=20&offset=0`, { headers });
    listLatency.add(Date.now() - start);

    const ok = check(res, {
      'list: status 200': (r) => r.status === 200,
      'list: hat items':  (r) => {
        try {
          const body = JSON.parse(r.body);
          // IDs für Detail-Tests sammeln
          if (Array.isArray(body?.data) && body.data.length > 0) {
            knownReceiptIds = body.data.slice(0, 5).map((item) => item.id).filter(Boolean);
          }
          return body?.data !== undefined;
        } catch {
          return false;
        }
      },
    });
    if (!ok) apiErrors.add(1);
    successRate.add(ok ? 1 : 0);
  });

  sleep(0.2);

  // ── 2. Beleg-Detail abrufen (falls IDs bekannt) ────────────────────────────
  if (knownReceiptIds.length > 0) {
    group('GET /api/v1/receipts/:id', () => {
      // Zufällige ID aus den bekannten IDs wählen
      const id    = knownReceiptIds[Math.floor(Math.random() * knownReceiptIds.length)];
      const start = Date.now();
      const res   = http.get(`${BASE_URL}/api/v1/receipts/${id}`, { headers });
      detailLatency.add(Date.now() - start);

      const ok = check(res, {
        'detail: status 200 oder 404': (r) => r.status === 200 || r.status === 404,
        'detail: hat id':              (r) => {
          if (r.status === 404) return true; // 404 ist ein valides Ergebnis
          try {
            return JSON.parse(r.body)?.id !== undefined;
          } catch {
            return false;
          }
        },
      });
      if (!ok) apiErrors.add(1);
      successRate.add(ok ? 1 : 0);
    });
  } else {
    // Fallback: Anfrage mit bekannt-ungültiger ID (testet 404-Handling)
    group('GET /api/v1/receipts/:id (fallback)', () => {
      const start = Date.now();
      const res   = http.get(`${BASE_URL}/api/v1/receipts/00000000-0000-0000-0000-000000000000`, { headers });
      detailLatency.add(Date.now() - start);

      const ok = check(res, {
        'detail fallback: status 404': (r) => r.status === 404,
      });
      if (!ok) apiErrors.add(1);
    });
  }

  sleep(0.2);

  // ── 3. Dashboard-Stats abrufen ────────────────────────────────────────────
  group('GET /api/v1/stats/summary', () => {
    const start = Date.now();
    const res   = http.get(`${BASE_URL}/api/v1/stats/summary`, { headers });
    statsLatency.add(Date.now() - start);

    const ok = check(res, {
      'stats: status 200':      (r) => r.status === 200,
      'stats: hat total_count': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body?.total_count !== undefined || body?.totalCount !== undefined;
        } catch {
          return false;
        }
      },
    });
    if (!ok) apiErrors.add(1);
    successRate.add(ok ? 1 : 0);
  });

  // Realistische Pause zwischen Request-Zyklen
  sleep(Math.random() * 1.5 + 0.5);
}
