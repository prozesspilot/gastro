/**
 * M15 — POS Token-Helper (On-Demand Auto-Refresh)
 *
 * getSumUpAccessToken() ist der zentrale Einstiegspunkt für alle Backend-Operationen,
 * die einen gültigen SumUp-Access-Token benötigen (Daily-Pull, Test-Verbindung).
 *
 * Ablauf:
 *   1. Lade pos_credentials für Tenant + 'sumup_lite'
 *   2. Wenn nicht vorhanden oder inactive → return null
 *   3. Wenn token_expires_at < now + 5 Min → Token-Refresh
 *   4. Bei Refresh-Fehler → markPosInactive + Audit-Log → return null
 *   5. Sonst → return access_token
 *
 * DECISION: Refresh-Schwellwert 5 Minuten (statt Spec-Wert "< 7 Tage").
 * 7 Tage ist für Background-Job-Prüfung gedacht; on-demand refreshen wir
 * sobald der Token in <5 Min abläuft, um Race-Conditions bei parallelen
 * Requests zu minimieren.
 *
 * DECISION (M1 Race-Condition): Redis-Lock via SET NX EX verhindert simultane
 * Refresh-Calls. Zweiter Aufrufer wartet 500ms und liest dann frische Daten.
 * Lock-TTL = 30s (großzügig — SumUp Token-Exchange dauert selten >5s).
 *
 * Spec-Referenz: Modulkonzept/Konzeptentwicklung/modules/M15_Kassensystem_Connector.md §4.5
 */

import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { logAuthEvent } from '../m14-auth/users.repository';
import { getPosCredentials, markPosInactive, updatePosTokens } from './pos.repository';
import { SumUpApiError, refreshAccessToken } from './sumup.service';

/** Refresh wenn Token in weniger als 5 Minuten abläuft. */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/** Redis-Lock-TTL für Token-Refresh (Sekunden). */
const LOCK_TTL_SECONDS = 30;

/**
 * Gibt einen gültigen SumUp Access-Token für den Tenant zurück.
 * Führt on-demand Token-Refresh durch wenn nötig.
 *
 * @param pool   - Postgres Pool
 * @param tenantId - Tenant-UUID
 * @param redis  - Optional: ioredis-Instanz für Refresh-Lock (Race-Condition-Schutz).
 *                 Wenn nicht übergeben, wird ohne Lock refresht (unkritisch für Einzel-Worker).
 *
 * @returns access_token string, oder null wenn:
 *   - Keine pos_credentials vorhanden
 *   - pos_credentials.active = false
 *   - Token-Refresh fehlgeschlagen (wird dann als inactive markiert)
 *   - Lock belegt und Lock-Holder noch nicht fertig refresht
 */
export async function getSumUpAccessToken(
  pool: Pool,
  tenantId: string,
  redis?: InstanceType<typeof Redis>,
): Promise<string | null> {
  // 1. Lade Credentials
  const creds = await getPosCredentials(pool, tenantId, 'sumup_lite');

  // 2. Nicht vorhanden oder deaktiviert
  if (!creds) return null;
  if (!creds.active) return null;

  const now = Date.now();
  const expiresAt = creds.token_expires_at.getTime();
  const needsRefresh = expiresAt - now < REFRESH_THRESHOLD_MS;

  // 3. Token noch gültig → direkt zurückgeben
  if (!needsRefresh) {
    return creds.access_token || null;
  }

  // 4. Token-Refresh — mit optionalem Redis-Lock gegen Race-Conditions
  if (redis) {
    return await refreshWithLock(pool, tenantId, creds, redis);
  }
  return await doRefresh(pool, tenantId, creds);
}

/**
 * Token-Refresh mit Redis-Lock (verhindert simultane Refreshes).
 */
async function refreshWithLock(
  pool: Pool,
  tenantId: string,
  creds: Awaited<ReturnType<typeof getPosCredentials>> & object,
  redis: InstanceType<typeof Redis>,
): Promise<string | null> {
  const lockKey = `m15:refresh-lock:${creds.id}`;
  const lockAcquired = await redis.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');

  if (!lockAcquired) {
    // Anderer Request refresht gerade — kurz warten + erneut lesen
    await new Promise<void>((r) => setTimeout(r, 500));
    const refreshedCreds = await getPosCredentials(pool, tenantId, 'sumup_lite');
    if (
      refreshedCreds?.access_token &&
      new Date(refreshedCreds.token_expires_at).getTime() > Date.now() + REFRESH_THRESHOLD_MS
    ) {
      return refreshedCreds.access_token;
    }
    // Lock-Holder hat noch nicht fertig refresht → für diesen Aufruf null zurückgeben
    return null;
  }

  try {
    // Re-check nach Lock: hat ein anderer Process schon refresht?
    const recheckCreds = await getPosCredentials(pool, tenantId, 'sumup_lite');
    if (
      recheckCreds &&
      new Date(recheckCreds.token_expires_at).getTime() > Date.now() + REFRESH_THRESHOLD_MS
    ) {
      return recheckCreds.access_token || null;
    }
    // Wirklich refreshen
    return await doRefresh(pool, tenantId, creds);
  } finally {
    await redis.del(lockKey).catch(() => {
      // Fehler beim Lock-Delete ignorieren — TTL sorgt für automatische Freigabe
    });
  }
}

/**
 * Führt den eigentlichen Token-Refresh durch.
 */
async function doRefresh(
  pool: Pool,
  tenantId: string,
  creds: { id: string; refresh_token: string },
): Promise<string | null> {
  try {
    const refreshed = await refreshAccessToken(creds.refresh_token);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

    await updatePosTokens(pool, {
      id: creds.id,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenExpiresAt: newExpiresAt,
    });

    return refreshed.access_token;
  } catch (err) {
    // Refresh fehlgeschlagen → bei Auth-Fehlern als inactive markieren
    const isAuthError =
      err instanceof SumUpApiError && (err.statusCode === 401 || err.statusCode === 400);

    // Nur bei Auth-Fehlern (401/400) deaktivieren — bei Netzwerkfehler ggf. retry
    if (isAuthError) {
      await markPosInactive(pool, creds.id, 'refresh_failed');

      // Audit-Log (fire-and-forget, analog zu logAuthEvent-Pattern in m14)
      await logAuthEvent(pool, {
        userId: null, // kein User-Context bei automatischem Refresh
        eventType: 'pos_token_refresh_failed',
        ipAddress: null,
        userAgent: null,
        metadata: {
          tenant_id: tenantId,
          pos_system: 'sumup_lite',
          credentials_id: creds.id,
          error_status: (err as SumUpApiError).statusCode,
        },
      });
    }

    return null;
  }
}
