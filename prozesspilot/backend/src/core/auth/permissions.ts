/**
 * M14 — Permission-Matching (Wildcard-Expand)
 *
 * Spec: Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md §3
 * Format: "resource.action[.scope]"
 *   - "*"          → matcht alle Permissions (super_admin)
 *   - "receipts.*" → matcht receipts.read, receipts.write, receipts.delete, ...
 *   - exakt        → "receipts.read" matcht "receipts.read"
 */

export const PRESETS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: [
    'receipts.*',
    'customers.*',
    'users.manage',
    'users.read',
    'settings.edit',
    'settings.read',
    'plugins.*',
    'reports.*',
    'dsgvo.execute',
    'dsgvo.read',
    'audit.read',
  ],
  operator: ['receipts.read', 'receipts.write', 'customers.read', 'reports.read'],
  viewer: ['receipts.read', 'customers.read', 'reports.read', 'audit.read'],
};

/**
 * Prüft ob die granted-Liste die required-Permission erfüllt.
 * Required muss eine konkrete Permission sein (kein Wildcard).
 */
export function matchPermission(granted: string[], required: string): boolean {
  if (!required || required === '*') {
    // "*" als required wäre Aufruferfehler — wir behandeln es konservativ:
    return granted.includes('*');
  }
  for (const g of granted) {
    if (g === '*') return true;
    if (g === required) return true;
    if (g.endsWith('.*')) {
      const prefix = g.slice(0, -1); // "receipts."
      if (required.startsWith(prefix)) return true;
    }
  }
  return false;
}

/**
 * Validiert das Permissions-Array bei User-CRUD. Erlaubt sind:
 *  - "*"  (nur für super_admin — wird beim Handler durchgesetzt)
 *  - "<resource>.*"
 *  - "<resource>.<action>"
 */
const PERMISSION_REGEX = /^\*$|^[a-z_]+\.(\*|[a-z_]+)$/;

export function validatePermissionList(perms: unknown): { ok: boolean; reason?: string } {
  if (!Array.isArray(perms)) return { ok: false, reason: 'permissions muss ein Array sein' };
  for (const p of perms) {
    if (typeof p !== 'string' || !PERMISSION_REGEX.test(p)) {
      return { ok: false, reason: `Ungültige Permission: ${String(p)}` };
    }
  }
  return { ok: true };
}

export function presetPermissions(preset: string): string[] | null {
  const p = PRESETS[preset];
  return p ? [...p] : null;
}
