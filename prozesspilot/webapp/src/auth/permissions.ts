/**
 * M14 — Permission-Matching (Frontend-Helper)
 *
 * Spiegelt das Backend-Verhalten aus backend/src/core/auth/permissions.ts.
 * UI-Hide basierend hierauf ist KOMFORT — die echte Durchsetzung passiert
 * server-side (siehe Spec §9).
 */

export function matchPermission(granted: string[], required: string): boolean {
  if (!required || required === '*') return granted.includes('*');
  for (const g of granted) {
    if (g === '*') return true;
    if (g === required) return true;
    if (g.endsWith('.*')) {
      const prefix = g.slice(0, -1);
      if (required.startsWith(prefix)) return true;
    }
  }
  return false;
}

export const FRONTEND_PRESETS = ['admin', 'operator', 'viewer', 'custom'] as const;
export type FrontendPreset = (typeof FRONTEND_PRESETS)[number];
