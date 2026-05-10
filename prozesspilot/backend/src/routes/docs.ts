/**
 * /api-docs — liefert die OpenAPI-Spezifikation als YAML oder JSON.
 *
 * Liest docs/openapi.yaml relativ zum Projekt-Root.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { parse as parseYaml } from 'yaml';

// Cache, damit wir die Datei nur einmal lesen
let cachedYaml: string | null = null;
let cachedJson: unknown = null;

function load(): { yaml: string; json: unknown } {
  if (cachedYaml === null || cachedJson === null) {
    // backend/src/routes → ../../../docs/openapi.yaml
    const path = join(__dirname, '..', '..', '..', 'docs', 'openapi.yaml');
    cachedYaml = readFileSync(path, 'utf-8');
    cachedJson = parseYaml(cachedYaml);
  }
  return { yaml: cachedYaml, json: cachedJson };
}

export async function docsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api-docs', (_req, reply) => {
    try {
      const { yaml } = load();
      return reply.header('content-type', 'text/yaml; charset=utf-8').send(yaml);
    } catch (err) {
      return reply.code(500).send({
        ok: false,
        error: { code: 'DOCS_NOT_FOUND', message: (err as Error).message },
      });
    }
  });

  app.get('/api-docs.json', (_req, reply) => {
    try {
      const { json } = load();
      return reply.send(json);
    } catch (err) {
      return reply.code(500).send({
        ok: false,
        error: { code: 'DOCS_NOT_FOUND', message: (err as Error).message },
      });
    }
  });
}
