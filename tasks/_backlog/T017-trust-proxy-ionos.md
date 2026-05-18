# T017 — trustProxy für IONOS-Reverse-Proxy konfigurieren

> **Owner:** server (Andreas / IONOS-Infra)
> **Geschätzt:** 1 Tag
> **Priorität:** P0 (Blocker für Production — IP-Rate-Limiting funktioniert sonst nicht korrekt)
> **Dependencies:** T012 (Caddy-Setup)
> **Welle:** 1
> **Entdeckt durch:** Code-Review T002 (PR #22, Review #2)

---

## Problem

`buildApp()` in `backend/src/app.ts` initialisiert Fastify ohne `trustProxy: true`. In IONOS-Production läuft das Backend hinter einem Reverse-Proxy (Caddy/Load-Balancer). Dadurch gibt `req.ip` immer die **Proxy-IP** (z. B. `10.x.x.x`) zurück, nicht die echte Client-IP.

**Konkrete Auswirkungen:**
- Das IP-Rate-Limit für Notfall-Login (`notfall:rl:ip:<ip>`) sperrt alle Clients gemeinsam nach 5 Fehlversuchen vom Proxy — **DoS-Vektor**: ein Angreifer kann legitime Geschäftsführer aussperren
- Das IP-Rate-Limit in der globalen `@fastify/rate-limit`-Konfiguration (100 req/min) betrifft ebenfalls alle Clients gemeinsam
- Gilt auch für Discord-OAuth und alle anderen Endpoints

## Akzeptanz-Kriterien

- [ ] `buildApp()` in `app.ts` bekommt `trustProxy: true` (oder spezifischer CIDR des IONOS-Loadbalancers)
- [ ] `req.ip` gibt korrekte Client-IP zurück (verifikation via Test-Endpoint oder Logging)
- [ ] IONOS-Loadbalancer setzt `X-Forwarded-For`-Header korrekt (Caddy-Config prüfen)
- [ ] Smoke-Test: Rate-Limit auf Notfall-Login greift pro tatsächlicher Client-IP

## Implementierungs-Hinweise

```typescript
// app.ts — Option A: alle Proxies vertrauen (einfach, akzeptabel für IONOS-VPS)
const app = Fastify({
  logger: pinoLogger,
  trustProxy: true,
});

// Option B: nur IONOS-Loadbalancer-IP/CIDR vertrauen (sicherer)
const app = Fastify({
  logger: pinoLogger,
  trustProxy: '10.0.0.0/8', // IONOS-internes Netz anpassen
});
```

Caddy muss `X-Forwarded-For` korrekt forwarden:
```caddy
reverse_proxy localhost:3000 {
  header_up X-Forwarded-For {remote_host}
}
```

## Sicherheits-Anker

- Nie `trustProxy: true` ohne Verifikation dass wirklich nur bekannte Proxies `X-Forwarded-For` setzen
- Option B (spezifischer CIDR) ist Production-Best-Practice

## Referenzen

- Fastify-Docs: https://fastify.dev/docs/latest/Reference/Server/#trustproxy
- Entdeckt in PR #22 Review #2 (T002 Notfall-Login)
