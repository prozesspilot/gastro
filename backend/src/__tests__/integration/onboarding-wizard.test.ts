/**
 * T016 — Integrationstest des Onboarding-Wizards gegen echtes Postgres.
 *
 * Zwei Beweis-Ebenen (Lauf-Strategie wie tenants-list-rls.test.ts):
 *   A) FUNKTIONAL (Pool = pp): Repository-Lifecycle create → get → step → complete
 *      → premium inkl. Promotion in die tenants-Spalten + onboarding_status-FSM.
 *   B) SICHERHEIT (SET ROLE gastro_app, NOBYPASSRLS): der Magic-Link-Lookup
 *      get_onboarding_session_by_token() findet die Session cross-tenant (SECURITY
 *      DEFINER), während ein DIREKTES SELECT ohne Tenant-Context 0 Zeilen liefert
 *      (RLS greift) — und der Bypass nicht aus der Funktion leakt.
 *
 * In CI ist die DB Pflicht; lokal ohne DB wird sauber übersprungen.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  completeOnboardingSession,
  createOnboardingSession,
  getOnboardingSessionByToken,
  requestPremiumHandoff,
  saveOnboardingStep,
  saveStammdatenAndActivate,
} from '../../modules/m16-wizard/services/wizard.repository';
import type { Step1Stammdaten } from '../../modules/m16-wizard/wizard.types';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T_W = '0c0c0c0c-0016-4016-8016-0000000000c1'; // Wizard-Test-Tenant
const STAFF = '0c0c0c0c-0016-4016-8016-000000005a40'; // Test-Staff (Audit-Actor)

let pool: pg.Pool;
let dbAvailable = false;

async function asGastroApp<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE gastro_app');
    const who = await client.query<{ current_user: string }>('SELECT current_user');
    if (who.rows[0]?.current_user !== 'gastro_app') {
      throw new Error(
        `[T016] SET ROLE gastro_app griff nicht (current_user=${who.rows[0]?.current_user}).`,
      );
    }
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    await pool.end().catch(() => {});
    if (REQUIRE_DB) {
      throw new Error(
        `[T016] DB unter DATABASE_URL nicht erreichbar — in CI Pflicht. ${String(err)}`,
      );
    }
    return;
  }

  await pool.query(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_app') THEN
         CREATE ROLE gastro_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
       END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_owner') THEN
         CREATE ROLE gastro_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
       END IF;
     END $$;`,
  );
  // Tabellen-Rechte + Funktions-Owner wie in Production (SECURITY DEFINER als
  // gastro_owner, non-superuser → echter Bypass-Pfad über die Owner-ROLLE).
  await pool.query('GRANT SELECT, UPDATE ON onboarding_sessions TO gastro_app');
  await pool.query('GRANT SELECT ON onboarding_sessions TO gastro_owner');
  await pool.query('ALTER FUNCTION get_onboarding_session_by_token(text) OWNER TO gastro_owner');

  // Seed Tenant (als Superuser pp, RLS-Bypass).
  await pool.query('DELETE FROM onboarding_sessions WHERE tenant_id = $1', [T_W]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [T_W]);
  await pool.query(
    'INSERT INTO tenants (id, slug, display_name, contact_email) VALUES ($1, $2, $3, $4)',
    [T_W, 't016-wizard', 'T016 Wizard Wirt', 'wirt-t016@example.com'],
  );
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T_W]).catch(() => {});
    await pool.query('DELETE FROM onboarding_sessions WHERE tenant_id = $1', [T_W]).catch(() => {});
    await pool.query('DELETE FROM tenants WHERE id = $1', [T_W]).catch(() => {});
  }
  await pool?.end().catch(() => {});
});

describe('T016 — Wizard-Repository-Lifecycle (funktional)', () => {
  it('create → get → step 1 → complete: promotet step_data in tenants + FSM', async () => {
    if (!dbAvailable) return;

    // create
    const session = await createOnboardingSession(pool, {
      tenantId: T_W,
      createdByUserId: STAFF,
      ttlDays: 30,
    });
    expect(session.token).toHaveLength(32);
    expect(session.status).toBe('started');
    expect(session.current_step).toBe(1);
    expect(new Date(session.expires_at).getTime()).toBeGreaterThan(Date.now());

    // tenants.onboarding_status → wizard_started
    const after1 = await pool.query<{ onboarding_status: string }>(
      'SELECT onboarding_status FROM tenants WHERE id = $1',
      [T_W],
    );
    expect(after1.rows[0].onboarding_status).toBe('wizard_started');

    // get by token
    const fetched = await getOnboardingSessionByToken(pool, session.token);
    expect(fetched?.id).toBe(session.id);

    // save step 1 → current_step rückt auf 2, step_data['1'] gesetzt
    const stepped = await saveOnboardingStep(pool, {
      tenantId: T_W,
      token: session.token,
      step: 1,
      data: { firmenname: 'T016 Wirt', plz: '29614' },
    });
    expect(stepped?.current_step).toBe(2);
    expect((stepped?.step_data as Record<string, unknown>)['1']).toMatchObject({ plz: '29614' });

    // save step 2 (advisor_system) — generischer Merge
    await saveOnboardingStep(pool, {
      tenantId: T_W,
      token: session.token,
      step: 2,
      data: { advisor_system: 'lexware_office' },
    });

    // complete → promotet advisor_system, FSM → completed / wizard_done
    const completed = await completeOnboardingSession(pool, {
      tenantId: T_W,
      token: session.token,
      promote: {
        advisorSystem: 'lexware_office',
        inputChannels: ['email'],
        archiveProvider: null,
        posSystem: null,
      },
    });
    expect(completed?.status).toBe('completed');
    expect(completed?.completed_at).not.toBeNull();

    const tenant = await pool.query<{
      onboarding_status: string;
      advisor_system: string | null;
      input_channels: string[] | null;
    }>('SELECT onboarding_status, advisor_system, input_channels FROM tenants WHERE id = $1', [
      T_W,
    ]);
    expect(tenant.rows[0].onboarding_status).toBe('wizard_done');
    expect(tenant.rows[0].advisor_system).toBe('lexware_office');
    expect(tenant.rows[0].input_channels).toEqual(['email']);
  });

  it('premium-Handoff setzt Session-Status + tenants.setup_premium', async () => {
    if (!dbAvailable) return;
    const session = await createOnboardingSession(pool, {
      tenantId: T_W,
      createdByUserId: STAFF,
      ttlDays: 30,
    });
    const updated = await requestPremiumHandoff(pool, { tenantId: T_W, token: session.token });
    expect(updated?.status).toBe('premium_handoff');
    expect(updated?.premium_setup_requested).toBe(true);

    const tenant = await pool.query<{ setup_premium: boolean }>(
      'SELECT setup_premium FROM tenants WHERE id = $1',
      [T_W],
    );
    expect(tenant.rows[0].setup_premium).toBe(true);
  });

  it('unbekannter Token → null', async () => {
    if (!dbAvailable) return;
    const none = await getOnboardingSessionByToken(pool, 'definitiv-kein-gueltiger-token');
    expect(none).toBeNull();
  });

  it('T066: saveStammdatenAndActivate promotet Stammdaten + aktiviert; complete regressiert NICHT', async () => {
    if (!dbAvailable) return;

    const session = await createOnboardingSession(pool, {
      tenantId: T_W,
      createdByUserId: STAFF,
      ttlDays: 30,
    });

    const stammdaten: Step1Stammdaten = {
      firmenname: 'Bella Italia GmbH',
      rechtsform: 'gmbh',
      inhaber: 'Mario Rossi',
      strasse: 'Hauptstr. 1',
      plz: '29614',
      stadt: 'Soltau',
      ust_id: 'DE123456789',
      steuernummer: '11/123/45678',
      telefon: '0151 1234567',
      email: 'mario@bella.de',
      branche: 'restaurant',
      mitarbeiter_anzahl: 5,
      belegvolumen_monat: 120,
      steuerberater_kosten_monat: 250,
    };

    const updated = await saveStammdatenAndActivate(pool, {
      tenantId: T_W,
      token: session.token,
      stammdaten,
    });
    expect(updated?.current_step).toBe(2);
    expect((updated?.step_data as Record<string, unknown>)['1']).toMatchObject({ plz: '29614' });

    // Stammdaten → tenants-Spalten + onboarding_status='activated'
    const t1 = await pool.query<Record<string, unknown>>(
      `SELECT onboarding_status, legal_name, contact_email, contact_phone, owner_name,
              legal_form, address_street, address_postal_code, address_city, vat_id,
              tax_number, industry, employee_count, monthly_receipt_volume, advisor_cost_monthly
         FROM tenants WHERE id = $1`,
      [T_W],
    );
    const row = t1.rows[0];
    expect(row.onboarding_status).toBe('activated');
    expect(row.legal_name).toBe('Bella Italia GmbH');
    expect(row.contact_email).toBe('mario@bella.de');
    expect(row.contact_phone).toBe('0151 1234567');
    expect(row.owner_name).toBe('Mario Rossi');
    expect(row.legal_form).toBe('gmbh');
    expect(row.address_street).toBe('Hauptstr. 1');
    expect(row.address_postal_code).toBe('29614');
    expect(row.address_city).toBe('Soltau');
    expect(row.vat_id).toBe('DE123456789');
    expect(row.tax_number).toBe('11/123/45678');
    expect(row.industry).toBe('restaurant');
    expect(row.employee_count).toBe(5);
    expect(row.monthly_receipt_volume).toBe(120);
    expect(Number(row.advisor_cost_monthly)).toBe(250);

    // Audit-Event 'tenant.activated' geschrieben (GoBD)
    const audit = await pool.query(
      `SELECT 1 FROM audit_log WHERE tenant_id = $1 AND event_type = 'tenant.activated'`,
      [T_W],
    );
    expect(audit.rowCount ?? 0).toBeGreaterThanOrEqual(1);

    // Generischer Step 2 (saveOnboardingStep) fasst tenants gar nicht an → Aktiv-Status bleibt.
    await saveOnboardingStep(pool, {
      tenantId: T_W,
      token: session.token,
      step: 2,
      data: { advisor_system: 'lexware_office' },
    });
    const tStep2 = await pool.query<{ onboarding_status: string }>(
      'SELECT onboarding_status FROM tenants WHERE id = $1',
      [T_W],
    );
    expect(tStep2.rows[0].onboarding_status).toBe('activated');

    // complete darf 'activated' NICHT auf 'wizard_done' zurückstufen — Promotion läuft trotzdem.
    await completeOnboardingSession(pool, {
      tenantId: T_W,
      token: session.token,
      promote: {
        advisorSystem: 'lexware_office',
        inputChannels: null,
        archiveProvider: null,
        posSystem: null,
      },
    });
    const t2 = await pool.query<{ onboarding_status: string; advisor_system: string | null }>(
      'SELECT onboarding_status, advisor_system FROM tenants WHERE id = $1',
      [T_W],
    );
    expect(t2.rows[0].onboarding_status).toBe('activated');
    expect(t2.rows[0].advisor_system).toBe('lexware_office');
  });
});

describe('T016 — RLS + SECURITY DEFINER unter gastro_app (NOBYPASSRLS)', () => {
  it('get_onboarding_session_by_token() findet die Session cross-tenant (kein Tenant-Context)', async () => {
    if (!dbAvailable) return;
    const session = await createOnboardingSession(pool, {
      tenantId: T_W,
      createdByUserId: STAFF,
      ttlDays: 30,
    });
    const found = await asGastroApp(async (c) => {
      const res = await c.query<{ id: string; tenant_id: string }>(
        'SELECT id, tenant_id FROM get_onboarding_session_by_token($1)',
        [session.token],
      );
      return res.rows[0];
    });
    expect(found?.id).toBe(session.id);
    expect(found?.tenant_id).toBe(T_W);
  });

  it('DIREKTES SELECT auf onboarding_sessions unter gastro_app (ohne Context) → 0 Zeilen', async () => {
    if (!dbAvailable) return;
    const session = await createOnboardingSession(pool, {
      tenantId: T_W,
      createdByUserId: STAFF,
      ttlDays: 30,
    });
    const count = await asGastroApp(async (c) => {
      const res = await c.query('SELECT id FROM onboarding_sessions WHERE token = $1', [
        session.token,
      ]);
      return res.rowCount;
    });
    expect(count).toBe(0);
  });

  it('Bypass leakt nicht: Funktion + danach direktes SELECT in DERSELBEN Transaktion → 0 Zeilen', async () => {
    if (!dbAvailable) return;
    const session = await createOnboardingSession(pool, {
      tenantId: T_W,
      createdByUserId: STAFF,
      ttlDays: 30,
    });
    const count = await asGastroApp(async (c) => {
      await c.query('SELECT id FROM get_onboarding_session_by_token($1)', [session.token]);
      const res = await c.query('SELECT id FROM onboarding_sessions WHERE token = $1', [
        session.token,
      ]);
      return res.rowCount;
    });
    expect(count).toBe(0);
  });
});
