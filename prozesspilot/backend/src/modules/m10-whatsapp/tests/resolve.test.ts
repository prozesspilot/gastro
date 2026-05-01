/**
 * M10 — Tests für customer-resolver + POST /resolve
 *
 * Pflicht-Fälle:
 *   - bekannter phone_number_id + erlaubter Sender → allowed:true
 *   - bekannter phone_number_id + unbekannter Sender → allowed:false
 *   - unbekannter phone_number_id → CustomerNotFoundError
 *
 * Wir testen reine Funktionen ohne DB durch einen Mock-Pool. Damit ist der
 * Test unabhängig von einer laufenden Postgres-Instanz und deckt alle
 * Branches ab.
 */

import { describe, expect, it } from 'vitest';
import {
  CustomerNotFoundError,
  normalizePhone,
  resolveCustomer,
} from '../services/customer-resolver';

// ── Mock-DB-Pool ──────────────────────────────────────────────────────────

interface FakeRow {
  customer_id: string;
  integrations: {
    input_whatsapp?: {
      phone_number_id: string;
      allowed_senders: { phone: string; name?: string; role?: string }[];
    };
  };
}

function fakeDb(rows: FakeRow[]): { query: (sql: string, params: unknown[]) => Promise<{ rows: FakeRow[] }> } {
  return {
    query: async (_sql: string, params: unknown[]) => {
      const phoneNumberId = params[0] as string;
      const matched = rows.filter(
        (r) => r.integrations.input_whatsapp?.phone_number_id === phoneNumberId,
      );
      return { rows: matched };
    },
  };
}

// ── normalizePhone ────────────────────────────────────────────────────────

describe('normalizePhone', () => {
  it('entfernt führendes "+"', () => {
    expect(normalizePhone('+4917612345678')).toBe('4917612345678');
  });

  it('entfernt führende "00"', () => {
    expect(normalizePhone('004917612345678')).toBe('4917612345678');
  });

  it('ersetzt führende "0" durch Default-Ländervorwahl 49', () => {
    expect(normalizePhone('017612345678')).toBe('4917612345678');
  });

  it('entfernt Whitespaces, Klammern, Bindestriche', () => {
    expect(normalizePhone('+49 (0)176 / 12345-678')).toBe('4917612345678');
  });

  it('lässt international formatierte Nummer ohne 0/Plus unverändert', () => {
    expect(normalizePhone('4917612345678')).toBe('4917612345678');
  });

  it('Edge: leerer String', () => {
    expect(normalizePhone('')).toBe('');
  });
});

// ── resolveCustomer ───────────────────────────────────────────────────────

describe('resolveCustomer', () => {
  const profileRow: FakeRow = {
    customer_id: 'cust_a3f4b2',
    integrations: {
      input_whatsapp: {
        phone_number_id: '123456789012345',
        allowed_senders: [
          { name: 'Mario',  phone: '+4917612345678', role: 'owner' },
          { name: 'Giulia', phone: '017698765432',   role: 'accountant' },
        ],
      },
    },
  };

  it('akzeptiert bekannten Sender (international formatierte Profil-Nummer)', async () => {
    const db = fakeDb([profileRow]) as never;
    const res = await resolveCustomer(db, '123456789012345', '4917612345678');

    expect(res.allowed).toBe(true);
    expect(res.customerId).toBe('cust_a3f4b2');
    expect(res.sender?.name).toBe('Mario');
    expect(res.sender?.role).toBe('owner');
    expect(res.reason).toBeUndefined();
  });

  it('akzeptiert bekannten Sender (Profil-Nummer mit deutscher 0-Vorwahl)', async () => {
    const db = fakeDb([profileRow]) as never;
    const res = await resolveCustomer(db, '123456789012345', '4917698765432');

    expect(res.allowed).toBe(true);
    expect(res.sender?.name).toBe('Giulia');
  });

  it('lehnt unbekannten Sender mit reason=sender_not_whitelisted ab', async () => {
    const db = fakeDb([profileRow]) as never;
    const res = await resolveCustomer(db, '123456789012345', '4915112345000');

    expect(res.allowed).toBe(false);
    expect(res.customerId).toBe('cust_a3f4b2');
    expect(res.reason).toBe('sender_not_whitelisted');
    expect(res.sender).toBeUndefined();
  });

  it('wirft CustomerNotFoundError bei unbekannter phone_number_id', async () => {
    const db = fakeDb([profileRow]) as never;
    await expect(
      resolveCustomer(db, '999999999999999', '4917612345678'),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it('lehnt ab, wenn allowed_senders leer ist', async () => {
    const empty: FakeRow = {
      customer_id: 'cust_basic',
      integrations: { input_whatsapp: { phone_number_id: 'pnum-basic', allowed_senders: [] } },
    };
    const db = fakeDb([empty]) as never;
    const res = await resolveCustomer(db, 'pnum-basic', '4917612345678');
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('sender_not_whitelisted');
  });
});
