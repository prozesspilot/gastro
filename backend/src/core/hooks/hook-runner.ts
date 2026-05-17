/**
 * Hook-Runner (04_Erweiterbarkeit_Pro.md §3).
 *
 * Lädt aktive Hooks aus `customer_hooks` (priority asc) und führt sie
 * implementations-spezifisch aus:
 *
 *   - 'http_webhook': POST an config.url mit HMAC-Sig-Header.
 *                     Response.body = neues payload (Patch-Merge).
 *   - 'js_inline':    config.code in node:vm runInNewContext mit Timeout.
 *                     Return-Wert (object) = neues payload.
 *   - 'disabled':     skip.
 *   - 'plugin_id':    derzeit no-op (Plugin-Loader kommt in Phase 3).
 *
 * Bei Hook-Fehler: loggen, Original-Receipt weiter — Pipeline wird NIEMALS
 * durch einen Hook-Fehler unterbrochen (außer config.on_failure='abort').
 *
 * Backwards-Compat: Wenn kein Pool über setHookRunnerDeps() verdrahtet ist,
 * verhält sich der Runner als No-Op (gibt receipt unverändert zurück) — so
 * funktionieren bestehende Tests von M01/M02/M07 ohne Setup-Aufwand.
 */

import { createHash, createHmac } from 'node:crypto';
import * as vm from 'node:vm';
import type { Pool } from 'pg';

import type { Receipt } from '../../modules/_shared/receipts/receipt.repository';
import { logger } from '../logger';
import {
  getActiveHooks as repoGetActiveHooks,
  logExecution as repoLogExecution,
} from './hook.repository';
import type { CustomerHook, HookPoint, HttpWebhookConfig, JsInlineConfig } from './hook.types';

export type { HookPoint } from './hook.types';

// ── Public Context ───────────────────────────────────────────────────────────

export interface HookContext<T = Record<string, unknown>> {
  receipt: Receipt;
  profile: { customer_id?: string; [k: string]: unknown };
  extra?: T;
}

export interface HookRunner {
  run<T = Record<string, unknown>>(point: HookPoint, ctx: HookContext<T>): Promise<Receipt>;
}

// ── Module-Scoped Deps (verdrahtet in app.ts via setHookRunnerDeps) ──────────

interface HookRunnerDeps {
  pool: Pool;
  /** Master-Schlüssel zum Entschlüsseln von customer_credentials (pgcrypto pgp_sym_decrypt). */
  pgcryptoKey?: string;
  /** Default-Fetch (für Tests injizierbar). */
  fetchImpl?: typeof fetch;
  /** Sleep für VM-Timeout-Polyfill (Tests). */
  setTimeoutImpl?: typeof setTimeout;
  /** Sleep-Funktion für Backoff-Wartezeiten (Tests können das überschreiben). */
  sleepImpl?: (ms: number) => Promise<void>;
}

let _deps: HookRunnerDeps | null = null;

export function setHookRunnerDeps(deps: HookRunnerDeps): void {
  _deps = deps;
}

export function clearHookRunnerDeps(): void {
  _deps = null;
}

// ── Implementation ───────────────────────────────────────────────────────────

export const hookRunner: HookRunner = {
  async run(point, ctx) {
    if (!_deps) {
      // Keine Verdrahtung → Backwards-Compat-No-Op (z. B. in Modul-Tests, die
      // den Runner nicht aktiv testen wollen).
      return ctx.receipt;
    }
    const customerId = typeof ctx.profile.customer_id === 'string' ? ctx.profile.customer_id : null;
    if (!customerId) {
      return ctx.receipt;
    }

    let hooks: CustomerHook[];
    try {
      hooks = await repoGetActiveHooks(_deps.pool, customerId, point);
    } catch (err) {
      logger.warn({ err, point, customerId }, 'Hook-Lookup fehlgeschlagen');
      return ctx.receipt;
    }

    let payload: HookPayload = {
      receipt: ctx.receipt,
      profile: ctx.profile as Record<string, unknown>,
      extra: ctx.extra ?? {},
      hook_point: point,
    };

    const traceId = (ctx.profile as { trace_id?: string }).trace_id ?? null;

    for (const hook of hooks) {
      const start = Date.now();
      const requestPayload = sanitizeForLog(payload);
      try {
        const result = await runOne(hook, payload, _deps);
        const duration = Date.now() - start;
        payload = result.payload;
        logger.debug(
          {
            hook_id: hook.hook_id,
            point,
            customerId,
            duration_ms: duration,
            status: result.status,
          },
          'Hook executed',
        );
        // Execution-Log (best-effort, blockiert Pipeline nicht)
        void repoLogExecution(_deps.pool, {
          hook_id: hook.hook_id,
          customer_id: customerId,
          receipt_id: payload.receipt.receipt_id ?? null,
          hook_point: point,
          status: result.status,
          request_payload: requestPayload,
          response_status: result.responseStatus ?? null,
          response_body: result.responseBody ?? null,
          duration_ms: duration,
          trace_id: traceId,
        }).catch((err) => logger.warn({ err }, 'hook_executions Insert fehlgeschlagen'));
      } catch (err) {
        const duration = Date.now() - start;
        logger.warn(
          { err, hook_id: hook.hook_id, point, customerId, duration_ms: duration },
          'Hook fehlgeschlagen — überspringe',
        );
        void repoLogExecution(_deps.pool, {
          hook_id: hook.hook_id,
          customer_id: customerId,
          receipt_id: payload.receipt.receipt_id ?? null,
          hook_point: point,
          status: 'failure',
          request_payload: requestPayload,
          duration_ms: duration,
          error_message: (err as Error).message,
          trace_id: traceId,
        }).catch(() => {
          /* best-effort */
        });

        const cfg = hook.config as { on_failure?: 'ignore' | 'abort' } | undefined;
        if (cfg?.on_failure === 'abort') {
          throw err;
        }
        // sonst weitermachen
      }
    }

    return payload.receipt;
  },
};

