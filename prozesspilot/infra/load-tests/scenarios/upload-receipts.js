/**
 * Load Test: Concurrent Receipt Uploads
 * Simulates 100 concurrent users uploading PDF receipts.
 * Target: p95 < 2s, error rate < 1%
 *
 * Run: k6 run scenarios/upload-receipts.js
 * Stress: k6 run --vus 200 --duration 60s scenarios/upload-receipts.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, TENANT_ID, DEFAULT_OPTIONS } from '../config.js';

export const options = {
  ...DEFAULT_OPTIONS,
  scenarios: {
    concurrent_uploads: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Ramp up: 0 → 100 VUs in 30s
        { duration: '30s', target: 100 },
        // Hold steady: 100 VUs for 60s
        { duration: '60s', target: 100 },
        // Ramp down: 100 → 0 VUs in 20s
        { duration: '20s', target: 0 },
      ],
    },
  },
};

const uploadErrors   = new Counter('upload_errors');
const processingTime = new Trend('processing_time_ms');

export default function () {
  const payload = {
    file:        http.file(open('../fixtures/test-receipt.pdf'), 'test-receipt.pdf', 'application/pdf'),
    customer_id: 'load-test-customer',
  };

  const headers = {
    'X-Tenant-ID': TENANT_ID,
  };

  const start = Date.now();
  const res   = http.post(`${BASE_URL}/api/v1/receipts`, payload, { headers });
  processingTime.add(Date.now() - start);

  const ok = check(res, {
    'status 201':     (r) => r.status === 201,
    'hat receipt_id': (r) => {
      try {
        return JSON.parse(r.body)?.receipt_id !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (!ok) uploadErrors.add(1);

  // Zufällige Pause 0–2 Sekunden zwischen Requests (realistisches User-Verhalten)
  sleep(Math.random() * 2);
}
