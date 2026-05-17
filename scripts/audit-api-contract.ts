#!/usr/bin/env node
/**
 * A2 — API-Contract-Audit
 *
 * Extrahiert alle apiRequest/apiBlob-Aufrufe aus webapp/src/api/ und
 * vergleicht gegen Backend-Routen. Nutzt ein Whitelist-Approach:
 * Bekannte Backend-Routen werden aus dem app.ts-Register-Pattern + Route-Dateien
 * kombiniert.
 *
 * Exit-Code 0 = OK, 1 = ungemappte Calls.
 * Usage: npx tsx scripts/audit-api-contract.ts [--verbose]
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT           = path.resolve(__dirname, '..');
const WEBAPP_API_DIR = path.join(ROOT, 'webapp/src/api');
const BACKEND_DIR    = path.join(ROOT, 'backend/src');

// ── 1. Webapp-Calls extrahieren ───────────────────────────────────────────

interface ApiCall {
  file:        string;
  method:      string;
  pathPattern: string;
}

function extractWebappCalls(): ApiCall[] {
  const calls: ApiCall[] = [];

  const files = fs.readdirSync(WEBAPP_API_DIR)
    .filter((f) => f.endsWith('.ts') && f !== '_client.ts' && !f.endsWith('.test.ts'))
    .map((f) => path.join(WEBAPP_API_DIR, f));

  for (const file of files) {
    const src     = fs.readFileSync(file, 'utf-8');
    const relFile = path.relative(ROOT, file);
    const lines   = src.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match apiRequest or apiBlob with string or template literal path
      const staticM = /(?:apiRequest(?:<[^>]*>)?\s*\(|apiBlob\s*\()\s*'(\/[^']*)'/.exec(line);
      const tmplM   = /(?:apiRequest(?:<[^>]*>)?\s*\(|apiBlob\s*\()\s*`(\/[^`]*)`/.exec(line);
      const raw = staticM?.[1] ?? tmplM?.[1];
      if (!raw) continue;

      // Strip query string (including dynamic query like ${qs}); normalise template params → :param
      const pathPattern = raw
        .replace(/\$\{qs[^}]*\}.*$/, '')  // remove trailing ${qs} and anything after
        .replace(/\?.*$/, '')              // remove static query string
        .replace(/\$\{[^}]+\}/g, ':param') // ${foo} → :param
        .replace(/\/+$/, '');              // trailing slash

      // HTTP method from local context
      const ctx  = lines.slice(Math.max(0, i - 4), i + 6).join('\n');
      const mm   = /method:\s*'([A-Z]+)'/.exec(ctx);
      const method = mm?.[1] ?? 'GET';

      calls.push({ file: relFile, method, pathPattern });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return calls.filter((c) => {
    const key = `${c.method}:${c.pathPattern}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── 2. Backend-Routen aus app.ts + route files ────────────────────────────

/**
 * Parst app.ts um den Mapping: importedFunctionName → prefix zu erhalten.
 * Beispiel: register(customerRoutes, { prefix: '/customers' })
 *   → { customerRoutes: '/customers' }
 */
function parseAppTsPrefixes(appTs: string): Map<string, string[]> {
  // Extract: register(fnName, { prefix: '...' })
  const re = /register\(\s*([A-Za-z0-9_]+)\s*,\s*\{\s*prefix:\s*'([^']+)'\s*\}/g;
  const map = new Map<string, string[]>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(appTs)) !== null) {
    const fn     = m[1];
    const prefix = m[2];
    if (!map.has(fn)) map.set(fn, []);
    map.get(fn)!.push(prefix);
  }
  return map;
}

/**
 * Gibt alle TS-Dateien in einem Verzeichnis (rekursiv).
 */
function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      out.push(...walkTs(full));
    else if (e.isFile() && e.name.endsWith('.ts'))
      out.push(full);
  }
  return out;
}

interface BackendRoute { method: string; fullPath: string; }

