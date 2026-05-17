/**
 * M05 — Contact-Resolver (M05-Spec §8.1).
 *
 * Logik:
 *   - Wenn supplier_vat_id vorhanden: client.findContactByVatId
 *   - Falls nicht gefunden UND profile.integrations.lexoffice.auto_create_contacts:
 *       client.createContact({ name, vatId })
 *   - Sonst: useCollectiveContact (Sammel-Kreditor)
 */

import type { LexofficeClient } from '../../../core/adapters/booking/lexoffice/lexoffice.client';
import type { LexofficeUuid } from '../../../core/adapters/booking/lexoffice/lexoffice.types';

export interface ResolveContactInput {
  client: LexofficeClient;
  supplierName?: string;
  supplierVatId?: string | null;
  autoCreate?: boolean;
}

export interface ResolveContactResult {
  contactId: LexofficeUuid | null;
  useCollectiveContact: boolean;
}

export async function resolveContact(input: ResolveContactInput): Promise<ResolveContactResult> {
  const vat = (input.supplierVatId ?? '').trim();
  const name = (input.supplierName ?? '').trim();

  if (vat) {
    try {
      const found = await input.client.findContactByVatId(vat);
      if (found) {
        return { contactId: found.id, useCollectiveContact: false };
      }
    } catch {
      // Suche fehlgeschlagen → Sammel-Kreditor
    }
  }

  if (vat && name && input.autoCreate) {
    try {
      const created = await input.client.createContact({ name, vatId: vat });
      return { contactId: created.id, useCollectiveContact: false };
    } catch {
      // Erstellung fehlgeschlagen → Sammel-Kreditor
    }
  }

  return { contactId: null, useCollectiveContact: true };
}
