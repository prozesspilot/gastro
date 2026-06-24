/**
 * M15 — Geteilter SumUp-OAuth-CSRF-State.
 *
 * Wird von ZWEI Initiatoren genutzt:
 *  - Staff-Flow: GET /m15/oauth/sumup/start (Mitarbeiter-Webapp, oauth.routes.ts)
 *  - Wizard-Flow: POST /wizard/:token/oauth/sumup/start (öffentlicher Onboarding-
 *    Wizard, T067 — m16-wizard/handlers/connect-sumup.handler.ts)
 *
 * Beide schreiben denselben Redis-State (gleicher Prefix/TTL); der gemeinsame
 * Callback (/m15/oauth/sumup/callback) unterscheidet anhand der gesetzten Felder,
 * wohin nach Abschluss redirected wird (Webapp vs. Wizard).
 */
import { randomBytes } from 'node:crypto';

export const STATE_KEY_PREFIX = 'sumup:oauth:state:';
export const STATE_TTL_SECONDS = 300; // 5 Minuten

/** Im Redis-State gespeichertes JSON (CSRF-Schutz + Routing-/Audit-Info). */
export interface OAuthState {
  tenant_id: string;
  /** Gesetzt bei Staff-initiiertem Flow (Mitarbeiter-Webapp) → Audit + Redirect zur Webapp. */
  staff_user_id?: string;
  /** Gesetzt bei Wizard-initiiertem Flow (öffentlicher Wizard, T067) → Redirect zum Wizard. */
  wizard_token?: string;
}

/** 32 Bytes → 43 Base64URL-Zeichen CSRF-State. */
export function generateOAuthState(): string {
  return randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
