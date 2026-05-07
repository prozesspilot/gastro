/**
 * POST /api/v1/routing/plan
 *
 * Liefert den RoutePlan für einen Beleg basierend auf customer_profile +
 * receipt.status. Wird von WF-MASTER-RECEIPT aufgerufen, um zu entscheiden,
 * welche Module der Beleg durchläuft.
 *
 * Logik (entspricht 02_Kundenprofil_System.md §6 + 03_n8n_Workflows.md §4.2):
 *   1) receipt = receiptRepo.findById(receipt_id, customer_id)
 *   2) profile = profileService.get(customer_id) — über customer_profiles JSONB
 *   3) Plan-Aufbau:
 *        - M01 wenn profile.modules_enabled enthält 'M01' UND status ∈ {received, requires_review}
 *        - M03 wenn enabled UND profile.routing.ki_kategorisierung !== false
 *        - M02 wenn enabled UND integrations.archive vorhanden
 *        - M05 wenn enabled UND credential 'lexoffice_api_key' vorhanden
 *        - M06 wenn enabled UND credential 'sevdesk_api_key' vorhanden
 *        - M07 wenn enabled UND integrations.spreadsheet vorhanden
 *
 * Fallback: Profil/Customer fehlt → Basic-Plan { M01, M07 }.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { apiError, apiOk, zodToApiError } from '../../../core/schemas/common';

const planInputSchema = z.object({
  receipt_id: z.string().min(1),
  customer_id: z.string().min(1),
});

// DECISION: The plan handler queries the modern receipts table (migration 013)
// directly instead of via the _shared legacy repository (which uses receipt_id TEXT).
interface ReceiptRow {
  id: string;
  customer_id: string;
  status: string;
  categorization?: unknown;
}

interface CustomerProfileRow {
  modules_enabled: unknown;
  integrations: unknown;
  routing: unknown;
  custom: unknown;
}

interface CredentialRow {
  kind: string;
}

type ModuleId = 'M01' | 'M02' | 'M03' | 'M04' | 'M05' | 'M06' | 'M07' | 'M08';

interface RouteStep {
  module: ModuleId;
  required: boolean;
}

interface RoutePlanResponse {
  receipt_id: string;
  customer_id: string;
  steps: RouteStep[];
  fallback_used?: boolean;
}

export function buildPlanHandler() {
  return async function planHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = planInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send(zodToApiError(parsed.error));
    }
    const { receipt_id, customer_id } = parsed.data;
    const db: Pool = req.server.db;

    // Query the modern receipts table (migration 013) — column is `id`, not `receipt_id`
    const receiptResult = await db.query<ReceiptRow>(
      `SELECT id, customer_id, status, metadata->>'categorization' AS categorization
         FROM receipts
        WHERE id = $1 AND customer_id = $2
        LIMIT 1`,
      [receipt_id, customer_id],
    );
    const receipt = receiptResult.rows[0] ?? null;
    if (!receipt) {
      return reply.code(404).send(
        apiError('NOT_FOUND', `Kein Receipt ${receipt_id} für Customer ${customer_id}.`),
      );
    }

    // customer_profiles aus 010 (TEXT customer_id-Welt). Wir tolerieren,
    // wenn das Profil nicht existiert, und fallen auf einen Basic-Plan zurück.
    const profileRow = await db.query<CustomerProfileRow>(
      `SELECT modules_enabled, integrations, routing, custom
         FROM customer_profiles
        WHERE customer_id = $1
        LIMIT 1`,
      [customer_id],
    );

    if (profileRow.rowCount === 0) {
      const fallback: RoutePlanResponse = {
        receipt_id,
        customer_id,
        steps: [
          { module: 'M01', required: true },
          { module: 'M07', required: false },
        ],
        fallback_used: true,
      };
      return reply.send(apiOk(fallback));
    }

    const profile = profileRow.rows[0];
    // Normalize module codes: support both 'M01' and 'm01_ingestion' formats
    const rawModules = asStringArray(profile.modules_enabled);
    const enabled = new Set(rawModules.flatMap((m) => {
      const upper = m.toUpperCase();
      // Map new-format codes to legacy M-codes
      const legacyMap: Record<string, string> = {
        'M01_INGESTION': 'M01', 'M02_ARCHIVING': 'M02', 'M03_EXTRACTION': 'M03',
        'M04_CATEGORIZATION': 'M04', 'M05_LEXOFFICE': 'M05', 'M06_PORTAL': 'M06',
        'M07_NOTIFICATIONS': 'M07', 'M08_REPORTING': 'M08', 'M09_SUPPLIER_COMM': 'M09',
      };
      const normalized = legacyMap[upper] ?? upper;
      return [m, normalized]; // Keep both forms
    }));
    const integrations = (profile.integrations ?? {}) as Record<string, unknown>;
    const routing = (profile.routing ?? {}) as Record<string, unknown>;

    // Credentials abfragen (kind-Liste).
    const credRes = await db.query<CredentialRow>(
      `SELECT kind FROM customer_credentials WHERE customer_id = $1`,
      [customer_id],
    );
    const credentialKinds = new Set(credRes.rows.map((r) => r.kind));

    const steps: RouteStep[] = [];

    const isExtractedAlready = receipt.status === 'extracted'
      || receipt.status === 'categorized'
      || receipt.status === 'archived'
      || receipt.status === 'exported'
      || receipt.status === 'completed';

    // Phase 1: M01 — Extraktion
    if (enabled.has('M01') && (receipt.status === 'received' || receipt.status === 'requires_review')) {
      steps.push({ module: 'M01', required: true });
    }

    // Phase 2: M03 — Kategorisierung
    const kiOn = (routing as { ki_kategorisierung?: boolean }).ki_kategorisierung !== false;
    if (enabled.has('M03') && kiOn) {
      // Skip M03, wenn Receipt bereits eine Confidence hat, die hoch ist
      // categorization is extracted as a JSON string from metadata JSONB
      let cat: { confidence?: number } | undefined;
      try {
        cat = typeof receipt.categorization === 'string'
          ? JSON.parse(receipt.categorization) as { confidence?: number }
          : (receipt.categorization as { confidence?: number } | undefined);
      } catch { cat = undefined; }
      const threshold = (routing as { low_confidence_threshold?: number }).low_confidence_threshold ?? 0.75;
      const alreadyCategorizedHighConf = cat?.confidence !== undefined && cat.confidence >= threshold;
      if (!alreadyCategorizedHighConf) {
        steps.push({ module: 'M03', required: true });
      }
    }

    // Phase 3: M02 — Archivierung (MinIO/S3 ist global konfiguriert, keine per-Kunde-Integration nötig)
    if (enabled.has('M02')) {
      steps.push({ module: 'M02', required: true });
    }

    // Phase 4: Exporte
    // DECISION: Check both customer_credentials table AND integrations JSONB
    // (new profiles store credentials in integrations, not customer_credentials table)
    const hasLexofficeKey = credentialKinds.has('lexoffice_api_key')
      || Boolean((integrations as { lexoffice_api_key?: unknown }).lexoffice_api_key);
    const hasSevdeskKey = credentialKinds.has('sevdesk_api_key')
      || Boolean((integrations as { sevdesk_api_token?: unknown }).sevdesk_api_token);

    // M07 — WhatsApp-Benachrichtigung: läuft wenn whatsapp_number im custom-Profil gesetzt ist
    const customData = (profileRow.rows[0].custom ?? {}) as Record<string, unknown>;
    const hasWhatsapp = Boolean(
      customData.whatsapp_number
      || (integrations as { whatsapp_number?: unknown }).whatsapp_number,
    );

    if (enabled.has('M05') && hasLexofficeKey) {
      steps.push({ module: 'M05', required: false });
    }
    if (enabled.has('M06') && hasSevdeskKey) {
      steps.push({ module: 'M06', required: false });
    }
    if (enabled.has('M07') && hasWhatsapp) {
      steps.push({ module: 'M07', required: false });
    }

    // Wenn nichts aktiv: zumindest M07 als Default (Konzept-Spec: jeder Beleg soll mindestens irgendwo enden)
    if (steps.length === 0 && !isExtractedAlready) {
      steps.push({ module: 'M01', required: true });
    }

    const response: RoutePlanResponse = {
      receipt_id,
      customer_id,
      steps,
    };
    return reply.send(apiOk(response));
  };
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string') as string[];
  return [];
}

function hasIntegration(integrations: Record<string, unknown>, key: string): boolean {
  const v = integrations[key];
  if (!v) return false;
  if (typeof v === 'object' && v !== null) {
    if ((v as { enabled?: unknown }).enabled === false) return false;
    return true;
  }
  return Boolean(v);
}
