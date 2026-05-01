/**
 * Customer-Profile-Repository
 *
 * Liest und schreibt customer_profiles inkl. Versionshistorie.
 *
 * Öffentliche API:
 *   getProfile(pool, customerId)             → aktuelles Profil oder Default
 *   upsertProfile(pool, customerId, input)   → vollständiges Speichern
 *   mergeProfile(pool, customerId, patch)    → flacher Merge der Top-Level-Keys
 *
 * Hinweis: Tenant-Isolation wird vor Aufruf in den Routen sichergestellt
 * (siehe profile.routes.ts — der zugehörige Customer wird über das
 * Customer-Repository tenant-gefiltert geladen). Diese Tabelle selbst
 * hat keine RLS-Policy, daher kein withTenant() hier.
 */

import type { Pool, PoolClient } from 'pg';
import type {
  PatchProfileInput,
  ProfileResponse,
  UpsertProfileInput,
} from '../../core/schemas/profile';

// ── Row-Mapping ────────────────────────────────────────────────────────────

interface ProfileRow {
  customer_id:     string;
  profile_version: number;
  modules_enabled: unknown;
  integrations:    unknown;
  routing:         unknown;
  custom:          unknown;
  updated_at:      Date;
  updated_by:      string | null;
}

function rowToResponse(row: ProfileRow): ProfileResponse {
  return {
    customer_id:     row.customer_id,
    profile_version: row.profile_version,
    modules_enabled: (row.modules_enabled as string[]) ?? [],
    integrations:    (row.integrations as Record<string, unknown>) ?? {},
    routing:         (row.routing as Record<string, unknown>) ?? {},
    custom:          (row.custom as Record<string, unknown>) ?? {},
    updated_at:      row.updated_at.toISOString(),
    updated_by:      row.updated_by,
  };
}

function defaultResponse(customerId: string): ProfileResponse {
  return {
    customer_id:     customerId,
    profile_version: 1,
    modules_enabled: [],
    integrations:    {},
    routing:         {},
    custom:          {},
    updated_at:      new Date(0).toISOString(),
    updated_by:      null,
  };
}

// ── Lesen ──────────────────────────────────────────────────────────────────

/**
 * Liefert das Profil. Wenn kein Eintrag existiert, wird ein Default-Objekt
 * (profile_version=1, leere Sammlungen) zurückgegeben — niemals null.
 */
export async function getProfile(
  pool: Pool,
  customerId: string,
): Promise<ProfileResponse> {
  const { rows } = await pool.query<ProfileRow>(
    `SELECT customer_id, profile_version, modules_enabled, integrations,
            routing, custom, updated_at, updated_by
       FROM customer_profiles
      WHERE customer_id = $1`,
    [customerId],
  );
  return rows[0] ? rowToResponse(rows[0]) : defaultResponse(customerId);
}

// ── History ────────────────────────────────────────────────────────────────

export interface ProfileHistoryEntry {
  history_id:      string;
  profile_version: number;
  snapshot:        Record<string, unknown>;
  changed_by:      string | null;
  changed_at:      string;
  change_summary:  string | null;
}

/**
 * Liefert die letzten History-Einträge eines Kunden, neueste zuerst.
 * Standardlimit ist 20 (M02-Spec §2.1).
 *
 * Hinweis: das Schema von `changed_by` ist als Migration 023 nachgereicht
 * (Phase 3) — falls die DB noch nicht migriert wurde, liefern wir 'system'.
 */
export async function listProfileHistory(
  pool: Pool,
  customerId: string,
  limit = 20,
): Promise<ProfileHistoryEntry[]> {
  const { rows } = await pool.query<{
    history_id: string | number;
    profile_version: number;
    snapshot: Record<string, unknown>;
    changed_by: string | null;
    changed_at: Date;
    change_summary: string | null;
  }>(
    `SELECT history_id,
            profile_version,
            snapshot,
            COALESCE(changed_by, 'system') AS changed_by,
            changed_at,
            change_summary
       FROM customer_profile_history
      WHERE customer_id = $1
      ORDER BY changed_at DESC
      LIMIT $2`,
    [customerId, limit],
  );
  return rows.map((r) => ({
    history_id:      String(r.history_id),
    profile_version: r.profile_version,
    snapshot:        r.snapshot,
    changed_by:      r.changed_by ?? 'system',
    changed_at:      r.changed_at.toISOString(),
    change_summary:  r.change_summary,
  }));
}

// ── Schreiben (Upsert mit History) ────────────────────────────────────────

