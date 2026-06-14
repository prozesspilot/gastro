/**
 * M05 — Category-Mapper SKR-Konto → Lexoffice categoryId.
 *
 * Strategie:
 *   1) Lookup in lexoffice_category_map (customer_id, skr_account)
 *   2) Falls leer: customer_id='default' Fallback (in customer-Zeile kopieren)
 *   3) Falls auch leer: Lexoffice client.listCategories() → Heuristik (Name-Match)
 *      → INSERT in Map. Schlägt der Lookup fehl, fallback auf 'sonstige' UUID.
 *
 * T054:
 *   - Alle DB-Zugriffe laufen auf EINER Connection mit gesetztem RLS-Kontext
 *     (`app.current_tenant`), sonst sieht der Tenant unter FORCE RLS seine
 *     eigenen `lexoffice_category_map`-Zeilen weder lesen noch schreiben.
 *   - Die Namens-Heuristik wird aus SYSTEM_CATEGORIES abgeleitet (Reverse-Lookup
 *     SKR-Konto → Kategorie via `categoryIdForSkrAccount`), NICHT mehr aus einer
 *     eigenen, abweichend verschlüsselten SKR-Map. Damit ist die Konto-Quelle
 *     einheitlich (vgl. T052) und chart-korrekt.
 *
 * Hinweis: Die Heuristik im listCategories-Path ist absichtlich konservativ —
 * sie matcht nur, wenn ein eindeutig zuordbarer Lexoffice-Eintrag existiert. Die
 * Needles sind auf die Lexware-Standard-Kategorienamen gegründet; die finale
 * Zuordnung pro Tenant gehört gegen den echten Account verifiziert (manueller
 * Setup-Schritt, siehe tasks/MANUELLE_AUFGABEN.md).
 */

import type { Pool, PoolClient } from 'pg';
import { categoryIdForSkrAccount } from '../../../../modules/m03-categorization/system-categories';
import { logger } from '../../../logger';
import type { LexofficeClient } from './lexoffice.client';
import type { LexofficeUuid } from './lexoffice.types';

const FALLBACK_SONSTIGE = '00000000-0000-4000-8000-000000004980';

interface MapRow {
  lexoffice_category_id: LexofficeUuid;
}

interface MapperOpts {
  pool: Pool;
  client: LexofficeClient;
}

export class CategoryMapper {
  private readonly pool: Pool;
  private readonly client: LexofficeClient;

  constructor(opts: MapperOpts) {
    this.pool = opts.pool;
    this.client = opts.client;
  }

  async mapSkrToLexoffice(skrAccount: string, customerId: string): Promise<LexofficeUuid> {
    const conn = await this.pool.connect();
    try {
      await conn.query('BEGIN');
      // RLS-Kontext setzen (transaktions-lokal → wird bei COMMIT/ROLLBACK sauber
      // zurückgesetzt, kein Leak auf die nächste Pool-Entleihung). Ohne das liefert
      // current_tenant_id() NULL und der Tenant sieht/schreibt keine eigenen Zeilen.
      await conn.query("SELECT set_config('app.current_tenant', $1, true)", [customerId]);

      const result = await this.resolve(conn, skrAccount, customerId);
      await conn.query('COMMIT');
      return result;
    } catch (err) {
      await conn.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      conn.release();
    }
  }

