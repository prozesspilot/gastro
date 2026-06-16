/**
 * Unit-Test der M14-Rollen→Permission-Map (T059/A3).
 *
 * Hintergrund-Bug: vor T059 leitete m14UserToAuthUser die Permissions auf die
 * Geister-Welt ab (receipts/tasks-Scopes), wodurch mitarbeiter/support in der UI
 * nichts sahen. Dieser Test fixiert die belege-Welt-Map.
 */

import { describe, it, expect } from 'vitest';
import { m14UserToAuthUser } from './AuthContext';
import { matchPermission } from './permissions';
import type { M14SessionUser } from '../api/auth';

function sessionUser(role: M14SessionUser['role']): M14SessionUser {
  return { id: `u-${role}`, display_name: `User ${role}`, role, login_method: 'discord' };
}

describe('m14UserToAuthUser — Rollen-Permission-Map', () => {
  it('geschaeftsfuehrer bekommt Wildcard (*)', () => {
    const u = m14UserToAuthUser(sessionUser('geschaeftsfuehrer'));
    expect(u.permissions).toEqual(['*']);
    expect(matchPermission(u.permissions, 'belege.read')).toBe(true);
    expect(matchPermission(u.permissions, 'tenants.read')).toBe(true);
    expect(matchPermission(u.permissions, 'irgendwas.beliebig')).toBe(true);
  });

  it('mitarbeiter darf Belege lesen und schreiben + Mandanten lesen', () => {
    const u = m14UserToAuthUser(sessionUser('mitarbeiter'));
    expect(u.permissions).toEqual(['belege.read', 'belege.write', 'tenants.read']);
    expect(matchPermission(u.permissions, 'belege.read')).toBe(true);
    expect(matchPermission(u.permissions, 'belege.write')).toBe(true);
    expect(matchPermission(u.permissions, 'tenants.read')).toBe(true);
  });

  it('support darf Belege und Mandanten nur lesen', () => {
    const u = m14UserToAuthUser(sessionUser('support'));
    expect(u.permissions).toEqual(['belege.read', 'tenants.read']);
    expect(matchPermission(u.permissions, 'belege.read')).toBe(true);
    expect(matchPermission(u.permissions, 'tenants.read')).toBe(true);
    // support darf NICHT schreiben
    expect(matchPermission(u.permissions, 'belege.write')).toBe(false);
  });

  it('alle Nicht-GF-Rollen haben belege.read (Kern-Bugfix)', () => {
    expect(matchPermission(m14UserToAuthUser(sessionUser('mitarbeiter')).permissions, 'belege.read')).toBe(true);
    expect(matchPermission(m14UserToAuthUser(sessionUser('support')).permissions, 'belege.read')).toBe(true);
  });

  it('M14-Session hat keine Email und tenantId null (systemweite Staff-Session)', () => {
    const u = m14UserToAuthUser(sessionUser('mitarbeiter'));
    expect(u.email).toBe('');
    expect(u.tenantId).toBeNull();
    expect(u.role).toBe('mitarbeiter');
  });
});
