/**
 * T084 — Live-Validierung eines Lexware-Office-API-Tokens.
 *
 * Lexware Office nutzt KEIN OAuth, sondern einen statischen API-Key (Migration 100,
 * M05-Spec). Damit der Wirt im Onboarding-Wizard (Schritt 3) nicht erst beim ersten
 * Export merkt, dass sein Token falsch ist, prüfen wir ihn sofort gegen die Lexware-
 * API (GET /v1/profile): gültig → Firmenname für die Erfolgsanzeige; abgelehnt → klare
 * Fehlermeldung; nicht erreichbar → „später erneut".
 */

import type Redis from 'ioredis';
import {
  LexofficeApiError,
  LexofficeClient,
} from '../../../core/adapters/booking/lexoffice/lexoffice.client';

export type LexwareValidationResult =
  | { ok: true; companyName: string | null }
  | { ok: false; reason: 'rejected' | 'unreachable'; message: string };

export interface ValidateLexwareTokenOpts {
  token: string;
  /** Tenant-ID → Rate-Limiter-Bucket des Clients. */
  customerId: string;
  redis?: Redis | null;
  /** Test-Hook: Fetch mocken. */
  fetchImpl?: typeof fetch;
  /** Test-Hook: fertigen Client injizieren (umgeht echten HTTP-Aufbau). */
  client?: Pick<LexofficeClient, 'getProfile'>;
}

/**
 * Prüft den Token gegen GET /v1/profile.
 *  - 2xx → { ok: true, companyName }
 *  - 401/403 → { ok:false, reason:'rejected' } (Token ungültig/abgelaufen)
 *  - alles andere (Netz/5xx/Timeout) → { ok:false, reason:'unreachable' }
 */
export async function validateLexwareToken(
  opts: ValidateLexwareTokenOpts,
): Promise<LexwareValidationResult> {
  const client =
    opts.client ??
    new LexofficeClient({
      apiKey: opts.token,
      customerId: opts.customerId,
      redis: opts.redis ?? null,
      fetchImpl: opts.fetchImpl,
    });

  try {
    const profile = await client.getProfile();
    return { ok: true, companyName: profile.companyName ?? null };
  } catch (err) {
    if (err instanceof LexofficeApiError && (err.status === 401 || err.status === 403)) {
      return {
        ok: false,
        reason: 'rejected',
        message:
          'Lexware hat diesen API-Schlüssel abgelehnt. Bitte prüfe ihn (Lexware Office → Einstellungen → Öffentliche API) und versuche es erneut.',
      };
    }
    return {
      ok: false,
      reason: 'unreachable',
      message: 'Lexware ist gerade nicht erreichbar. Bitte versuche es in einem Moment erneut.',
    };
  }
}
