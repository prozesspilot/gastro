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
 * Spec-Referenz: Modulkonzept/Konzeptentwicklung/modules/M15_Kassensystem_Connector.md §4.5
 */

import type { Pool } from 'pg';
import { logAuthEvent } from '../m14-auth/users.repository';
import { getPosCredentials, markPosInactive, updatePosTokens } from './pos.repository';
import { SumUpApiError, refreshAccessToken } from './sumup.service';

/** Refresh wenn Token in weniger als 5 Minuten abläuft. */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Gibt einen gültigen SumUp Access-Token für den Tenant zurück.
 * Führt on-demand Token-Refresh durch wenn nötig.
 *
 * @returns access_token string, oder null wenn:
 *   - Keine pos_credentials vorhanden
 *   - pos_credentials.active = false
 *   - Token-Refresh fehlgeschlagen (wird dann als inactive markiert)
 */
export async function getSumUpAccessToken(pool: Pool, tenantId: string): Promise<string | null> {
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

  // 4. Token-Refresh
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
    // 5. Refresh fehlgeschlagen → als inactive markieren
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
          error_status: err.statusCode,
        },
      });
    }

    return null;
  }
}
