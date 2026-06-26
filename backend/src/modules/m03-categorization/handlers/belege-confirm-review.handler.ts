/**
 * T078 — POST /api/v1/belege/:id/confirm-review  (manuell, Mitarbeiter)
 *
 * Bestätigt einen geprüften `requires_review`-Beleg als `categorized` → danach
 * exportierbar. Strikt nur Statuswechsel (keine Feld-Korrektur — die läuft über
 * PATCH /belege/:id). Logik im geteilten categorize.service.
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook (JWT). support-Rolle darf nicht.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { apiError, apiOk } from '../../../core/schemas/common';
import { confirmBelegReviewById } from '../services/categorize.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildBelegeConfirmReviewHandler() {
  return async function belegeConfirmReviewHandler(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const tenantId = req.tenantId;
    const staff = (req as FastifyRequest & { m14Staff?: { userId: string; role: string } })
      .m14Staff;
    if (!staff || !tenantId) {
      return reply.code(401).send(apiError('UNAUTHORIZED', 'Auth oder Tenant fehlt.'));
    }
    if (staff.role === 'support') {
      return reply.code(403).send(apiError('FORBIDDEN', 'Support-Rolle darf nicht bestätigen.'));
    }

    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return reply.code(400).send(apiError('INVALID_ID', 'Beleg-ID ist keine gültige UUID.'));
    }

    const outcome = await confirmBelegReviewById(req.server.db, tenantId, id, {
      actor: { type: 'staff', id: staff.userId },
    });

    if (!outcome.ok) {
      switch (outcome.reason) {
        case 'not_found':
          return reply.code(404).send(apiError('NOT_FOUND', `Kein Beleg ${id} für diesen Tenant.`));
        case 'invalid_status':
          return reply
            .code(422)
            .send(
              apiError(
                'INVALID_STATUS',
                `Beleg-Status '${outcome.status}' nicht akzeptiert für /confirm-review.`,
                { status: outcome.status, accepted: ['requires_review'] },
              ),
            );
        case 'category_required':
          return reply
            .code(422)
            .send(
              apiError(
                'CATEGORY_REQUIRED',
                'Beleg hat keine Kategorie — erst kategorisieren/korrigieren.',
              ),
            );
        case 'not_categorized':
          return reply
            .code(422)
            .send(apiError('NOT_CATEGORIZED', 'Beleg wurde noch nicht kategorisiert.'));
        case 'bewirtung_fields_required':
          return reply
            .code(422)
            .send(
              apiError(
                'BEWIRTUNG_FIELDS_REQUIRED',
                'Bei Bewirtungs-Belegen sind Anlass und Teilnehmer Pflichtfelder — bitte erst ergänzen und speichern.',
              ),
            );
      }
    }

    return reply.send(apiOk({ beleg_id: id, status: 'categorized' }));
  };
}
