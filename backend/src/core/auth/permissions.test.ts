import { describe, expect, it } from 'vitest';
import { PRESETS, matchPermission, presetPermissions, validatePermissionList } from './permissions';

describe('permissions', () => {
  describe('matchPermission', () => {
    it('super_admin Wildcard "*" matcht alles', () => {
      expect(matchPermission(['*'], 'receipts.read')).toBe(true);
      expect(matchPermission(['*'], 'plugins.install')).toBe(true);
      expect(matchPermission(['*'], 'dsgvo.execute')).toBe(true);
    });

    it('Resource-Wildcard "receipts.*" matcht alle receipts.X', () => {
      expect(matchPermission(['receipts.*'], 'receipts.read')).toBe(true);
      expect(matchPermission(['receipts.*'], 'receipts.write')).toBe(true);
      expect(matchPermission(['receipts.*'], 'receipts.delete')).toBe(true);
      expect(matchPermission(['receipts.*'], 'customers.read')).toBe(false);
    });

    it('Exakte Permission matcht nur exakt', () => {
      expect(matchPermission(['receipts.read'], 'receipts.read')).toBe(true);
      expect(matchPermission(['receipts.read'], 'receipts.write')).toBe(false);
    });

    it('leere Grants matchen nichts', () => {
      expect(matchPermission([], 'receipts.read')).toBe(false);
    });

    it('Mehrere Grants — irgendeine matcht reicht', () => {
      expect(matchPermission(['customers.read', 'receipts.*'], 'receipts.delete')).toBe(true);
    });
  });

  describe('validatePermissionList', () => {
    it('akzeptiert gültige Permissions', () => {
      expect(validatePermissionList(['receipts.read', 'customers.*', '*']).ok).toBe(true);
    });
    it('verwirft Müll', () => {
      expect(validatePermissionList(['Receipts.READ']).ok).toBe(false);
      expect(validatePermissionList(['no-dot']).ok).toBe(false);
      expect(validatePermissionList([42 as unknown as string]).ok).toBe(false);
      expect(validatePermissionList('not-array' as unknown).ok).toBe(false);
    });
  });

  describe('PRESETS', () => {
    it('alle Presets existieren', () => {
      for (const name of ['super_admin', 'admin', 'operator', 'viewer']) {
        expect(PRESETS[name]).toBeDefined();
      }
    });

    it('presetPermissions kopiert (kein shared state)', () => {
      const a = presetPermissions('operator');
      const b = presetPermissions('operator');
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it('unbekanntes Preset → null', () => {
      expect(presetPermissions('xxx')).toBeNull();
    });

    it('admin kann users.manage und settings.edit', () => {
      const perms = presetPermissions('admin');
      if (!perms) throw new Error('admin-Preset muss existieren');
      expect(matchPermission(perms, 'users.manage')).toBe(true);
      expect(matchPermission(perms, 'settings.edit')).toBe(true);
    });

    it('operator kann KEINE users.manage', () => {
      const perms = presetPermissions('operator');
      if (!perms) throw new Error('operator-Preset muss existieren');
      expect(matchPermission(perms, 'users.manage')).toBe(false);
      expect(matchPermission(perms, 'receipts.write')).toBe(true);
    });

    it('viewer kann nur lesen', () => {
      const perms = presetPermissions('viewer');
      if (!perms) throw new Error('viewer-Preset muss existieren');
      expect(matchPermission(perms, 'receipts.read')).toBe(true);
      expect(matchPermission(perms, 'receipts.write')).toBe(false);
    });
  });
});
