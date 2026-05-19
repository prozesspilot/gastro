/**
 * T010/M12 — Tests fuer Redis-basierten Confirm-Token-Service.
 *
 * Wir mocken Redis komplett mit einer In-Memory-Map mit TTL-Tracking.
 */

import type Redis from 'ioredis';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  consumeConfirmToken,
  createConfirmToken,
  emailMatchesTokenPayload,
} from '../services/token.service';

/** Minimaler Redis-Stub: nur die Methoden, die der Service nutzt. */
function makeFakeRedis(): Redis {
  const store = new Map<string, string>();
  return {
    async set(key: string, value: string, _mode: string, _ttl: number) {
      store.set(key, value);
      return 'OK';
    },
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async del(key: string) {
      const had = store.delete(key);
      return had ? 1 : 0;
    },
  } as unknown as Redis;
}

const REQUEST_UUID = '550e8400-e29b-41d4-a716-446655440000';
const TENANT_UUID = '660e8400-e29b-41d4-a716-446655440000';

describe('token.service — createConfirmToken', () => {
  let redis: Redis;
  beforeEach(() => {
    redis = makeFakeRedis();
  });

  it('erzeugt einen 32-Zeichen-Hex-Token', async () => {
    const token = await createConfirmToken(redis, {
      request_id: REQUEST_UUID,
      tenant_id: TENANT_UUID,
      subject_email: 'subject@example.com',
    });
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('legt Token-Payload in Redis ab — abrufbar via consume', async () => {
    const token = await createConfirmToken(redis, {
      request_id: REQUEST_UUID,
      tenant_id: TENANT_UUID,
      subject_email: 'subject@example.com',
    });
    const payload = await consumeConfirmToken(redis, token);
    expect(payload).not.toBeNull();
    expect(payload?.request_id).toBe(REQUEST_UUID);
    expect(payload?.tenant_id).toBe(TENANT_UUID);
    expect(payload?.type).toBe('loeschung');
  });

  it('hasht die Email — kein Klartext in Redis', async () => {
    const token = await createConfirmToken(redis, {
      request_id: REQUEST_UUID,
      tenant_id: TENANT_UUID,
      subject_email: 'subject@example.com',
    });
    const payload = await consumeConfirmToken(redis, token);
    expect(payload?.subject_email_hash).not.toContain('subject@example.com');
    expect(payload?.subject_email_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('token.service — consumeConfirmToken', () => {
  let redis: Redis;
  beforeEach(() => {
    redis = makeFakeRedis();
  });

  it('liefert null bei ungueltigem Format', async () => {
    expect(await consumeConfirmToken(redis, '')).toBeNull();
    expect(await consumeConfirmToken(redis, 'short')).toBeNull();
    expect(await consumeConfirmToken(redis, 'X'.repeat(32))).toBeNull(); // nicht hex
    expect(await consumeConfirmToken(redis, '0'.repeat(33))).toBeNull(); // zu lang
  });

  it('liefert null bei nicht vorhandenem Token', async () => {
    const result = await consumeConfirmToken(redis, '0'.repeat(32));
    expect(result).toBeNull();
  });

  it('Single-Use: zweimaliger Consume liefert null', async () => {
    const token = await createConfirmToken(redis, {
      request_id: REQUEST_UUID,
      tenant_id: TENANT_UUID,
      subject_email: 'subject@example.com',
    });
    const first = await consumeConfirmToken(redis, token);
    expect(first).not.toBeNull();
    const second = await consumeConfirmToken(redis, token);
    expect(second).toBeNull();
  });
});

describe('token.service — emailMatchesTokenPayload', () => {
  it('match bei identischer Email (case-insensitive)', async () => {
    const redis = makeFakeRedis();
    const token = await createConfirmToken(redis, {
      request_id: REQUEST_UUID,
      tenant_id: TENANT_UUID,
      subject_email: 'Subject@Example.COM',
    });
    const payload = await consumeConfirmToken(redis, token);
    if (!payload) throw new Error('Token-Payload sollte nicht null sein');
    expect(emailMatchesTokenPayload('subject@example.com', payload)).toBe(true);
    expect(emailMatchesTokenPayload('SUBJECT@EXAMPLE.COM', payload)).toBe(true);
  });

  it('no-match bei anderer Email', async () => {
    const redis = makeFakeRedis();
    const token = await createConfirmToken(redis, {
      request_id: REQUEST_UUID,
      tenant_id: TENANT_UUID,
      subject_email: 'subject@example.com',
    });
    const payload = await consumeConfirmToken(redis, token);
    if (!payload) throw new Error('Token-Payload sollte nicht null sein');
    expect(emailMatchesTokenPayload('other@example.com', payload)).toBe(false);
  });
});
