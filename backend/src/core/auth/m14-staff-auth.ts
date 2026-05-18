/**
 * M14 Staff Auth — geteilter Hook für JWT-Cookie-Auth in Mitarbeiter-Routen.
 *
 * Kapselt die verifyM14Token-Logik aus oauth.routes.ts (M15) als wiederverwendbare
 * Funktion + Fastify-preHandler-Hook, damit andere Module (M01, etc.) nicht
 * duplizierten Auth-Code schreiben müssen.
 *
 * Verwendung:
 *   import { getM14Staff, m14StaffAuthHook } from '../../core/auth/m14-staff-auth';
 *
 *   // Inline Check:
 *   const staff = getM14Staff(req);
 *   if (!staff) return reply.code(401).send({ error: 'unauthorized' });
 *
 *   // Als preHandler-Hook:
 *   app.addHook('preHandler', m14StaffAuthHook);
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyM14Token } from '../../modules/m14-auth/m14-jwt';

// ── Types ──────────────────────────────────────────────────────────────────

export interface M14Staff {
  userId: string;
  role: 'geschaeftsfuehrer' | 'mitarbeiter' | 'support';
  displayName: string;
}

// ── Hilfsfunktion ──────────────────────────────────────────────────────────

/**
 * Prüft M14-JWT-Cookie (pp_auth) und gibt Staff-Payload zurück.
 * Gibt null zurück bei fehlendem oder ungültigem Token.
 *
 * DECISION: Wir nutzen das pp_auth Cookie (analog oauth.routes.ts in M15),
 * weil alle Mitarbeiter-Routen aus der Mitarbeiter-Webapp aufgerufen werden.
 */
export function getM14Staff(req: FastifyRequest): M14Staff | null {
  const cookie = req.cookies?.pp_auth;
  if (!cookie) return null;

  const result = verifyM14Token(cookie);
  if (!result.ok) return null;

  return {
    userId: result.payload.sub,
    role: result.payload.role,
    displayName: result.payload.display_name,
  };
}

/**
 * Fastify preHandler Hook — wirft 401 wenn kein gültiges M14-JWT-Cookie vorhanden.
 *
 * Verwendung als addHook() auf Route-Ebene oder Plugin-Ebene:
 *   app.addHook('preHandler', m14StaffAuthHook);
 */
export async function m14StaffAuthHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const staff = getM14Staff(req);
  if (!staff) {
    return reply.code(401).send({
      error: 'unauthorized',
      message: 'M14-JWT-Authentifizierung erforderlich.',
    });
  }
  // Staff-Daten für Handler zugänglich machen
  // DECISION: Wir speichern den Staff in req für nachfolgende Handler.
  // TypeScript-Erweiterung erfolgt über Module-Augmentation in dieser Datei.
  (req as FastifyRequest & { m14Staff?: M14Staff }).m14Staff = staff;
}