// ── Internals ────────────────────────────────────────────────────────────────

interface HookPayload {
  receipt: Receipt;
  profile: Record<string, unknown>;
  extra: Record<string, unknown>;
  hook_point: HookPoint;
}

interface RunResult {
  payload: HookPayload;
  status: 'success' | 'failure' | 'timeout' | 'skipped';
  responseStatus?: number | null;
  responseBody?: string | null;
}

async function runOne(
  hook: CustomerHook,
  payload: HookPayload,
  deps: HookRunnerDeps,
): Promise<RunResult> {
  switch (hook.implementation) {
    case 'disabled':
      return { payload, status: 'skipped' };
    case 'http_webhook':
      return runHttpWebhook(hook, payload, deps);
    case 'js_inline':
      return runJsInline(hook, payload);
    case 'plugin_id':
      // Plugin-Loader kommt in Phase 3 — bis dahin no-op.
      logger.warn({ hook_id: hook.hook_id }, 'plugin_id-Hooks sind noch nicht aktiviert');
      return { payload, status: 'skipped' };
    default:
      logger.warn({ implementation: hook.implementation }, 'Unbekannte Hook-Implementation');
      return { payload, status: 'skipped' };
  }
}

/** Reduziert das Payload auf logging-sichere Felder (kein Body-Bloat). */
function sanitizeForLog(payload: HookPayload): Record<string, unknown> {
  return {
    hook_point: payload.hook_point,
    receipt_id: payload.receipt.receipt_id,
    customer_id: payload.receipt.customer_id,
    receipt_status: payload.receipt.status,
  };
}

