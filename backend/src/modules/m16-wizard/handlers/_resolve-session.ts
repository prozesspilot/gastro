/**
 * T016 — Gemeinsamer Token-Lookup + Gültigkeits-Check für die öffentlichen
 * Wizard-Handler. Vermeidet 404/410-Duplikation über die vier Endpoints.
 */
import type { Pool } from 'pg';
import { getOnboardingSessionByToken } from '../services/wizard.repository';
import type { DbOnboardingSession } from '../wizard.types';

export type ResolvedSession =
  | { ok: true; session: DbOnboardingSession }
  | { ok: false; status: number; body: { error: string; message: string } };

export async function resolveSession(pool: Pool, token: string): Promise<ResolvedSession> {
  const session = await getOnboardingSessionByToken(pool, token);
  if (!session) {
    return {
      ok: false,
      status: 404,
      body: { error: 'not_found', message: 'Dieser Setup-Link ist ungültig.' },
    };
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      status: 410,
      body: {
        error: 'expired',
        message: 'Dieser Setup-Link ist abgelaufen. Bitte fordere einen neuen an.',
      },
    };
  }
  return { ok: true, session };
}
