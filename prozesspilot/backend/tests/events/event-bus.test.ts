/**
 * D6 — Unit-Tests Event-Bus
 *
 * Kein echter Redis-Server nötig — alle Redis-Methoden werden via vi.fn() gemockt.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConsumerGroup, consumeEvents } from '../../src/core/events/consumer';
import { publishCustomerEvent, publishEvent } from '../../src/core/events/publisher';
import { STREAMS } from '../../src/core/events/types';

// ── Mock-Redis-Client ─────────────────────────────────────────────────────────

function makeRedis() {
  return {
    xadd:       vi.fn(),
    xgroup:     vi.fn(),
    xreadgroup: vi.fn(),
    xack:       vi.fn(),
  };
}

type MockRedis = ReturnType<typeof makeRedis>;

// ── publishEvent ──────────────────────────────────────────────────────────────

describe('publishEvent', () => {
  let redis: MockRedis;

  beforeEach(() => { redis = makeRedis(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('ruft xadd mit korrekten Parametern auf', async () => {
    redis.xadd.mockResolvedValue('1234567890-0');

    const id = await publishEvent(redis as never, 'pp:test', { type: 'test.event', tenant_id: 'abc' });

    expect(redis.xadd).toHaveBeenCalledOnce();
    expect(redis.xadd).toHaveBeenCalledWith('pp:test', '*', 'type', 'test.event', 'tenant_id', 'abc');
    expect(id).toBe('1234567890-0');
  });

  it('gibt null zurück und wirft nicht wenn Redis fehlt', async () => {
    redis.xadd.mockRejectedValue(new Error('ECONNREFUSED'));

    const id = await publishEvent(redis as never, 'pp:test', { type: 'test.event' });

    expect(id).toBeNull();
  });
});

// ── publishCustomerEvent ──────────────────────────────────────────────────────

describe('publishCustomerEvent', () => {
  let redis: MockRedis;

  beforeEach(() => { redis = makeRedis(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('schreibt in den customers-Stream mit korrekten Feldern', async () => {
    redis.xadd.mockResolvedValue('9999-0');

    await publishCustomerEvent(redis as never, 'customer.created', 'tenant-1', {
      customer_id: 'cust-42',
      external_id: 'DATEV-001',
    });

    expect(redis.xadd).toHaveBeenCalledOnce();
    const [stream, id, ...fields] = redis.xadd.mock.calls[0] as string[];
    expect(stream).toBe(STREAMS.customers);
    expect(id).toBe('*');

    // Felder als Objekt auswerten
    const fieldMap: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) fieldMap[fields[i]] = fields[i + 1];

    expect(fieldMap.type).toBe('customer.created');
    expect(fieldMap.tenant_id).toBe('tenant-1');
    expect(JSON.parse(fieldMap.payload)).toMatchObject({ customer_id: 'cust-42', external_id: 'DATEV-001' });
    expect(fieldMap.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('schluckt Redis-Fehler ohne Exception', async () => {
    redis.xadd.mockRejectedValue(new Error('Redis down'));

    await expect(
      publishCustomerEvent(redis as never, 'customer.updated', 'tenant-1', { customer_id: 'x' }),
    ).resolves.toBeUndefined();
  });
});

// ── createConsumerGroup ───────────────────────────────────────────────────────

describe('createConsumerGroup', () => {
  let redis: MockRedis;

  beforeEach(() => { redis = makeRedis(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('ruft XGROUP CREATE mit MKSTREAM auf', async () => {
    redis.xgroup.mockResolvedValue('OK');

    await createConsumerGroup(redis as never, STREAMS.customers, 'pp-worker');

    expect(redis.xgroup).toHaveBeenCalledWith(
      'CREATE', STREAMS.customers, 'pp-worker', '$', 'MKSTREAM',
    );
  });

  it('ignoriert BUSYGROUP-Fehler (Group existiert bereits)', async () => {
    redis.xgroup.mockRejectedValue(new Error('BUSYGROUP Consumer Group already exists'));

    await expect(
      createConsumerGroup(redis as never, STREAMS.customers, 'pp-worker'),
    ).resolves.toBeUndefined();
  });

  it('wirft andere Fehler weiter', async () => {
    redis.xgroup.mockRejectedValue(new Error('NOPERM insufficient permissions'));

    await expect(
      createConsumerGroup(redis as never, STREAMS.customers, 'pp-worker'),
    ).rejects.toThrow('NOPERM');
  });
});

// ── consumeEvents ─────────────────────────────────────────────────────────────

describe('consumeEvents', () => {
  let redis: MockRedis;

  beforeEach(() => { redis = makeRedis(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('ruft Handler auf und sendet XACK', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    redis.xack.mockResolvedValue(1);

    // ioredis XREADGROUP-Ergebnis: [[stream, [[id, [field, value, ...]]]]
    redis.xreadgroup.mockResolvedValue([
      [
        STREAMS.customers,
        [
          [
            '1111-0',
            ['type', 'customer.created', 'tenant_id', 't1', 'timestamp', '2024-01-01T00:00:00.000Z', 'payload', '{"customer_id":"c1"}'],
          ],
        ],
      ],
    ]);

    await consumeEvents(redis as never, STREAMS.customers, 'pp-worker', 'w1', handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('1111-0', {
      type:       'customer.created',
      tenant_id:  't1',
      timestamp:  '2024-01-01T00:00:00.000Z',
      payload:    '{"customer_id":"c1"}',
    });
    expect(redis.xack).toHaveBeenCalledWith(STREAMS.customers, 'pp-worker', '1111-0');
  });

  it('sendet kein XACK wenn Handler wirft', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Handler-Fehler'));
    redis.xack.mockResolvedValue(1);
    redis.xreadgroup.mockResolvedValue([
      [STREAMS.customers, [['2222-0', ['type', 'customer.created', 'tenant_id', 't1', 'timestamp', 'ts', 'payload', '{}']]]],
    ]);

    // Darf nicht werfen — Fehler werden geloggt
    await expect(
      consumeEvents(redis as never, STREAMS.customers, 'pp-worker', 'w1', handler),
    ).resolves.toBeUndefined();

    expect(redis.xack).not.toHaveBeenCalled();
  });

  it('tut nichts wenn xreadgroup null zurückgibt (Timeout)', async () => {
    const handler = vi.fn();
    redis.xreadgroup.mockResolvedValue(null);

    await consumeEvents(redis as never, STREAMS.customers, 'pp-worker', 'w1', handler);

    expect(handler).not.toHaveBeenCalled();
    expect(redis.xack).not.toHaveBeenCalled();
  });

  it('verarbeitet mehrere Nachrichten in einer Runde', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    redis.xack.mockResolvedValue(1);
    redis.xreadgroup.mockResolvedValue([
      [
        STREAMS.customers,
        [
          ['3333-0', ['type', 'customer.created',     'tenant_id', 't1', 'timestamp', 'ts1', 'payload', '{}']],
          ['3334-0', ['type', 'customer.soft_deleted', 'tenant_id', 't1', 'timestamp', 'ts2', 'payload', '{}']],
        ],
      ],
    ]);

    await consumeEvents(redis as never, STREAMS.customers, 'pp-worker', 'w1', handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(redis.xack).toHaveBeenCalledTimes(2);
  });
});