  private async resolve(
    conn: PoolClient,
    skrAccount: string,
    customerId: string,
  ): Promise<LexofficeUuid> {
    // 1) Customer-spezifische Map
    const cust = await this.lookup(conn, customerId, skrAccount);
    if (cust) return cust;

    // 2) Default-Map
    const def = await this.lookup(conn, 'default', skrAccount);
    if (def) {
      // Best-effort: in customer-Map kopieren, damit Reads schneller werden.
      // SAVEPOINT, damit ein Insert-Fehler die Tenant-Transaktion nicht abbricht.
      await conn.query('SAVEPOINT copy_default');
      try {
        await conn.query(
          `INSERT INTO lexoffice_category_map (customer_id, skr_account, lexoffice_category_id, source)
           VALUES ($1, $2, $3, 'default')
           ON CONFLICT (customer_id, skr_account) DO NOTHING`,
          [customerId, skrAccount, def],
        );
        await conn.query('RELEASE SAVEPOINT copy_default');
      } catch {
        await conn.query('ROLLBACK TO SAVEPOINT copy_default').catch(() => undefined);
      }
      return def;
    }

    // 3) Lexoffice fragen, ob ein Mapping ableitbar ist
    try {
      const cats = await this.client.listCategories();
      const heuristicMatch = pickByHeuristic(cats, skrAccount);
      if (heuristicMatch) {
        // SAVEPOINT: schlägt der Cache-Insert fehl, nutzen wir das aufgelöste
        // Mapping trotzdem (besser als Fallback 'sonstige').
        await conn.query('SAVEPOINT api_lookup');
        try {
          await conn.query(
            `INSERT INTO lexoffice_category_map (customer_id, skr_account, lexoffice_category_id, category_name, source)
             VALUES ($1, $2, $3, $4, 'api_lookup')
             ON CONFLICT (customer_id, skr_account) DO UPDATE
               SET lexoffice_category_id = EXCLUDED.lexoffice_category_id, category_name = EXCLUDED.category_name`,
            [customerId, skrAccount, heuristicMatch.id, heuristicMatch.name],
          );
          await conn.query('RELEASE SAVEPOINT api_lookup');
        } catch (insErr) {
          await conn.query('ROLLBACK TO SAVEPOINT api_lookup').catch(() => undefined);
          logger.warn(
            { err: insErr, skrAccount },
            'lexoffice_category_map INSERT (api_lookup) fehlgeschlagen — Mapping trotzdem genutzt',
          );
        }
        return heuristicMatch.id;
      }
    } catch (err) {
      logger.warn({ err, skrAccount }, 'Lexoffice listCategories fehlgeschlagen');
    }

    // 4) Fallback: 'sonstige'
    return FALLBACK_SONSTIGE;
  }

  private async lookup(
    conn: PoolClient,
    customerId: string,
    skrAccount: string,
  ): Promise<LexofficeUuid | null> {
    const { rows } = await conn.query<MapRow>(
      `SELECT lexoffice_category_id
         FROM lexoffice_category_map
        WHERE customer_id = $1 AND skr_account = $2
        LIMIT 1`,
      [customerId, skrAccount],
    );
    return rows[0]?.lexoffice_category_id ?? null;
  }
}

/**
 * Default-Mapping im Code (Spec M05 §8.2): SKR-Konto → Lexoffice-Kategorie über
 * Namens-Substrings. Die Needles sind pro System-Kategorie definiert und auf die
 * Lexware-Standard-Kategorienamen (Deutsch) gegründet — der SKR-Bezug kommt aus
 * SYSTEM_CATEGORIES (eine Quelle, T052/T054), nicht aus einer parallelen Map.
 */
const NEEDLES_BY_CATEGORY: Record<string, string[]> = {
  wareneinkauf_food: ['lebensmittel', 'wareneingang', 'wareneinkauf'],
  // bewusst OHNE 'wareneingang' — sonst kollidiert non-food mit der food-Kategorie;
  // ein generisches "Wareneingang" wird (Gastronomie-Default) food zugeordnet.
  wareneinkauf_nonfood: ['handelswaren', 'non-food', 'nonfood'],
  betriebskosten_energie: ['energie', 'strom', 'gas', 'heizung'],
  miete: ['miete', 'pacht', 'raumkosten'],
  personal: ['personal', 'lohn', 'gehalt', 'löhne', 'loehne'],
  versicherung: ['versicherung', 'beitrag'],
  marketing: ['werbe', 'werbung', 'marketing', 'reklame'],
  reise: ['reisekosten', 'reise'],
  bewirtung: ['bewirtung'],
  buerokosten: ['bürobedarf', 'buerobedarf', 'büro', 'buero'],
  reparatur: ['reparatur', 'instandhaltung', 'wartung'],
  steuer: ['steuern'],
  kommunikation: ['telekommunikation', 'telefon', 'internet'],
  sonstige_aufwand: ['sonstige'],
};

function pickByHeuristic(
  cats: Array<{ id: string; name: string; type: string }>,
  skrAccount: string,
): { id: string; name: string } | null {
  // Reverse-Lookup über die SSoT: SKR-Konto → System-Kategorie → Needles.
  const categoryId = categoryIdForSkrAccount(skrAccount);
  if (!categoryId) return null;
  const needles = NEEDLES_BY_CATEGORY[categoryId];
  if (!needles) return null;

  // Kein type-Filter — Lexoffice gibt Typen auf Deutsch zurück.
  const candidates = cats.filter((c) => needles.some((n) => c.name.toLowerCase().includes(n)));
  return candidates[0] ?? null;
}