/**
 * Speichert das Profil vollständig. Bei einem bestehenden Eintrag wird
 * der vorherige Snapshot in customer_profile_history geschrieben und
 * profile_version inkrementiert.
 */
export async function upsertProfile(
  pool: Pool,
  customerId: string,
  input: UpsertProfileInput,
): Promise<ProfileResponse> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await upsertWithinTx(client, customerId, {
      modules_enabled: input.modules_enabled ?? [],
      integrations:    input.integrations    ?? {},
      routing:         input.routing         ?? {},
      custom:          input.custom          ?? {},
      updated_by:      input.updated_by      ?? null,
      change_summary:  input.change_summary  ?? null,
    });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lädt das aktuelle Profil, merged den Patch flach (modules_enabled wird
 * ersetzt, integrations/routing/custom werden auf Top-Level-Keys gemerged)
 * und speichert das Ergebnis.
 */
export async function mergeProfile(
  pool: Pool,
  customerId: string,
  patch: PatchProfileInput,
): Promise<ProfileResponse> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await loadCurrentForUpdate(client, customerId);

    const merged = {
      modules_enabled: patch.modules_enabled ?? current.modules_enabled,
      integrations:    { ...current.integrations, ...(patch.integrations ?? {}) },
      routing:         { ...current.routing,      ...(patch.routing      ?? {}) },
      custom:          { ...current.custom,       ...(patch.custom       ?? {}) },
      updated_by:      patch.updated_by     ?? null,
      change_summary:  patch.change_summary ?? null,
    };

    const result = await upsertWithinTx(client, customerId, merged);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Interne Helfer ─────────────────────────────────────────────────────────

interface NormalizedProfileInput {
  modules_enabled: string[];
  integrations:    Record<string, unknown>;
  routing:         Record<string, unknown>;
  custom:          Record<string, unknown>;
  updated_by:      string | null;
  change_summary:  string | null;
}

/** Lädt das aktuelle Profil mit Row-Lock — oder liefert einen Default. */
async function loadCurrentForUpdate(
  client: PoolClient,
  customerId: string,
): Promise<ProfileResponse> {
  const { rows } = await client.query<ProfileRow>(
    `SELECT customer_id, profile_version, modules_enabled, integrations,
            routing, custom, updated_at, updated_by
       FROM customer_profiles
      WHERE customer_id = $1
      FOR UPDATE`,
    [customerId],
  );
  return rows[0] ? rowToResponse(rows[0]) : defaultResponse(customerId);
}

/**
 * Schreibt einen History-Eintrag (falls bereits ein Profil existiert) und
 * führt anschließend ein INSERT … ON CONFLICT DO UPDATE aus, das die
 * Version bei jedem Update um eins erhöht.
 */
async function upsertWithinTx(
  client: PoolClient,
  customerId: string,
  input: NormalizedProfileInput,
): Promise<ProfileResponse> {
  // Vorherige Version snapshotten, falls vorhanden
  const { rows: existing } = await client.query<ProfileRow>(
    `SELECT customer_id, profile_version, modules_enabled, integrations,
            routing, custom, updated_at, updated_by
       FROM customer_profiles
      WHERE customer_id = $1
      FOR UPDATE`,
    [customerId],
  );

  if (existing[0]) {
    const prev = rowToResponse(existing[0]);
    await client.query(
      `INSERT INTO customer_profile_history
         (customer_id, profile_version, snapshot, changed_by, change_summary)
       VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [
        customerId,
        prev.profile_version,
        JSON.stringify(prev),
        input.updated_by ?? 'system',
        input.change_summary,
      ],
    );
  }

  const { rows } = await client.query<ProfileRow>(
    `
    INSERT INTO customer_profiles
      (customer_id, profile_version, modules_enabled, integrations, routing, custom, updated_by)
    VALUES
      ($1, 1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6)
    ON CONFLICT (customer_id) DO UPDATE SET
      profile_version = customer_profiles.profile_version + 1,
      modules_enabled = EXCLUDED.modules_enabled,
      integrations    = EXCLUDED.integrations,
      routing         = EXCLUDED.routing,
      custom          = EXCLUDED.custom,
      updated_by      = EXCLUDED.updated_by,
      updated_at      = now()
    RETURNING customer_id, profile_version, modules_enabled, integrations,
              routing, custom, updated_at, updated_by
    `,
    [
      customerId,
      JSON.stringify(input.modules_enabled),
      JSON.stringify(input.integrations),
      JSON.stringify(input.routing),
      JSON.stringify(input.custom),
      input.updated_by,
    ],
  );

  return rowToResponse(rows[0]);
}
