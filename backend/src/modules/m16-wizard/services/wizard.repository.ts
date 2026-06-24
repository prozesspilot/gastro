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
import type { DbOnboardingSession, Step1Stammdaten } from '../wizard.types';

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

export interface SaveStammdatenInput {
  tenantId: string;
  token: string;
  /** Server-validierte Stammdaten aus Wizard Schritt 1 (step1StammdatenSchema). */
  stammdaten: Step1Stammdaten;
}

/**
 * Wizard Schritt 1 (Stammdaten): merge step_data['1'] + current_step → 2 UND
 * promotet die Stammdaten in echte tenants-Spalten + aktiviert den Mandanten
 * (onboarding_status='activated') — alles in EINER Transaktion.
 *
 * ⚠️ Bewusste Spec-Abweichung (T066): Die dokumentierte Spec (Onboarding_Wizard.md /
 * Mitarbeiter_Webapp.md) aktiviert erst nach MANUELLER Mitarbeiter-Freischaltung. Im
 * Build-out-Self-Service (CLAUDE.md §3.6 — Testkunde spielt alles selbst durch)
 * aktivieren wir automatisch, sobald der Wirt seine Stammdaten abschickt.
 *
 * onboarding_status='activated' wird unkonditional gesetzt → idempotent, weil
 * 'activated' der terminale FSM-Zustand ist. completeOnboardingSession respektiert
 * das und überschreibt 'activated' NICHT mehr mit 'wizard_done'.
 */
export async function saveStammdatenAndActivate(
  pool: Pool,
  input: SaveStammdatenInput,
): Promise<DbOnboardingSession | null> {
  const s = input.stammdaten;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, input.tenantId);

    // (a) step_data['1'] mergen + current_step → 2 (identisch zu saveOnboardingStep, step=1).
    const res = await client.query<DbOnboardingSession>(
      `UPDATE onboarding_sessions
          SET step_data = step_data || jsonb_build_object('1', $2::jsonb),
              current_step = GREATEST(current_step, 2),
              last_activity_at = now()
        WHERE token = $1
        RETURNING *`,
      [input.token, JSON.stringify(s)],
    );
    const session = res.rows[0];
    if (!session) {
      await client.query('ROLLBACK').catch(() => undefined);
      return null;
    }

    // (b)+(c) Stammdaten → tenants-Spalten + Aktivierung (Migration 123).
    // ust_id ('' oder undefined) → NULL; steuerberater_kosten_monat optional → NULL.
    await client.query(
      `UPDATE tenants
          SET legal_name             = $2,
              contact_email          = $3,
              contact_phone          = $4,
              owner_name             = $5,
              legal_form             = $6,
              address_street         = $7,
              address_postal_code    = $8,
              address_city           = $9,
              vat_id                 = $10,
              tax_number             = $11,
              industry               = $12,
              employee_count         = $13,
              monthly_receipt_volume = $14,
              advisor_cost_monthly   = $15,
              onboarding_status      = 'activated'
        WHERE id = $1`,
      [
        input.tenantId,
        s.firmenname,
        s.email,
        s.telefon,
        s.inhaber,
        s.rechtsform,
        s.strasse,
        s.plz,
        s.stadt,
        s.ust_id && s.ust_id.length > 0 ? s.ust_id : null,
        s.steuernummer,
        s.branche,
        s.mitarbeiter_anzahl,
        s.belegvolumen_monat,
        s.steuerberater_kosten_monat ?? null,
      ],
    );

    // (d) Audit (GoBD): Mandant aktiviert. Bewusst keine PII im Payload.
    await logAuditEvent(client, {
      tenantId: input.tenantId,
      entityType: 'tenant',
      entityId: input.tenantId,
      eventType: 'tenant.activated',
      actor: { type: 'customer', id: null },
      payloadAfter: { onboarding_status: 'activated', via: 'wizard_stammdaten' },
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
      // onboarding_status regressions-frei: ein bereits per Stammdaten (Schritt 1)
      // aktivierter Mandant (T066) bleibt 'activated' — complete darf ihn NICHT auf
      // 'wizard_done' zurückstufen. Übrige Promotion (advisor_system etc.) bleibt.
      `UPDATE tenants
          SET onboarding_status = CASE WHEN onboarding_status = 'activated'
                                       THEN 'activated' ELSE 'wizard_done' END,
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
