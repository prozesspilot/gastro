/**
 * T089/M08 — Integrationstest für deliverReport (DB + Fake-S3 + Fake-Transport).
 *
 * Verifiziert: Report bauen → an Steuerberater zustellen → report_deliveries-Row
 * + Audit (report.delivered), Mail-Versand mit PDF-Anhang, Idempotenz (ein Row
 * pro Report+Empfänger), no_recipient ohne advisor_email.
 *
 * In CI ist die DB Pflicht; lokal ohne DB wird sauber übersprungen.
 */
import { Readable } from 'node:stream';
import type { S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../../core/config';
import type { MailTransport } from '../../../core/mail/mail.types';
import { buildMonthlyReport } from './build-report.service';
import { deliverReport } from './handover-mail.service';

const DB_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://pp:pp@localhost:5432/prozesspilot_test';
const REQUIRE_DB = process.env.CI === 'true' || process.env.CI === '1';

const T = '0c0c0c0c-0089-4089-8089-00000000cccc';
const T_NO_ADVISOR = '0c0c0c0c-0089-4089-8089-00000000dddd';
const STAFF = '0c0c0c0c-0089-4089-8089-000000005a40';

let pool: pg.Pool;
let dbAvailable = false;

// `sendMail` läuft im Dry-Run (ignoriert den injizierten Transport), solange
// SMTP_HOST/SMTP_USER leer sind — in CI ist beides leer. Für den Real-Send-Pfad
// (Transport wird aufgerufen, external_id wird gesetzt) erzwingen wir hier eine
// SMTP-Config und stellen sie nach dem Lauf wieder her. Vitest isoliert pro
// Testdatei → kein Leak in andere Suites.
const ORIG_SMTP_HOST = config.SMTP_HOST;
const ORIG_SMTP_USER = config.SMTP_USER;

const uploaded = new Map<string, Buffer>();
/** Fake-S3: PutObject speichert den Body, GetObject liefert ihn als Stream zurück. */
const fakeS3 = {
  send: async (cmd: { input?: { Key?: string; Body?: Buffer } }) => {
    const key = cmd?.input?.Key;
    if (cmd?.input?.Body && key) {
      uploaded.set(key, cmd.input.Body as Buffer);
      return {};
    }
    if (key) {
      const body = uploaded.get(key) ?? Buffer.from('%PDF-fake');
      return { Body: Readable.from([body]) };
    }
    return {};
  },
} as unknown as S3Client;

/** Fake-Transport: zeichnet die letzte Mail auf, liefert eine messageId. */
const sentMails: Array<{ to: string; subject: string; attachments?: unknown[] }> = [];
const fakeTransport: MailTransport = {
  send: async (msg) => {
    sentMails.push({ to: msg.to, subject: msg.subject, attachments: msg.attachments });
    return { messageId: 'test-msg-1' };
  },
};

let seedN = 0;
async function seedBeleg(tenant: string, gross: number, taxRate: number): Promise<void> {
  seedN += 1;
  const sha = (seedN + 0xb000).toString(16).padStart(64, '0');
  await pool.query(
    `INSERT INTO belege
       (tenant_id, source_channel, file_object_key, file_mime_type, file_size_bytes,
        file_sha256, status, category, supplier_name, document_date, total_gross, payload)
     VALUES ($1, 'manual_upload', $2, 'image/jpeg', 1234, $3, 'categorized', 'wareneinkauf_food',
             'Lieferant', '2026-05-10', $4, $5::jsonb)`,
    [
      tenant,
      `s3://t/${sha}.jpg`,
      sha,
      gross,
      JSON.stringify({ extraction: { fields: { tax_rate: taxRate } } }),
    ],
  );
}

beforeAll(async () => {
  // Real-Send-Pfad erzwingen (sonst Dry-Run, Transport wird nie aufgerufen).
  config.SMTP_HOST = 'smtp.test.local';
  config.SMTP_USER = 'ci-test';

  pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    await pool.end().catch(() => {});
    if (REQUIRE_DB) throw new Error(`[T089] DB nicht erreichbar — in CI Pflicht. ${String(err)}`);
    return;
  }
  for (const t of [T, T_NO_ADVISOR]) {
    await pool.query('DELETE FROM report_deliveries WHERE tenant_id = $1', [t]);
    await pool.query('DELETE FROM reports WHERE tenant_id = $1', [t]);
    await pool.query('DELETE FROM belege WHERE tenant_id = $1', [t]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [t]);
  }
  await pool.query(
    `INSERT INTO tenants (id, slug, display_name, legal_name, advisor_email)
       VALUES ($1, 't089-deliver', 'T089 Deliver', 'Müller-Bistro GmbH', 'steuerberater@example.com')`,
    [T],
  );
  await pool.query(
    `INSERT INTO tenants (id, slug, display_name, legal_name)
       VALUES ($1, 't089-no-advisor', 'T089 No Advisor', 'Ohne-Berater GmbH')`,
    [T_NO_ADVISOR],
  );
  await seedBeleg(T, 119.0, 19);
  await seedBeleg(T, 107.0, 7);
});

