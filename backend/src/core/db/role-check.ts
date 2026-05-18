/**
 * D-Role-Check — Verhindert Production-Start mit privilegierten DB-Rollen.
 *
 * Hintergrund (T011 Review B4): Postgres-Superuser und Rollen mit
 * `BYPASSRLS`-Attribut umgehen Row-Level-Security automatisch. Wenn das
 * Backend in Production mit einer solchen Rolle läuft, sind alle
 * RLS-Policies in den Migrations wirkungslos und ein Bug im Backend
 * (z. B. vergessenes `SET LOCAL app.current_tenant`) führt zu sofortigem
 * Cross-Tenant-Datenleak. Das ist DSGVO-Worst-Case bei Buchhaltungsdaten.
 *
 * Diese Funktion crasht den Server-Start, falls Production gegen so eine
 * Rolle verbunden wird. Im Development warnt sie nur (wir nutzen lokal
 * Superuser für Bequemlichkeit).
 */

import type { Pool } from 'pg';
import { logger } from '../logger';

export interface RoleInfo {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
}

export async function getCurrentDbRoleInfo(pool: Pool): Promise<RoleInfo> {
  const { rows } = await pool.query<RoleInfo>(
    `SELECT rolname, rolsuper, rolbypassrls
     FROM pg_roles
     WHERE rolname = current_user`,
  );
  if (rows.length === 0) {
    throw new Error('Konnte aktuelle DB-Rolle nicht auflösen');
  }
  return rows[0];
}

/**
 * Wird beim Server-Start aufgerufen. In Production werden privilegierte
 * Rollen abgelehnt. In Dev/Test wird nur gewarnt.
 */
export async function assertNonPrivilegedDbRole(
  pool: Pool,
  env: 'development' | 'production' | 'test',
): Promise<void> {
  const info = await getCurrentDbRoleInfo(pool);
  const isPrivileged = info.rolsuper || info.rolbypassrls;

  if (!isPrivileged) {
    logger.info(
      { role: info.rolname },
      'DB-Rolle ist non-privileged — RLS-Policies werden erzwungen.',
    );
    return;
  }

  if (env === 'production') {
    logger.error(
      { role: info.rolname, rolsuper: info.rolsuper, rolbypassrls: info.rolbypassrls },
      'FATAL: Backend läuft in Production mit privilegierter DB-Rolle. RLS wäre wirkungslos.',
    );
    throw new Error(
      `FATAL: DB-Rolle '${info.rolname}' ist Superuser oder hat BYPASSRLS. Verwende in Production einen non-privileged Account (siehe backend/migrations/SCHEMA.md § 7).`,
    );
  }

  logger.warn(
    { role: info.rolname, rolsuper: info.rolsuper, rolbypassrls: info.rolbypassrls },
    'Dev-Modus: DB-Rolle ist privilegiert — RLS wird in dieser Session umgangen. ' +
      'OK für lokale Entwicklung, in Production verboten.',
  );
}
