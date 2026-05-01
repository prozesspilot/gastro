/**
 * Rate-Limiting (Sliding-Window light) per Tenant + Endpoint-Gruppe.
 *
 * Implementation: Redis INCR mit EXPIRE 60s, gebunden an einen 60-Sekunden-
 * Bucket. Bei Überschreitung des Limits wird 429 zurückgegeben.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';

export type EndpointGroup = 'receipts_create' | 'receipts_ocr' | 'receipts_categorize' | 'default';

const LIMITS: Record<EndpointGroup, number> = {
  receipts_create:     100,
  receipts_ocr:         20,
  receipts_categorize:  20,
  default:             500,
};

const WINDOW_SECONDS = 60;

export interface RateLimitDeps {
  redis: Redis;
  /** Im Test override-bar */
  now?: () => number;
}

function bucketKey(tenantId: string, group: EndpointGroup, nowMs: number): string {
  const minuteBucket = Math.floor(nowMs / 1000 / WINDOW_SECONDS);
  return `ratelimit:${tenantId}:${group}:${minuteBucket}`;
}

export async function checkAndIncrement(
  deps: RateLimitDeps,
  tenantId: string,
  group: EndpointGroup,
): Promise<{ allowed: boolean; current: number; limit: number; retry_after: number }> {
  const now = deps.now ? deps.now() : Date.now();
  const key = bucketKey(tenantId, group, now);
  const limit = LIMITS[group];

  const current = await deps.redis.incr(key);
  if (current === 1) {
    await deps.redis.expire(key, WINDOW_SECONDS);
  }
  const remainingSecondsInWindow = WINDOW_SECONDS - Math.floor((now / 1000) % WINDOW_SECONDS);

  return {
    allowed: current <= limit,
    current,
    limit,
    retry_after: remainingSecondsInWindow,
  };
}

export function rateLimit(group: EndpointGroup) {
  return async function rateLimitMiddleware(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const redis = req.server.redis;
    if (!redis) return;
    const tenantId = req.tenantId;
    if (!tenantId) return;

    const result = await checkAndIncrement({ redis }, tenantId, group);
    if (!result.allowed) {
      reply.header('Retry-After', String(result.retry_after));
      await reply.code(429).send({
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Rate-Limit (${result.limit}/Minute) überschritten.`,
          retry_after: result.retry_after,
        },
      });
      return;
    }
  };
}
