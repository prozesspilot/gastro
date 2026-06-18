/**
 * T016/Phase B — Onboarding-Wizard: DB-Layer.
 *
 * RLS-Muster (wie beleg.repository.ts): jede schreibende Operation läuft in
 * einem expliziten BEGIN/COMMIT mit `set_config('app.current_tenant', …, true)`.
 * Der öffentliche Token-Lookup ist tenant-übergreifend und läuft über die
 * SECURITY-DEFINER-Funktion get_onboarding_session_by_token (Migration 122) —
 * danach ist der tenant_id bekannt und schreibende Ops setzen den Context normal.
 */
import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { logAuditEvent } from '../../../core/audit/audit-log';
import type { DbOnboardingSession } from '../wizard.types';

/** 32 Zeichen Base64URL = 192 Bit Entropie (Spec §6.1). */
export function generateWizardToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Tenant-Context für RLS setzen (T041: Key MUSS app.current_tenant sein). */
async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
}

export interface TenantContact {
  display_name: string;
  legal_name: string | null;
  contact_email: string | null;
}

/** Liest Kontakt-Felder des (eigenen) Tenants — für die Einladungs-Mail. */
export async function getTenantContact(
  pool: Pool,
  tenantId: string,
): Promise<TenantContact | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId);
    const res = await client.query<TenantContact>(
      'SELECT display_name, legal_name, contact_email FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenantId],
    );
    await client.query('COMMIT');
    return res.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface CreateSessionInput {
  tenantId: string;
  createdByUserId: string;
  ttlDays: number;
}

/** Legt eine neue Wizard-Session an + setzt tenants.onboarding_status. */
export async function createOnboardingSession(
  pool: Pool,
  input: CreateSessionInput,
): Promise<DbOnboardingSession> {
  const token = generateWizardToken();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);

    const res = await client.query<DbOnboardingSession>(
      `INSERT INTO onboarding_sessions (tenant_id, token, expires_at)
       VALUES ($1, $2, now() + ($3::int * interval '1 day'))
       RETURNING *`,
      [input.tenantId, token, input.ttlDays],
    );
    const session = res.rows[0];

    await client.query(
      `UPDATE tenants SET onboarding_status = 'wizard_started'
       WHERE id = $1 AND onboarding_status = 'pending'`,
      [input.tenantId],
    );

    await logAuditEvent(client, {
      tenantId: input.tenantId,
      entityType: 'onboarding_session',
      entityId: session.id,
      eventType: 'onboarding_session.created',
      actor: { type: 'staff', id: input.createdByUserId },
      payloadAfter: { expires_at: session.expires_at },
    });

    await client.query('COMMIT');
    return session;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Cross-Tenant-Lookup über den Magic-Link-Token (SECURITY DEFINER). */
export async function getOnboardingSessionByToken(
  pool: Pool,
  token: string,
): Promise<DbOnboardingSession | null> {
  const res = await pool.query<DbOnboardingSession>(
    'SELECT * FROM get_onboarding_session_by_token($1)',
    [token],
  );
  return res.rows[0] ?? null;
}

export interface SaveStepInput {
  tenantId: string;
  token: string;
  step: number;
  data: Record<string, unknown>;
}

/** Speichert die Daten eines Schritts (merge) + rückt current_step vor. */
export async function saveOnboardingStep(
  pool: Pool,
  input: SaveStepInput,
): Promise<DbOnboardingSession | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);
    const res = await client.query<DbOnboardingSession>(
      `UPDATE onboarding_sessions
          SET step_data = step_data || jsonb_build_object($2::text, $3::jsonb),
              current_step = GREATEST(current_step, LEAST($4::int + 1, 7)),
              last_activity_at = now()
        WHERE token = $1
        RETURNING *`,
      // $2 = Step als Text-Key, $4 = Step als Int — getrennte Params vermeiden
      // doppelte Cast-Inferenz auf denselben Parameter.
      [input.token, String(input.step), JSON.stringify(input.data), input.step],
    );
    await client.query('COMMIT');
    return res.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface CompleteInput {
  tenantId: string;
  token: string;
  /** Aus step_data promotete Tenant-Felder (null = unverändert lassen). */
  promote: {
    advisorSystem: string | null;
    inputChannels: string[] | null;
    archiveProvider: string | null;
    posSystem: string | null;
  };
}

/** Schließt die Session ab + promotet step_data → tenants-Spalten. */
export async function completeOnboardingSession(
  pool: Pool,
  input: CompleteInput,
): Promise<DbOnboardingSession | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);

    const res = await client.query<DbOnboardingSession>(
      `UPDATE onboarding_sessions
          SET status = 'completed', completed_at = now(), last_activity_at = now()
        WHERE token = $1
        RETURNING *`,
      [input.token],
    );
    const session = res.rows[0];
    if (!session) {
      await client.query('ROLLBACK').catch(() => undefined);
      return null;
    }

    await client.query(
      `UPDATE tenants
          SET onboarding_status = 'wizard_done',
              advisor_system   = COALESCE($2::varchar, advisor_system),
              input_channels   = COALESCE($3::varchar[], input_channels),
              archive_provider = COALESCE($4::varchar, archive_provider),
              pos_system       = COALESCE($5::varchar, pos_system)
        WHERE id = $1`,
      [
        input.tenantId,
        input.promote.advisorSystem,
        input.promote.inputChannels,
        input.promote.archiveProvider,
        input.promote.posSystem,
      ],
    );

    await logAuditEvent(client, {
      tenantId: input.tenantId,
      entityType: 'onboarding_session',
      entityId: session.id,
      eventType: 'onboarding_session.completed',
      actor: { type: 'customer', id: null },
      payloadAfter: { advisor_system: input.promote.advisorSystem },
    });

    await client.query('COMMIT');
    return session;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Premium-Setup-Übergabe: Session-Status + tenants.setup_premium. */
export async function requestPremiumHandoff(
  pool: Pool,
  input: { tenantId: string; token: string },
): Promise<DbOnboardingSession | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);

    const res = await client.query<DbOnboardingSession>(
      `UPDATE onboarding_sessions
          SET status = 'premium_handoff', premium_setup_requested = true, last_activity_at = now()
        WHERE token = $1
        RETURNING *`,
      [input.token],
    );
    const session = res.rows[0];
    if (!session) {
      await client.query('ROLLBACK').catch(() => undefined);
      return null;
    }

    await client.query('UPDATE tenants SET setup_premium = true WHERE id = $1', [input.tenantId]);

    await logAuditEvent(client, {
      tenantId: input.tenantId,
      entityType: 'onboarding_session',
      entityId: session.id,
      eventType: 'onboarding_session.premium_requested',
      actor: { type: 'customer', id: null },
    });

    await client.query('COMMIT');
    return session;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
