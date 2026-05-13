/**
 * M14 — Auto-Refresh-Logik
 *
 * Plant einen Refresh ca. 60s vor Ablauf des Access-Tokens (Spec §6.5).
 * Decodiert das JWT lokal (ohne signature check — nur fürs Timing).
 */

export interface DecodedAccessToken {
  sub: string;
  exp: number; // seconds since epoch
  tenant_id: string | null;
  permissions: string[];
  preset: string | null;
}

export function decodeJwtPayload(token: string): DecodedAccessToken | null {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const obj = JSON.parse(json) as Record<string, unknown>;
    if (typeof obj.sub !== 'string' || typeof obj.exp !== 'number') return null;
    return {
      sub: obj.sub,
      exp: obj.exp,
      tenant_id: typeof obj.tenant_id === 'string' ? obj.tenant_id : null,
      permissions: Array.isArray(obj.permissions) ? (obj.permissions as string[]) : [],
      preset: typeof obj.preset === 'string' ? obj.preset : null,
    };
  } catch {
    return null;
  }
}

const REFRESH_LEAD_SECONDS = 60;

/** Plant einen Refresh-Timer. Liefert eine Cancel-Funktion zurück. */
export function scheduleRefresh(
  accessToken: string,
  onRefresh: () => void | Promise<void>,
): () => void {
  const decoded = decodeJwtPayload(accessToken);
  if (!decoded) return () => undefined;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const secondsUntilRefresh = Math.max(5, decoded.exp - nowSeconds - REFRESH_LEAD_SECONDS);
  const timer = setTimeout(() => {
    void onRefresh();
  }, secondsUntilRefresh * 1000);
  return () => clearTimeout(timer);
}