async function runHttpWebhook(
  hook: CustomerHook,
  payload: HookPayload,
  deps: HookRunnerDeps,
): Promise<RunResult> {
  const cfg = hook.config as HttpWebhookConfig & { retry_count?: number };
  if (!cfg.url) {
    logger.warn({ hook_id: hook.hook_id }, 'http_webhook ohne url — skip');
    return { payload, status: 'skipped' };
  }

  const timeoutMs = cfg.timeout_ms ?? 10000;
  const method = cfg.method ?? 'POST';
  const fetchFn: typeof fetch = deps.fetchImpl ?? fetch;
  const maxAttempts = Math.max(1, cfg.retry_count ?? 3);
  const sleepFn = deps.sleepImpl ?? sleep;

  const bodyJson = JSON.stringify(payload);
  const secret = await resolveSecret(deps.pool, hook.customer_id, cfg, deps.pgcryptoKey);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-pp-hook-id': hook.hook_id,
  };
  if (secret) {
    const sig = createHmac('sha256', secret).update(bodyJson).digest('hex');
    headers['x-pp-hook-signature'] = sig;
    // Standardisierter Header-Name für externe Empfänger:
    headers['x-prozesspilot-signature'] = sig;
  }

  const oneAttempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchFn(cfg.url, {
        method,
        headers,
        body: bodyJson,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  // Exponentielles Backoff: 1s, 2s, 4s, ... — Retry nur bei Netzwerk/Timeout/5xx, nicht bei 4xx.
  let response: Response | null = null;
  let attempt = 0;
  let lastErr: Error | undefined;
  let timedOut = false;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      response = await oneAttempt();
      if (response.status >= 500 && attempt < maxAttempts) {
        // 5xx → Retry mit Backoff
        await sleepFn(2 ** (attempt - 1) * 1000);
        response = null;
        continue;
      }
      break;
    } catch (err) {
      lastErr = err as Error;
      if ((err as Error).name === 'AbortError') {
        timedOut = true;
      }
      if (attempt < maxAttempts) {
        await sleepFn(2 ** (attempt - 1) * 1000);
      }
    }
  }
  if (!response) {
    if (timedOut) {
      return { payload, status: 'timeout', responseBody: lastErr?.message ?? 'AbortError' };
    }
    throw lastErr ?? new Error('webhook_unreachable');
  }

  if (response.status >= 400 && response.status < 500) {
    const txt = await response.text().catch(() => '');
    logger.warn(
      { hook_id: hook.hook_id, status: response.status },
      'http_webhook 4xx — Hook ignoriert',
    );
    return {
      payload,
      status: 'failure',
      responseStatus: response.status,
      responseBody: txt.slice(0, 4000),
    };
  }
  if (!response.ok) {
    const txt = await response.text().catch(() => '');
    logger.warn(
      { hook_id: hook.hook_id, status: response.status },
      'http_webhook 5xx nach Retry — Hook ignoriert',
    );
    return {
      payload,
      status: 'failure',
      responseStatus: response.status,
      responseBody: txt.slice(0, 4000),
    };
  }

  // 2xx — Body als JSON parsen; bei nicht-JSON oder leerem Body → Payload unverändert
  const text = await response.text();
  if (!text || !text.trim()) {
    return { payload, status: 'success', responseStatus: response.status, responseBody: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    logger.warn({ hook_id: hook.hook_id }, 'http_webhook Response kein JSON — ignoriert');
    return {
      payload,
      status: 'success',
      responseStatus: response.status,
      responseBody: text.slice(0, 4000),
    };
  }

  return {
    payload: mergeHookResponse(payload, parsed),
    status: 'success',
    responseStatus: response.status,
    responseBody: text.slice(0, 4000),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runJsInline(hook: CustomerHook, payload: HookPayload): Promise<RunResult> {
  const cfg = hook.config as JsInlineConfig;
  if (!cfg.code || typeof cfg.code !== 'string') {
    logger.warn({ hook_id: hook.hook_id }, 'js_inline ohne code — skip');
    return { payload, status: 'skipped' };
  }
  const timeoutMs = Math.min(cfg.timeout_ms ?? 2000, 5000);

  const ctx: vm.Context = vm.createContext({
    payload: structuredClone(payload),
    console: {
      log: (...args: unknown[]) =>
        logger.debug({ hook_id: hook.hook_id, args }, 'js_inline:console.log'),
    },
  });

  const wrapped = `(function(){ ${cfg.code}\n; return payload; })()`;
  let result: unknown;
  try {
    result = vm.runInContext(wrapped, ctx, {
      timeout: timeoutMs,
      filename: `hook_${hook.hook_id}.js`,
    });
  } catch (err) {
    const isTimeout = (err as Error).message.includes('Script execution timed out');
    logger.warn({ err, hook_id: hook.hook_id }, 'js_inline Eval-Fehler');
    return {
      payload,
      status: isTimeout ? 'timeout' : 'failure',
      responseBody: (err as Error).message,
    };
  }

  if (result && typeof result === 'object') {
    return { payload: mergeHookResponse(payload, result), status: 'success' };
  }
  return { payload, status: 'success' };
}

function mergeHookResponse(current: HookPayload, response: unknown): HookPayload {
  if (!response || typeof response !== 'object') return current;
  const r = response as Record<string, unknown>;

  // Konvention: Hook gibt entweder das volle payload zurück, oder ein "patch"-Objekt.
  if ('patch' in r && r.patch && typeof r.patch === 'object') {
    return mergePatch(current, r.patch as Record<string, unknown>);
  }
  return mergePatch(current, r);
}

function mergePatch(payload: HookPayload, patch: Record<string, unknown>): HookPayload {
  // Patch darf receipt, profile, extra ersetzen / mergen.
  const next: HookPayload = { ...payload };
  if (patch.receipt && typeof patch.receipt === 'object') {
    next.receipt = deepMerge(
      payload.receipt as unknown as Record<string, unknown>,
      patch.receipt as Record<string, unknown>,
    ) as unknown as Receipt;
  }
  if (patch.profile && typeof patch.profile === 'object') {
    next.profile = deepMerge(payload.profile, patch.profile as Record<string, unknown>);
  }
  if (patch.extra && typeof patch.extra === 'object') {
    next.extra = deepMerge(payload.extra, patch.extra as Record<string, unknown>);
  }
  return next;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof out[k] === 'object' &&
      out[k] !== null &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function resolveSecret(
  pool: Pool,
  customerId: string,
  cfg: HttpWebhookConfig,
  pgcryptoKey?: string,
): Promise<string | null> {
  // Inline secret hat Vorrang (für Tests / einfache Hooks).
  if (typeof cfg.secret === 'string' && cfg.secret.length > 0) {
    return cfg.secret;
  }
  if (!cfg.secret_ref || !pgcryptoKey) return null;
  try {
    const { rows } = await pool.query<{ plaintext: string }>(
      `SELECT pgp_sym_decrypt(ciphertext, $1)::text AS plaintext
         FROM customer_credentials
        WHERE customer_id = $2 AND kind = $3
        ORDER BY rotated_at DESC NULLS LAST, created_at DESC
        LIMIT 1`,
      [pgcryptoKey, customerId, cfg.secret_ref],
    );
    return rows[0]?.plaintext ?? null;
  } catch (err) {
    logger.warn({ err }, 'Hook-Secret-Lookup fehlgeschlagen');
    return null;
  }
}

// Kleiner Hash-Export für Tests / Debug.
export function hookPayloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
