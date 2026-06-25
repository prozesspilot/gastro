/**
 * T068 — POST /api/v1/chat/sessions  (Staff)
 *
 * Ein Mitarbeiter legt für den aktuell gewählten Tenant (x-pp-tenant-id) eine
 * Chat-Session an → Einladungs-/Alarm-Mail mit Magic-Link via A1-Mail-Service.
 * Auth: m14StaffAuthHook + m14TenantContextHook (von webchat.routes.ts).
 *
 * Anders als der Onboarding-Wizard darf hier auch die Rolle 'support' auslösen —
 * proaktiver Kundenkontakt ist Kern der Support-Rolle.
 *
 * Idempotent: existiert bereits ein aktiver Link, wird dieser zurückgegeben
 * (created=false, 200) statt eines zweiten — „genau ein aktiver Link pro Mandant".
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../../../core/config';
import { sendTemplate } from '../../../core/mail/mail.service';
import { createChatSession, getTenantContact } from '../services/webchat.repository';
import { chatInviteTemplate } from '../templates/chat-invite.template';

const bodySchema = z.object({ email: z.string().trim().email().optional() }).strict().partial();

export async function createChatSessionHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const tenantId = req.tenantId;
  const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } }).m14Staff;
  if (!staff || !tenantId) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Auth oder Tenant fehlt.' });
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

  const { session, created } = await createChatSession(req.server.db, {
    tenantId,
    triggerType: 'staff_manual',
    actor: { type: 'staff', id: staff.userId },
  });

  const magicLinkUrl = `${config.CHAT_BASE_URL}/${session.token}`;
  const mail = await sendTemplate(
    chatInviteTemplate,
    { recipientName: tenant.display_name, magicLinkUrl },
    recipient,
  );

  return reply.code(created ? 201 : 200).send({
    session: { id: session.id, status: session.status, created_at: session.created_at },
    created,
    // Staff sieht den Link, um ihn bei Bedarf manuell zu versenden (Web_Chat §11).
    magic_link_url: magicLinkUrl,
    mail: { ok: mail.ok, dry_run: mail.ok ? mail.dryRun : undefined },
  });
}
