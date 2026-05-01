/**
 * GET /api/v1/dsgvo/pii-inventory — Liste aller PII-Felder im System
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { apiOk } from '../../../core/schemas/common';

const PII_INVENTORY = [
  {
    table: 'customer_profiles',
    description: 'Kundenprofil mit vollstaendigen Kontaktdaten',
    fields: ['legal_name', 'vat_id', 'address', 'email', 'phone'],
    encrypted: ['vat_id'],
    basis: 'Vertrag (Art. 6 Abs. 1 lit. b DSGVO)',
    retention: '10 Jahre (steuerrechtlich)',
  },
  {
    table: 'receipts',
    description: 'Verarbeitete Belege mit Lieferanteninformationen',
    fields: ['supplier_name', 'supplier_vat_id'],
    encrypted: [],
    basis: 'Gesetzliche Verpflichtung (Art. 6 Abs. 1 lit. c DSGVO)',
    retention: '10 Jahre (§ 147 AO)',
  },
  {
    table: 'communications',
    description: 'E-Mail und WhatsApp Kommunikation',
    fields: ['to_address', 'from_address', 'subject', 'body_text'],
    encrypted: [],
    basis: 'Berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO)',
    retention: '3 Jahre',
  },
  {
    table: 'supplier_contacts',
    description: 'Kontaktdaten von Lieferanten',
    fields: ['contact_email', 'contact_phone'],
    encrypted: [],
    basis: 'Berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO)',
    retention: 'Solange Lieferantenbeziehung besteht',
  },
  {
    table: 'users',
    description: 'System-Benutzerkonten',
    fields: ['email', 'name'],
    encrypted: [],
    basis: 'Vertrag (Art. 6 Abs. 1 lit. b DSGVO)',
    retention: 'Bis Kontolueschung',
  },
  {
    table: 'audit_log',
    description: 'Systemprotokoll fuer Nachvollziehbarkeit',
    fields: ['actor', 'payload'],
    encrypted: [],
    basis: 'Gesetzliche Verpflichtung / Berechtigtes Interesse',
    retention: '2 Jahre',
  },
];

export function buildPiiInventoryHandler() {
  return async function piiInventoryHandler(
    _req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    return reply.send(
      apiOk({
        inventory: PII_INVENTORY,
        total_tables: PII_INVENTORY.length,
        total_pii_fields: PII_INVENTORY.reduce((acc, t) => acc + t.fields.length, 0),
        encrypted_fields: PII_INVENTORY.flatMap((t) =>
          t.encrypted.map((f) => `${t.table}.${f}`)
        ),
        last_reviewed: '2026-05-01',
      }),
    );
  };
}
