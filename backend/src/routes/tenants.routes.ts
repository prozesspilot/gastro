/**
 * T058/A3 — GET /api/v1/tenants (Staff-Cross-Tenant-Listing).
 * T093     — POST /api/v1/tenants (Staff-Tool „Neuer Kunde": Mandanten-Anlage).
 *
 * Liefert der internen Mitarbeiter-Webapp die Mandanten-Liste für den
 * Tenant-Selector und erlaubt gf/mitarbeiter, einen neuen Mandanten anzulegen.
 *
 * Auth: NUR `m14StaffAuthHook` (JWT-Cookie/Bearer) — bewusst OHNE
 * `m14TenantContextHook`. GET listet alle Mandanten (nicht tenant-scoped); POST
 * legt einen NEUEN Mandanten an, es gibt also noch kein `x-pp-tenant-id`.
 *
 * Registrierung in app.ts:
 *   await app.register(tenantsRoutes, { prefix: '/api/v1/tenants' });
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getM14Staff, m14StaffAuthHook } from '../core/auth/m14-staff-auth';
import { apiError, apiOk, zodToApiError } from '../core/schemas/common';
import { slugifyTenantName } from './tenant-slug';
import { createTenant, listTenantsForStaff } from './tenants.repository';

// T093: explizites Per-Route-Rate-Limit für die schreibende Anlage (zusätzlich
// zum globalen Limit aus app.ts). Greift nur, wenn @fastify/rate-limit registriert
// ist (Prod; im Test ignoriert). Klärt zugleich den CodeQL-„missing-rate-limiting"-
// Alert für die Route-Datei (Memory codeql-missing-rate-limiting).
const RL = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

/** DB-Spaltenbreite `tenants.slug` = VARCHAR(60) → hier max. 60 (nicht 64 wie slugSchema). */
const tenantSlugSchema = z
  .string()
  .trim()
  .min(2, 'Slug muss mindestens 2 Zeichen lang sein.')
  .max(60, 'Slug darf maximal 60 Zeichen lang sein.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.',
  );

/** '' / whitespace → undefined; sonst getrimmt, mit Längenbegrenzung. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .refine((v) => v === undefined || z.string().email().safeParse(v).success, {
    message: 'Ungültige E-Mail-Adresse.',
  })
  .optional();

const createTenantBodySchema = z
  .object({
    display_name: z
      .string()
      .trim()
      .min(3, 'Firmenname muss mindestens 3 Zeichen lang sein.')
      .max(120, 'Firmenname darf maximal 120 Zeichen lang sein.'),
    legal_name: optionalText(200),
    contact_email: optionalEmail,
    contact_phone: optionalText(40),
    package: z.enum(['solo', 'standard', 'pro', 'filiale']).default('standard'),
    slug: tenantSlugSchema.optional(),
  })
  .strict();

/** pg wirft bei UNIQUE-Verletzung (tenants.slug) einen Fehler mit code '23505'. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export async function tenantsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', m14StaffAuthHook);

  // GET /api/v1/tenants
  //
  // Rollen-Gating BEWUSST keins: ALLE Staff-Rollen (auch `support`) dürfen die
  // Mandanten-Liste lesen. Begründung: der Tenant-Selector ist die Voraussetzung,
  // um überhaupt einen Mandanten zu wählen — und `support` hat im A3-Rollenmodell
  // `tenants.read` (read-only Belege-Sicht je Mandant). Exponiert werden nur
  // nicht-sensible Business-Metadaten (slug/display_name/package/deletion_status/
  // onboarding_status), keine PII. Schreib-/Lösch-Operationen bleiben anderswo `support`-gesperrt.
  app.get('/', async (req, reply) => {
    const tenants = await listTenantsForStaff(req.server.db);
    return reply.send(apiOk(tenants));
  });

  // POST /api/v1/tenants — neuen Mandanten anlegen.
  //
  // Rollen-Gate: gf/mitarbeiter dürfen; `support` → 403 (read-only). Das passt
  // zum Vertriebsmodell (Sales/Staff legt den Kunden an, der Wirt registriert
  // sich NICHT selbst — Onboarding_Wizard.md §1.2/§1.3). Kein x-pp-tenant-id nötig.
  app.post('/', RL, async (req, reply) => {
    const staff = getM14Staff(req);
    if (!staff) {
      return reply.code(401).send(apiError('UNAUTHORIZED', 'Nicht angemeldet.'));
    }
    // Allowlist statt Denylist: nur gf/mitarbeiter dürfen anlegen. Eine künftig
    // ergänzte, niedrig-privilegierte Rolle erbt so NICHT automatisch Anlage-Rechte.
    if (staff.role !== 'geschaeftsfuehrer' && staff.role !== 'mitarbeiter') {
      return reply
        .code(403)
        .send(
          apiError('FORBIDDEN', 'Nur Geschäftsführer oder Mitarbeiter dürfen Mandanten anlegen.'),
        );
    }

    const parsed = createTenantBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const {
      display_name,
      legal_name,
      contact_email,
      contact_phone,
      package: pkg,
      slug,
    } = parsed.data;

    const explicitSlug = slug;
    const baseSlug = explicitSlug ?? slugifyTenantName(display_name);
    if (baseSlug.length < 2) {
      return reply
        .code(422)
        .send(
          apiError(
            'INVALID_SLUG',
            'Aus dem Namen ließ sich kein gültiger Slug bilden — bitte einen Slug manuell angeben.',
          ),
        );
    }

    // Bei automatisch generiertem Slug: bis zu 20× einen numerischen Suffix
    // probieren (pizzeria-bella, pizzeria-bella-2, …), damit zwei gleichnamige
    // Gastros kein hartes 409 verursachen. Ein EXPLIZIT gewünschter Slug wird
    // dagegen NICHT verändert → direkt 409 bei Kollision.
    const maxAttempts = explicitSlug ? 1 : 20;
    for (let i = 0; i < maxAttempts; i++) {
      const suffix = i === 0 ? '' : `-${i + 1}`;
      // slice() kann mitten in einem Bindestrich-Block enden → vor dem Suffix
      // trailing '-' entfernen, damit kein '…--2' entsteht (verletzt tenantSlugSchema).
      const candidate =
        i === 0 ? baseSlug : `${baseSlug.slice(0, 60 - suffix.length).replace(/-+$/, '')}${suffix}`;
      try {
        const tenant = await createTenant(req.server.db, {
          slug: candidate,
          displayName: display_name,
          legalName: legal_name,
          contactEmail: contact_email,
          contactPhone: contact_phone,
          package: pkg,
        });
        return reply.code(201).send(apiOk(tenant));
      } catch (err) {
        if (isUniqueViolation(err)) {
          continue; // nächster Suffix (nur bei automatischem Slug relevant)
        }
        throw err;
      }
    }

    return reply
      .code(409)
      .send(
        apiError(
          'SLUG_TAKEN',
          explicitSlug
            ? `Der Slug „${explicitSlug}" ist bereits vergeben.`
            : 'Es existiert bereits ein Mandant mit ähnlichem Namen — bitte einen abweichenden Slug angeben.',
        ),
      );
  });
}
