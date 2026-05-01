/**
 * Tests für Rate-Limiting.
 *
 * Nutzt einen Fake-Redis (Map-basiert), damit der Test ohne laufende
 * Redis-Instanz und ohne Wartezeiten arbeitet.
 */

import { describe, expect, it } from 'vitest';
import { checkAndIncrement } from '../../src/core/rate-limit/rate-limit.middleware';

interface FakeRedisShape {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

function createFakeRedis(): FakeRedisShape & { reset(): void; map: Map<string, number> } {
  const map = new Map<string, number>();
  return {
    map,
    async incr(key: string) {
      const v = (map.get(key) ?? 0) + 1;
      map.set(key, v);
      return v;
    },
    async expire(_key: string, _s: number) {
      return 1;
    },
    reset() {
      map.clear();
    },
  };
}

describe('rate-limit checkAndIncrement', () => {
  it('erlaubt unter dem Limit', async () => {
    const redis = createFakeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await checkAndIncrement({ redis: redis as any, now: () => 1_700_000_000_000 }, 't1', 'receipts_ocr');
    expect(r.allowed).toBe(true);
    expect(r.current).toBe(1);
    expect(r.limit).toBe(20);
  });

  it('lehnt über dem Limit ab', async () => {
    const redis = createFakeRedis();
    let last;
    for (let i = 0; i < 21; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      last = await checkAndIncrement({ redis: redis as any, now: () => 1_700_000_000_000 }, 't1', 'receipts_ocr');
    }
    expect(last?.allowed).toBe(false);
    expect(last?.current).toBe(21);
  });

  it('zählt verschiedene Tenants unabhängig', async () => {
    const redis = createFakeRedis();
    for (let i = 0; i < 20; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await checkAndIncrement({ redis: redis as any, now: () => 1_700_000_000_000 }, 't1', 'receipts_ocr');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t2 = await checkAndIncrement({ redis: redis as any, now: () => 1_700_000_000_000 }, 't2', 'receipts_ocr');
    expect(t2.allowed).toBe(true);
    expect(t2.current).toBe(1);
  });

  it('zählt verschiedene Endpoint-Gruppen unabhängig', async () => {
    const redis = createFakeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await checkAndIncrement({ redis: redis as any, now: () => 1_700_000_000_000 }, 't1', 'receipts_ocr');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await checkAndIncrement({ redis: redis as any, now: () => 1_700_000_000_000 }, 't1', 'receipts_create');
    expect(r.allowed).toBe(true);
    expect(r.current).toBe(1);
    expect(r.limit).toBe(100);
  });

  it('unterschiedliche Minute-Buckets — neuer Bucket nach 60s', async () => {
    const redis = createFakeRedis();
    const baseMs = 1_700_000_000_000;
    for (let i = 0; i < 20; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await checkAndIncrement({ redis: redis as any, now: () => baseMs }, 't1', 'receipts_ocr');
    }
    // 60s später → neuer Bucket
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = await checkAndIncrement({ redis: redis as any, now: () => baseMs + 61_000 }, 't1', 'receipts_ocr');
    expect(next.allowed).toBe(true);
    expect(next.current).toBe(1);
  });
});
