/**
 * T048/F2 — POST /api/v1/belege/:id/categorize  (manuell, Mitarbeiter)
 *
 * Die eigentliche Kategorisier-Logik liegt seit T077 im geteilten
 * categorize.service (auch vom OCR-Worker für Auto-Kategorisieren genutzt).
 * Dieser Handler macht nur Auth/Rolle/UUID + das HTTP-Mapping des Outcomes.
 *
 * Auth: m14StaffAuthHook + m14TenantContextHook (JWT). support-Rolle darf nicht.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { apiError, apiOk } from '../../../core/schemas/common';
import { type CategorizeBelegDeps, categorizeBelegById } from '../services/categorize.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BelegeCategorizeDeps {
  /** Injizierbarer Categorizer (Tests). Default: echter categorizeBeleg. */
  categorize?: CategorizeBelegDeps['categorize'];
}

export function buildBelegeCategorizeHandler(deps: BelegeCategorizeDeps = {}) {
  return async function belegeCategorizeHandler(
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
      return reply
        .code(403)
        .send(apiError('FORBIDDEN', 'Support-Rolle darf nicht kategorisieren.'));
    }

    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return reply.code(400).send(apiError('INVALID_ID', 'Beleg-ID ist keine gültige UUID.'));
    }

    const outcome = await categorizeBelegById(req.server.db, tenantId, id, {
      actor: { type: 'staff', id: staff.userId },
      deps: { categorize: deps.categorize },
    });

    if (!outcome.ok) {
      if (outcome.reason === 'not_found') {
        return reply.code(404).send(apiError('NOT_FOUND', `Kein Beleg ${id} für diesen Tenant.`));
      }
      return reply.code(422).send(
        apiError(
          'INVALID_STATUS',
          `Beleg-Status '${outcome.status}' nicht akzeptiert für /categorize.`,
          {
            status: outcome.status,
            accepted: ['extracted'],
          },
        ),
      );
    }

    return reply.send(
      apiOk({
        beleg_id: id,
        status: outcome.status,
        categorization: outcome.categorization,
      }),
    );
  };
}
