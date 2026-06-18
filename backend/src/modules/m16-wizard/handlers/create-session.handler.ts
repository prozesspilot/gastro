/**
 * T016 — POST /api/v1/wizard/sessions  (Staff)
 *
 * Ein Mitarbeiter (gf/mitarbeiter) legt für den aktuell gewählten Tenant
 * (x-pp-tenant-id) eine Onboarding-Session an → Magic-Link-Mail via A1.
 * Auth: m14StaffAuthHook + m14TenantContextHook (von wizard.routes.ts).
 * Rolle: 'support' darf kein Setup auslösen → 403.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../../../core/config';
import { sendTemplate } from '../../../core/mail/mail.service';
import { createOnboardingSession, getTenantContact } from '../services/wizard.repository';
import { wizardInviteTemplate } from '../templates/wizard-invite.template';

/** Gültigkeit des Setup-Links (Spec §6.1). */
const WIZARD_TTL_DAYS = 30;

const bodySchema = z.object({ email: z.string().trim().email().optional() }).strict().partial();

export async function createSessionHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
  }
  if (staff.role === 'support') {
    return reply
      .code(403)
      .send({ error: 'forbidden', message: 'Support-Rolle darf kein Onboarding starten.' });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }

  const tenant = await getTenantContact(req.server.db, tenantId);
  if (!tenant) {
    return reply.code(404).send({ error: 'tenant_not_found', message: 'Mandant nicht gefunden.' });
  }

  const recipient = parsed.data.email ?? tenant.contact_email;
  if (!recipient) {
    return reply.code(422).send({
      error: 'missing_recipient',
      message: 'Kein Empfänger: weder `email` im Body noch eine Kontakt-E-Mail am Mandanten.',
    });
  }

  const session = await createOnboardingSession(req.server.db, {
    tenantId,
    createdByUserId: staff.userId,
    ttlDays: WIZARD_TTL_DAYS,
  });

  const magicLinkUrl = `${config.SETUP_BASE_URL}/${session.token}`;
  const mail = await sendTemplate(
    wizardInviteTemplate,
    { recipientName: tenant.display_name, magicLinkUrl, ttlDays: WIZARD_TTL_DAYS },
    recipient,
  );

  return reply.code(201).send({
    session: {
      id: session.id,
      status: session.status,
      current_step: session.current_step,
      expires_at: session.expires_at,
    },
    // Staff sieht den Link, um ihn bei Bedarf manuell zu versenden (Spec §6.4).
    magic_link_url: magicLinkUrl,
    mail: { ok: mail.ok, dry_run: mail.ok ? mail.dryRun : undefined },
  });
}
