import { describe, expect, it } from 'vitest';
import {
  isCurrentlyLocked,
  registerFailedLogin,
  resetOnSuccess,
} from '../services/lockout.service';

describe('lockout.service', () => {
  it('isCurrentlyLocked: zukünftiger locked_until → gesperrt', () => {
    const future = new Date(Date.now() + 60_000);
    const res = isCurrentlyLocked({ failedAttempts: 5, lockedUntil: future });
    expect(res.isLocked).toBe(true);
    expect(res.unlockAt).toEqual(future);
  });

  it('isCurrentlyLocked: vergangener locked_until → nicht gesperrt', () => {
    const past = new Date(Date.now() - 60_000);
    const res = isCurrentlyLocked({ failedAttempts: 5, lockedUntil: past });
    expect(res.isLocked).toBe(false);
  });

  it('registerFailedLogin: zählt hoch, lockt bei 5', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    let state = { failedAttempts: 0, lockedUntil: null as Date | null };
    for (let i = 1; i <= 4; i++) {
      const r = registerFailedLogin(state, now);
      expect(r.justLocked).toBe(false);
      expect(r.nextFailedAttempts).toBe(i);
      state = { failedAttempts: r.nextFailedAttempts, lockedUntil: r.nextLockedUntil };
    }
    const fifth = registerFailedLogin(state, now);
    expect(fifth.justLocked).toBe(true);
    expect(fifth.nextFailedAttempts).toBe(5);
    expect(fifth.nextLockedUntil).not.toBeNull();
    // 15 min Lock per default
    expect(fifth.nextLockedUntil!.getTime() - now.getTime()).toBe(15 * 60 * 1000);
  });

  it('registerFailedLogin: reset wenn Lock abgelaufen', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const expired = new Date('2026-01-01T11:00:00Z');
    const r = registerFailedLogin({ failedAttempts: 5, lockedUntil: expired }, now);
    expect(r.nextFailedAttempts).toBe(1);
    expect(r.justLocked).toBe(false);
  });

  it('resetOnSuccess setzt Counter auf 0', () => {
    expect(resetOnSuccess()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });
});
