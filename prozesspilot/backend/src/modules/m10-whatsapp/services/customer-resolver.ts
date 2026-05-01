/**
 * M10 — Customer Resolver
 *
 * Mapped (phone_number_id, from) → customer_id + allowed-Flag.
 *
 * Lookup-Quelle: customer_profiles.integrations.input_whatsapp.
 *   - phone_number_id   identifiziert den Customer.
 *   - allowed_senders[] enthält die zugelassenen Absender-Telefonnummern.
 *
 * Pseudocode aus M10 §8.1 — exakt umgesetzt.
 *
 * Spec-Referenz:
 *   M10 §7.2, §8.1
 *   02_Kundenprofil_System.md §2 (integrations.input_whatsapp)
 */

import type { Pool } from 'pg';

// ── Typen ──────────────────────────────────────────────────────────────────

export interface AllowedSender {
  name?:  string;
  phone:  string;
  role?:  string;
}

export interface ResolveResult {
  customerId: string;
  allowed:    boolean;
  reason?:    'sender_not_whitelisted';
  sender?:    AllowedSender;
}

export class CustomerNotFoundError extends Error {
  readonly code = 'CUSTOMER_NOT_FOUND';
  constructor(public readonly phoneNumberId: string) {
    super(`Kein customer_profile für phone_number_id=${phoneNumberId} gefunden.`);
    this.name = 'CustomerNotFoundError';
  }
}

// ── Telefonnummer-Normalisierung ──────────────────────────────────────────

/**
 * Bringt eine Telefonnummer in eine Vergleichs-kanonische Form:
 *   - Alle Whitespaces, Klammern, Bindestriche, Schrägstriche entfernen.
 *   - Führendes "+" entfernen.
 *   - Führende "00" entfernen (internationale Vorwahl).
 *   - Führende "0" wird durch eine vorgegebene Ländervorwahl ersetzt
 *     (Default: "49" für Deutschland).
 *
 * Beispiele (mit Default-Vorwahl 49):
 *   "+4917612345678"       → "4917612345678"
 *   "004917612345678"      → "4917612345678"
 *   "017612345678"         → "4917612345678"
 *   "176-12345678"         → "17612345678"     (ohne 0 → unverändert; Aufrufer trägt Verantwortung)
 *
 * Hinweis: Meta liefert `from` immer ohne führendes "+" und ohne 0.
 * Diese Funktion deckt zusätzlich Profil-Konfigurationen ab, in denen
 * der Operator eine deutsche Nummer mit "+49" oder "0176..." einträgt.
 */
export function normalizePhone(raw: string, defaultCountry = '49'): string {
  if (!raw) return '';
  // 1) "(0)" als Inland-Vorwahl-Trennzeichen (z. B. "+49 (0)176") komplett entfernen.
  let n = raw.replace(/\(0\)/g, '');
  // 2) Whitespace, andere Klammern, Bindestriche, Schrägstriche entfernen.
  n = n.replace(/[\s()/\-]/g, '');
  if (n.startsWith('+'))  n = n.slice(1);
  if (n.startsWith('00')) n = n.slice(2);
  // 3) Führende einzelne "0" → Ländervorwahl.
  if (n.startsWith('0') && !n.startsWith('00')) {
    n = defaultCountry + n.slice(1);
  }
  return n;
}

// ── Repository-Lookup (Postgres) ──────────────────────────────────────────

interface ProfileRow {
  customer_id:  string;
  integrations: {
    input_whatsapp?: {
      enabled?:          boolean;
      phone_number_id?:  string;
      allowed_senders?:  AllowedSender[];
      credentials_ref?:  string;
    };
  };
}

/**
 * Sucht das Customer-Profil per JSONB-Pfad
 * `integrations->input_whatsapp->>phone_number_id`.
 *
 * Gibt das gesamte Profil-Fragment zurück, das wir für den Resolve brauchen.
 */
export async function findProfileByPhoneNumberId(
  db: Pool,
  phoneNumberId: string,
): Promise<ProfileRow | null> {
  const { rows } = await db.query<ProfileRow>(
    `SELECT customer_id, integrations
       FROM customer_profiles
      WHERE integrations->'input_whatsapp'->>'phone_number_id' = $1
      LIMIT 1`,
    [phoneNumberId],
  );
  return rows[0] ?? null;
}

// ── Hauptfunktion ─────────────────────────────────────────────────────────

export async function resolveCustomer(
  db: Pool,
  phoneNumberId: string,
  from: string,
): Promise<ResolveResult> {
  const profile = await findProfileByPhoneNumberId(db, phoneNumberId);
  if (!profile) {
    throw new CustomerNotFoundError(phoneNumberId);
  }

  const senders = profile.integrations.input_whatsapp?.allowed_senders ?? [];
  const normalizedFrom = normalizePhone(from);
  const sender = senders.find((s) => normalizePhone(s.phone) === normalizedFrom);

  if (!sender) {
    return {
      customerId: profile.customer_id,
      allowed:    false,
      reason:     'sender_not_whitelisted',
    };
  }

  return {
    customerId: profile.customer_id,
    allowed:    true,
    sender,
  };
}
