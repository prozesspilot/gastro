/**
 * T017 — Tests fuer trustProxy-Konfiguration.
 *
 * Wir testen:
 *   1. parseTrustProxy() Parser (alle ENV-Formate korrekt zu Fastify-Typ)
 *   2. Fastify-Integration: req.ip respektiert X-Forwarded-For wenn aktiv
 *
 * Wichtig: Wir importieren NICHT buildApp() (das hat zu viele Side-Effects
 * wie DB-Pool + Redis + S3). Stattdessen bauen wir eine minimale Fastify-
 * Instanz mit demselben trustProxy-Wert und verifizieren das Verhalten.
 */

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { parseTrustProxy } from '../app';

describe('parseTrustProxy', () => {
  it('leerer String → false (Dev/Test-Default, kein Proxy-Trust)', () => {
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('  ')).toBe(false);
  });

  it('"true" → true (allen Proxies vertrauen)', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy(' true ')).toBe(true);
  });

  it('"1" → true (alias)', () => {
    expect(parseTrustProxy('1')).toBe(true);
  });

  it('CIDR-String wird durchgereicht', () => {
    expect(parseTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
    expect(parseTrustProxy('192.168.1.0/24')).toBe('192.168.1.0/24');
  });

  it('einzelne IP wird durchgereicht', () => {
    expect(parseTrustProxy('203.0.113.5')).toBe('203.0.113.5');
  });

  it('Komma-Liste → Array', () => {
    expect(parseTrustProxy('10.0.0.0/8, 172.16.0.0/12')).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
  });

  it('Komma-Liste filtert leere Eintraege', () => {
    expect(parseTrustProxy('10.0.0.0/8,,172.16.0.0/12,')).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
  });

  it('strings sind nicht "false" oder "0" — Strings bleiben Strings', () => {
    // Edge-Case: "false" und "0" als string werden NICHT als false interpretiert.
    // DECISION: Das ist konsistent mit dem ENV-Vertrag (leer = false). Wer
    // explizit deaktivieren will, soll TRUST_PROXY= setzen, nicht "false".
    expect(parseTrustProxy('false')).toBe('false');
    expect(parseTrustProxy('0')).toBe('0');
  });
});

// ── Fastify-Integration ────────────────────────────────────────────────────

describe('Fastify trustProxy-Integration', () => {
  it('OHNE trustProxy: req.ip ignoriert X-Forwarded-For', async () => {
    const app = Fastify({ logger: false, trustProxy: false });
    app.get('/ip', (req) => ({ ip: req.ip, ips: req.ips }));
    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      headers: { 'x-forwarded-for': '203.0.113.42' },
    });
    const body = JSON.parse(res.body);
    expect(body.ip).not.toBe('203.0.113.42');
    // req.ips ist undefined wenn trustProxy=false
    expect(body.ips).toBeUndefined();
    await app.close();
  });

  it('MIT trustProxy=true: req.ip nimmt X-Forwarded-For', async () => {
    const app = Fastify({ logger: false, trustProxy: true });
    app.get('/ip', (req) => ({ ip: req.ip, ips: req.ips }));
    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      headers: { 'x-forwarded-for': '203.0.113.42' },
    });
    const body = JSON.parse(res.body);
    expect(body.ip).toBe('203.0.113.42');
    expect(body.ips).toContain('203.0.113.42');
    await app.close();
  });

  it('MIT trustProxy=CIDR: vertraut nur dieser Range', async () => {
    // Inject kommt von 127.0.0.1 → NICHT in 203.0.113.0/24 → req.ip NICHT von Header
    const app = Fastify({ logger: false, trustProxy: '203.0.113.0/24' });
    app.get('/ip', (req) => ({ ip: req.ip }));
    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      headers: { 'x-forwarded-for': '198.51.100.7' },
    });
    const body = JSON.parse(res.body);
    // Connection kam von 127.x.x.x (inject-Default) → nicht in CIDR → ignoriert XFF
    expect(body.ip).not.toBe('198.51.100.7');
    await app.close();
  });

  it('Multi-Hop X-Forwarded-For: nimmt aeusserste IP', async () => {
    const app = Fastify({ logger: false, trustProxy: true });
    app.get('/ip', (req) => ({ ip: req.ip, ips: req.ips }));
    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      headers: { 'x-forwarded-for': '203.0.113.42, 10.0.0.1, 10.0.0.2' },
    });
    const body = JSON.parse(res.body);
    // Fastify nimmt die erste (aeusserste) IP als Client
    expect(body.ip).toBe('203.0.113.42');
    expect(body.ips.length).toBeGreaterThan(1);
    await app.close();
  });
});
