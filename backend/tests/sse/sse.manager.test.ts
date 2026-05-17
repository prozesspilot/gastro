/**
 * Unit-Tests für SseManager.
 */

import { describe, expect, it } from 'vitest';
import { SseManager, type SseSink } from '../../src/core/sse/sse.manager';

function makeSink(): SseSink & { received: string[] } {
  const received: string[] = [];
  return {
    received,
    write(chunk: string) {
      received.push(chunk);
      return true;
    },
  };
}

describe('SseManager', () => {
  it('emit sendet an alle Subscriber des Tenants', () => {
    const m = new SseManager();
    const a = makeSink();
    const b = makeSink();
    m.subscribe('t1', a);
    m.subscribe('t1', b);

    m.emit('t1', 'receipt:status', { id: 'r1', status: 'done' });

    expect(a.received).toHaveLength(1);
    expect(b.received).toHaveLength(1);
    expect(a.received[0]).toContain('event: receipt:status');
    expect(a.received[0]).toContain('"id":"r1"');
  });

  it('emit sendet NICHT an anderen Tenant', () => {
    const m = new SseManager();
    const a = makeSink();
    const b = makeSink();
    m.subscribe('t1', a);
    m.subscribe('t2', b);

    m.emit('t1', 'foo', { x: 1 });

    expect(a.received).toHaveLength(1);
    expect(b.received).toHaveLength(0);
  });

  it('unsubscribe entfernt Client', () => {
    const m = new SseManager();
    const a = makeSink();
    m.subscribe('t1', a);
    expect(m.count('t1')).toBe(1);

    m.unsubscribe('t1', a);
    expect(m.count('t1')).toBe(0);

    m.emit('t1', 'foo', {});
    expect(a.received).toHaveLength(0);
  });

  it('emit ohne Subscriber ist no-op', () => {
    const m = new SseManager();
    expect(() => m.emit('t-nobody', 'evt', {})).not.toThrow();
  });
});
