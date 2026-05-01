/**
 * M05 — Lexoffice Rate-Limiter (Token-Bucket in Redis).
 *
 * Lexoffice begrenzt 2 Req/s pro Mandant (Spec §9). Wir verwenden ein
 * einfaches Token-Bucket pro customer_id mit Auffüll-Rate 2 Tokens/s und
 * max. Burst von 2.
 *
 * Lua-Atomar gehalten, falls mehrere Backend-Instanzen laufen.
 *
 * In-Memory-Fallback: Wenn kein Redis vorhanden ist (Tests), nutzt der
 * Limiter einen lokalen Cache.
 */

import type Redis from 'ioredis';

const RATE = 2;          // Tokens pro Sekunde
const BURST = 2;
const KEY_PREFIX = 'pp:lexoffice:ratelimit:';
const MAX_WAIT_MS = 5000;

const inMemory = new Map<string, { tokens: number; updated: number }>();

export class RateLimitTimeoutError extends Error {
  constructor(customerId: string) {
    super(`LEXOFFICE_RATELIMIT_TIMEOUT: Customer ${customerId} > ${MAX_WAIT_MS}ms`);
    this.name = 'RateLimitTimeoutError';
  }
}

export async function acquireToken(redis: Redis | null, customerId: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    if (await tryConsume(redis, customerId)) {
      return;
    }
    // Warten bis nächstes Token (~500ms)
    await sleep(150);
  }
  throw new RateLimitTimeoutError(customerId);
}

async function tryConsume(redis: Redis | null, customerId: string): Promise<boolean> {
  if (!redis) {
    return tryConsumeMemory(customerId);
  }
  const key = `${KEY_PREFIX}${customerId}`;
  const now = Date.now();

  // Atomares Skript: tokens auffüllen, ggf. konsumieren.
  const lua = `
    local key      = KEYS[1]
    local rate     = tonumber(ARGV[1])
    local burst    = tonumber(ARGV[2])
    local now      = tonumber(ARGV[3])

    local data = redis.call('HMGET', key, 'tokens', 'updated')
    local tokens  = tonumber(data[1])
    local updated = tonumber(data[2])
    if tokens == nil then tokens = burst end
    if updated == nil then updated = now end

    local elapsed = (now - updated) / 1000.0
    tokens = math.min(burst, tokens + elapsed * rate)
    if tokens >= 1 then
      tokens = tokens - 1
      redis.call('HMSET', key, 'tokens', tokens, 'updated', now)
      redis.call('PEXPIRE', key, 10000)
      return 1
    else
      redis.call('HMSET', key, 'tokens', tokens, 'updated', now)
      redis.call('PEXPIRE', key, 10000)
      return 0
    end
  `;
  try {
    const consumed = (await (redis as unknown as { eval: (...a: unknown[]) => Promise<number> }).eval(
      lua, 1, key, RATE, BURST, now,
    )) as number;
    return consumed === 1;
  } catch {
    // Bei Redis-Fehler: nicht limitieren, weitermachen.
    return true;
  }
}

function tryConsumeMemory(customerId: string): boolean {
  const now = Date.now();
  const entry = inMemory.get(customerId) ?? { tokens: BURST, updated: now };
  const elapsed = (now - entry.updated) / 1000;
  const tokens = Math.min(BURST, entry.tokens + elapsed * RATE);
  if (tokens >= 1) {
    inMemory.set(customerId, { tokens: tokens - 1, updated: now });
    return true;
  }
  inMemory.set(customerId, { tokens, updated: now });
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Test-Hilfe: setzt In-Memory-State zurück. */
export function __resetRateLimiter(): void {
  inMemory.clear();
}
