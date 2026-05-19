/**
 * Wird von vitest vor allen Tests ausgeführt.
 * Lädt die .env-Datei aus dem Projekt-Root und setzt Test-Overrides.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// .env einlesen und in process.env eintragen (nur wenn nicht bereits gesetzt)
try {
  const envPath = join(__dirname, '..', '..', '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
} catch {
  // .env nicht gefunden — Defaults aus config.ts greifen
}

// Test-Overrides (überschreiben .env immer — deterministisch für alle Tests)
process.env.NODE_ENV = 'test';
process.env.PP_AUTH_DISABLED = '1';
process.env.LOG_LEVEL = 'silent';
// T007 Review-Fix B1: OCR-Queue im Test deaktivieren. Sonst versucht der
// upload.handler bei jedem 201-Response BullMQ-Redis-Connection aufzubauen
// (kein Redis in CI) und Tests timeouten. config.ts liest die Env beim
// Import → MUSS in Setup-File gesetzt werden, nicht im Test selbst.
process.env.OCR_QUEUE_ENABLED = '0';

// M10: feste Test-Werte, unabhängig von .env (Test berechnet Signatur mit diesen Werten)
process.env.WHATSAPP_APP_SECRET = 'meta-app-secret-test';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token-test';
process.env.WHATSAPP_GRAPH_API_VERSION = 'v19.0';
