// k6 Load Test Configuration
// Overridable via environment variables at runtime:
//   BASE_URL=https://staging.example.com k6 run scenarios/upload-receipts.js

export const BASE_URL  = __ENV.BASE_URL  || 'http://localhost:3000';
export const TENANT_ID = __ENV.TENANT_ID || 'test-tenant-001';
export const AUTH_KEY  = __ENV.AUTH_KEY  || 'dev-hmac-key';

export const DEFAULT_OPTIONS = {
  thresholds: {
    // p95 Latenz muss unter 2 Sekunden bleiben
    http_req_duration: ['p(95)<2000'],
    // Fehlerrate unter 1 %
    http_req_failed:   ['rate<0.01'],
  },
};