function extractBackendRoutes(): BackendRoute[] {
  const appTsPath = path.join(BACKEND_DIR, 'app.ts');
  const appTs     = fs.readFileSync(appTsPath, 'utf-8');

  // Build fnName → module-prefix mapping (inner prefixes inside /api/v1)
  const fnPrefixMap = parseAppTsPrefixes(appTs);

  // Also get import → file mapping from app.ts
  const importRe = /import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g;
  const importMap = new Map<string, string>(); // fnName → absolute file
  let im: RegExpExecArray | null;
  while ((im = importRe.exec(appTs)) !== null) {
    const names   = im[1].split(',').map((n) => n.trim()).filter(Boolean);
    const relPath = im[2];
    const absPath = path.resolve(path.dirname(appTsPath), relPath);
    for (const name of names) {
      importMap.set(name, absPath);
    }
  }

  // Build list of (prefix, routeFile) pairs
  const pairs: Array<{ prefix: string; file: string }> = [];

  for (const [fn, prefixes] of fnPrefixMap) {
    const file = importMap.get(fn);
    if (!file) continue;
    for (const prefix of prefixes) {
      // Check both direct file and .ts extension
      for (const candidate of [file, `${file}.ts`, `${file}/index.ts`]) {
        if (fs.existsSync(candidate)) {
          pairs.push({ prefix, file: candidate });
          break;
        }
      }
    }
  }

  // For each route file extract local paths + combine with prefix
  const routes: BackendRoute[] = [];
  const localRouteRe = /(?:app|fastify)\.(get|post|put|patch|delete|head)\s*(?:<[^>]*>)?\s*\(\s*['`]([^'`]+)['`]/gi;

  const seen = new Set<string>();

  // Also scan routes registered directly (no prefix — for /health etc.)
  for (const { prefix, file } of pairs) {
    const src = fs.readFileSync(file, 'utf-8');
    let m: RegExpExecArray | null;
    localRouteRe.lastIndex = 0;
    while ((m = localRouteRe.exec(src)) !== null) {
      const method    = m[1].toUpperCase();
      const localPath = m[2];
      const full      = `/api/v1${prefix}${localPath}`.replace(/\/+/g, '/');
      const key       = `${method}:${full}`;
      if (!seen.has(key)) {
        seen.add(key);
        routes.push({ method, fullPath: full });
      }
    }
  }

  // Scan ALL route files for routes registered at top-level (health, docs, webhooks)
  const allRouteFiles = walkTs(BACKEND_DIR).filter((f) => /routes?\.ts$/.test(path.basename(f)));
  for (const file of allRouteFiles) {
    const src = fs.readFileSync(file, 'utf-8');
    let m: RegExpExecArray | null;
    localRouteRe.lastIndex = 0;
    while ((m = localRouteRe.exec(src)) !== null) {
      const method    = m[1].toUpperCase();
      const localPath = m[2];
      // Store as-is for raw matching
      const key = `${method}:raw:${localPath}`;
      if (!seen.has(key)) {
        seen.add(key);
        routes.push({ method, fullPath: localPath });
      }
    }
  }

  return routes;
}

// ── 3. Matching ───────────────────────────────────────────────────────────

function normPath(p: string): string {
  return p
    .replace(/:[^/]+/g, ':X')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function isMatched(call: ApiCall, routes: BackendRoute[]): boolean {
  // The webapp calls /api/v1 + call.pathPattern implicitly (BASE = /api/v1)
  const full     = `/api/v1${call.pathPattern}`.replace(/\/+/g, '/');
  const normFull = normPath(full);
  const normRaw  = normPath(call.pathPattern);

  for (const r of routes) {
    const nr = normPath(r.fullPath);
    if (nr === normFull || nr === normRaw) return true;
  }
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  const verbose = process.argv.includes('--verbose');
  console.log('ProzessPilot API-Contract-Audit\n');

  const calls  = extractWebappCalls();
  const routes = extractBackendRoutes();

  console.log(`Webapp API-Calls (dedupliziert): ${calls.length}`);
  console.log(`Backend-Routen erkannt:          ${routes.length}\n`);

  const missing: ApiCall[] = [];
  const matched: ApiCall[] = [];

  for (const call of calls) {
    (isMatched(call, routes) ? matched : missing).push(call);
  }

  console.log(`Matched:  ${matched.length}`);
  console.log(`Missing:  ${missing.length}\n`);

  if (missing.length > 0) {
    console.log('WEBAPP-CALLS OHNE BACKEND-ROUTE:');
    console.log('─'.repeat(70));
    for (const c of missing) {
      console.log(`  [${c.method.padEnd(6)}] /api/v1${c.pathPattern}`);
      console.log(`             ${c.file}`);
    }
    console.log('');
    console.log('Hinweis: Einige Calls können korrekt sein wenn die Route dynamisch');
    console.log('         registriert wird oder der Prefix nicht in app.ts steht.');
    console.log('');
  }

  if (matched.length > 0 && missing.length === 0) {
    console.log('OK — Alle UI-API-Calls haben eine Backend-Route.');
  }

  if (verbose) {
    console.log('\nAlle gematchten Calls:');
    for (const c of matched) console.log(`  [${c.method.padEnd(6)}] ${c.pathPattern}`);
    console.log('\nAlle erkannten Backend-Routen (mit /api/v1):');
    for (const r of routes) {
      if (r.fullPath.startsWith('/api/v1')) console.log(`  [${r.method.padEnd(6)}] ${r.fullPath}`);
    }
  }

  process.exit(missing.length > 0 ? 1 : 0);
}

main();
