/**
 * M14 — Lockout-Service
 *
 * Spec §5.7: 5 fehlgeschlagene Logins in 15 min → Account 15 min gesperrt.
 * Wir nutzen `failed_attempts`-Counter im User-Row und `locked_until`. Wenn
 * locked_until in der Vergangenheit liegt und failed_attempts ≥ MAX, wird
 * beim nächsten erfolgreichen Login zurückgesetzt. Wenn ein neuer Fail
 * passiert, nachdem das Lock abgelaufen ist, startet der Counter neu.
 */

import { config } from '../../../core/config';

export interface LockoutState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface LockoutDecision {
  isLocked: boolean;
  unlockAt: Date | null;
}

export function isCurrentlyLocked(state: LockoutState, now: Date = new Date()): LockoutDecision {
  if (state.lockedUntil && state.lockedUntil > now) {
    return { isLocked: true, unlockAt: state.lockedUntil };
  }
  return { isLocked: false, unlockAt: null };
}

export interface RegisterFailedLoginResult {
  nextFailedAttempts: number;
  nextLockedUntil: Date | null;
  justLocked: boolean;
}

export function registerFailedLogin(
  state: LockoutState,
  now: Date = new Date(),
): RegisterFailedLoginResult {
  // Wenn Lock abgelaufen: Counter zurücksetzen, dann neu zählen
  const base = state.lockedUntil && state.lockedUntil <= now ? 0 : state.failedAttempts;
  const nextFailedAttempts = base + 1;
  const max = config.AUTH_MAX_FAILED_ATTEMPTS;
  if (nextFailedAttempts >= max) {
    const ms = config.AUTH_LOCKOUT_MINUTES * 60 * 1000;
    return {
      nextFailedAttempts,
      nextLockedUntil: new Date(now.getTime() + ms),
      justLocked: true,
    };
  }
  return {
    nextFailedAttempts,
    nextLockedUntil: state.lockedUntil && state.lockedUntil > now ? state.lockedUntil : null,
    justLocked: false,
  };
}

export function resetOnSuccess(): { failedAttempts: 0; lockedUntil: null } {
  return { failedAttempts: 0, lockedUntil: null };
}
