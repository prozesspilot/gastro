import type { FastifyInstance } from 'fastify';

const CHECK_TIMEOUT_MS = 2_000;

interface HealthOutcome<T> {
  ok:     boolean;
  data?:  T;
  error?: string;
}

async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
): Promise<HealthOutcome<T>> {
  return Promise.race([
    promise.then((v) => ({ ok: true, data: v }) as HealthOutcome<T>),
    new Promise<HealthOutcome<T>>((resolve) =>
      setTimeout(
        () => resolve({ ok: false, error: `${label}:timeout` }),
        CHECK_TIMEOUT_MS,
      ),
    ),
  ]).catch((err: Error) => ({ ok: false, error: err.message }));
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // DECISION: /health prueft DB-Verbindung und gibt 503 zurueck wenn sie fehlt.
  // Dies ist die Health-Probe fuer Docker HEALTHCHECK und Kubernetes Liveness.
  app.get('/health', async (_request, reply) => {
    const dbOk = await app.db
      .query('SELECT 1')
      .then(() => true)
      .catch(() => false);

    const status = dbOk ? 200 : 503;
    return reply.status(status).send({
      ok:        dbOk,
      version:   process.env.APP_VERSION ?? process.env.npm_package_version ?? 'dev',
      timestamp: new Date().toISOString(),
      uptime:    Math.floor(process.uptime()),
      checks: {
        database: dbOk ? 'ok' : 'error',
      },
    });
  });

  app.get('/ready', async (_req, reply) => {
    const [dbCheck, redisCheck, migrationsCheck] = await Promise.all([
      withTimeout(
        app.db.query<{ count: string }>(
          'SELECT COUNT(*) AS count FROM pg_stat_activity WHERE datname = current_database()',
        ),
        'db',
      ),
      withTimeout(app.redis.ping(), 'redis'),
      withTimeout(
        app.db.query<{ version: string; total: string }>(
          `SELECT
             (SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1) AS version,
             (SELECT COUNT(*)::text FROM schema_migrations)                         AS total`,
        ),
        'migrations',
      ),
    ]);

    const dbConnected    = dbCheck.ok;
    const redisConnected = redisCheck.ok;
    const migrationsOk   = migrationsCheck.ok;

    const poolSize = (app.db as unknown as { totalCount?: number }).totalCount ?? null;

    const dbInfo = {
      connected: dbConnected,
      pool_size: poolSize,
      active_connections: dbCheck.ok && dbCheck.data?.rows?.[0]
        ? parseInt(dbCheck.data.rows[0].count, 10)
        : null,
    };

    const redisInfo = { connected: redisConnected };

    const migrationsInfo = migrationsOk && migrationsCheck.data?.rows?.[0]
      ? {
          last_applied: migrationsCheck.data.rows[0].version ?? null,
          total:        parseInt(migrationsCheck.data.rows[0].total ?? '0', 10),
        }
      : { last_applied: null, total: 0 };

    const allOk = dbConnected && redisConnected && migrationsOk;
    const body = {
      ok:         allOk,
      db:         dbInfo,
      redis:      redisInfo,
      migrations: migrationsInfo,
    };

    if (!allOk) {
      return reply.code(503).send(body);
    }
    return body;
  });
}