afterAll(async () => {
  if (dbAvailable) {
    for (const t of [T, T_NO_ADVISOR]) {
      await pool.query('DELETE FROM report_deliveries WHERE tenant_id = $1', [t]).catch(() => {});
      await pool.query('DELETE FROM reports WHERE tenant_id = $1', [t]).catch(() => {});
      await pool.query('DELETE FROM belege WHERE tenant_id = $1', [t]).catch(() => {});
      await pool.query('DELETE FROM tenants WHERE id = $1', [t]).catch(() => {});
    }
  }
  await pool?.end().catch(() => {});
  config.SMTP_HOST = ORIG_SMTP_HOST;
  config.SMTP_USER = ORIG_SMTP_USER;
});

const ACTOR = { type: 'staff', id: STAFF } as const;

describe('T089 — deliverReport (Integration)', () => {
  it('stellt den Report zu: Mail mit PDF-Anhang, Delivery-Row sent, Audit', async () => {
    if (!dbAvailable) return;
    const report = await buildMonthlyReport({ db: pool, s3: fakeS3 }, T, 2026, 5, { actor: ACTOR });

    const res = await deliverReport(
      { db: pool, s3: fakeS3, transport: fakeTransport },
      T,
      report.reportId,
      { actor: ACTOR },
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dryRun).toBe(false);

    // Mail wurde an den Steuerberater mit PDF-Anhang gesendet.
    const mail = sentMails.at(-1);
    expect(mail?.to).toBe('steuerberater@example.com');
    expect(mail?.attachments).toHaveLength(1);

    // Delivery-Row als 'sent'.
    const del = await pool.query('SELECT * FROM report_deliveries WHERE id = $1', [res.deliveryId]);
    expect(del.rowCount).toBe(1);
    expect(del.rows[0].status).toBe('sent');
    expect(del.rows[0].external_id).toBe('test-msg-1');
    // recipient_hash ist PII-frei (64 Hex), nicht die Klartext-Mail.
    expect(del.rows[0].recipient_hash).toMatch(/^[0-9a-f]{64}$/);

    // Audit report.delivered.
    const audit = await pool.query(
      "SELECT * FROM audit_log WHERE tenant_id = $1 AND event_type = 'report.delivered' AND entity_id = $2",
      [T, report.reportId],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('ist idempotent: zweiter Versand aktualisiert denselben Delivery-Row', async () => {
    if (!dbAvailable) return;
    const report = await buildMonthlyReport({ db: pool, s3: fakeS3 }, T, 2026, 5, { actor: ACTOR });

    const first = await deliverReport(
      { db: pool, s3: fakeS3, transport: fakeTransport },
      T,
      report.reportId,
      { actor: ACTOR },
    );
    const second = await deliverReport(
      { db: pool, s3: fakeS3, transport: fakeTransport },
      T,
      report.reportId,
      { actor: ACTOR },
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.deliveryId).toBe(first.deliveryId);

    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM report_deliveries WHERE report_id = $1',
      [report.reportId],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('skipIfAlreadySent: zweiter Versand sendet NICHT erneut (Re-Run-Schutz, T090)', async () => {
    if (!dbAvailable) return;
    const report = await buildMonthlyReport({ db: pool, s3: fakeS3 }, T, 2026, 5, { actor: ACTOR });
    // Clean Slate für genau diesen Report, damit der erste Versand wirklich sendet.
    await pool.query('DELETE FROM report_deliveries WHERE report_id = $1', [report.reportId]);

    const before = sentMails.length;
    const first = await deliverReport(
      { db: pool, s3: fakeS3, transport: fakeTransport },
      T,
      report.reportId,
      { actor: ACTOR, skipIfAlreadySent: true },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.alreadySent ?? false).toBe(false);
    expect(sentMails.length).toBe(before + 1); // hat gesendet

    const second = await deliverReport(
      { db: pool, s3: fakeS3, transport: fakeTransport },
      T,
      report.reportId,
      { actor: ACTOR, skipIfAlreadySent: true },
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadySent).toBe(true);
    expect(second.deliveryId).toBe(first.deliveryId);
    expect(sentMails.length).toBe(before + 1); // KEIN zweiter Versand
  });

  it('liefert no_recipient ohne hinterlegte Steuerberater-Mail', async () => {
    if (!dbAvailable) return;
    await seedBeleg(T_NO_ADVISOR, 119.0, 19);
    const report = await buildMonthlyReport({ db: pool, s3: fakeS3 }, T_NO_ADVISOR, 2026, 5, {
      actor: ACTOR,
    });

    const res = await deliverReport(
      { db: pool, s3: fakeS3, transport: fakeTransport },
      T_NO_ADVISOR,
      report.reportId,
      { actor: ACTOR },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('no_recipient');

    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM report_deliveries WHERE tenant_id = $1',
      [T_NO_ADVISOR],
    );
    expect(count.rows[0].n).toBe(0);
  });
});
