/**
 * D5 — pgcrypto-Helper
 *
 * Kapselt die SQL-Ausdrücke für symmetrische PII-Verschlüsselung
 * via pgcrypto (pgp_sym_encrypt / pgp_sym_decrypt).
 *
 * Der Schlüssel kommt aus der Umgebungsvariable PP_PGCRYPTO_KEY.
 * Die eigentliche Krypto-Arbeit findet in Postgres statt —
 * der Klartext verlässt die DB nie unverschlüsselt.
 *
 * Verwendung im Repository:
 *   const sql = `INSERT INTO booking_credentials (api_token_enc) VALUES (${encryptExpr(1)})`;
 *   await client.query(sql, [key, plaintext]);
 */

import { config } from '../config';

/**
 * SQL-Ausdruck für pgp_sym_encrypt.
 *
 * Erzeugt: pgp_sym_encrypt($N::text, $M::text)
 *
 * @param valueParamIndex  Index des Klartexts in der Parameterliste
 * @param keyParamIndex    Index des Schlüssels (Standard: valueParamIndex - 1)
 *
 * Konvention: Der Schlüssel steht IMMER VOR dem Klartextwert im Params-Array.
 * Typischerweise: params = [key, value1, value2, ...]
 */
export function encryptExpr(valueParamIndex: number, keyParamIndex = 1): string {
  return `pgp_sym_encrypt($${valueParamIndex}::text, $${keyParamIndex}::text)`;
}

/**
 * SQL-Ausdruck für pgp_sym_decrypt.
 *
 * Erzeugt: pgp_sym_decrypt(col, $N::text)
 *
 * @param column        Spaltenname oder SQL-Ausdruck
 * @param keyParamIndex Index des Schlüssels in der Parameterliste
 */
export function decryptExpr(column: string, keyParamIndex = 1): string {
  return `pgp_sym_decrypt(${column}, $${keyParamIndex}::text)`;
}

/**
 * SQL-Ausdruck für optionale verschlüsselte Spalten (NULL-sicher).
 *
 * Erzeugt: pgp_sym_decrypt(col, $N::text) oder NULL
 */
export function decryptNullableExpr(column: string, keyParamIndex = 1): string {
  return `CASE WHEN ${column} IS NOT NULL THEN pgp_sym_decrypt(${column}, $${keyParamIndex}::text) ELSE NULL END`;
}

/**
 * Gibt den aktuellen Verschlüsselungsschlüssel zurück.
 * Wirft einen Fehler, falls PP_PGCRYPTO_KEY nicht gesetzt ist.
 */
export function getCryptoKey(): string {
  if (!config.PP_PGCRYPTO_KEY) {
    throw new Error(
      'PP_PGCRYPTO_KEY ist nicht gesetzt. Bitte in .env eintragen: openssl rand -base64 32',
    );
  }
  return config.PP_PGCRYPTO_KEY;
}
