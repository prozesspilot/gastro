/**
 * T015/M01 — PATCH /api/v1/belege/:id
 *
 * Mitarbeiter korrigiert OCR-Felder im Detail-View. Erlaubt:
 *   * Top-Level: supplier_name, document_date, total_gross, currency, category
 *   * Payload-Felder: tax_rate, bewirtung_anlass, bewirtung_teilnehmer
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook (von belege.routes.ts).
 * Rolle: 'support' darf nur lesen — Patch ist 403.
 *
 * Bewirtungs-Logik:
 *   Bei category='bewirtung' (oder existing category enthaelt 'bewirtung')
 *   sind bewirtung_anlass + bewirtung_teilnehmer Pflichtfelder. Wir
 *   pruefen das hier strict — wenn category='bewirtung' aber Felder leer,
 *   422 zurueck.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getBelegById, updateBelegFields } from '../services/beleg.repository';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const updateBodySchema = z
  .object({
    supplier_name: z.string().max(200).nullable().optional(),
    document_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'document_date muss ISO YYYY-MM-DD sein' })
      .nullable()
      .optional(),
    total_gross: z.number().nonnegative().nullable().optional(),
    currency: z.string().length(3).nullable().optional(),
    category: z.string().max(80).nullable().optional(),
    tax_rate: z.number().min(0).max(100).nullable().optional(),
    bewirtung_anlass: z.string().max(500).nullable().optional(),
    bewirtung_teilnehmer: z.string().max(1000).nullable().optional(),
  })
  .strict();

export async function updateBelegHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
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
      .send({ error: 'forbidden', message: 'Support-Rolle darf Belege nicht editieren.' });
  }

  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return reply
      .code(400)
      .send({ error: 'invalid_id', message: 'Beleg-ID ist keine gueltige UUID.' });
  }

  const parsed = updateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(422).send({ error: 'validation_error', issues: parsed.error.flatten() });
  }
  const patch = parsed.data;

  // Bewirtungs-Pflichtfelder-Check
  const currentBeleg = await getBelegById(req.server.db, tenantId, id);
  if (!currentBeleg) {
    return reply.code(404).send({ error: 'not_found', message: 'Beleg nicht gefunden.' });
  }
  const finalCategory = patch.category !== undefined ? patch.category : currentBeleg.category;
  if (finalCategory?.toLowerCase().includes('bewirtung')) {
    const payload = currentBeleg.payload as {
      extraction?: { fields?: { bewirtung_anlass?: string; bewirtung_teilnehmer?: string } };
    };
    const existing = payload.extraction?.fields ?? {};
    const finalAnlass =
      patch.bewirtung_anlass !== undefined
        ? patch.bewirtung_anlass
        : (existing.bewirtung_anlass ?? null);
    const finalTeilnehmer =
      patch.bewirtung_teilnehmer !== undefined
        ? patch.bewirtung_teilnehmer
        : (existing.bewirtung_teilnehmer ?? null);
    if (!finalAnlass || !finalTeilnehmer) {
      return reply.code(422).send({
        error: 'bewirtung_fields_required',
        message:
          'Bei Bewirtungs-Belegen sind bewirtung_anlass und bewirtung_teilnehmer Pflichtfelder.',
      });
    }
  }

  const updated = await updateBelegFields(req.server.db, tenantId, id, patch, staff.userId);
  if (!updated) {
    return reply.code(404).send({ error: 'not_found', message: 'Beleg nicht gefunden.' });
  }
  return reply.send({ beleg: updated });
}
