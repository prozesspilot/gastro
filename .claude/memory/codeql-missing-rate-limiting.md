---
name: codeql-missing-rate-limiting
description: "Eine Route-Datei anfassen lässt CodeQL js/missing-rate-limiting als NEUEN High-Alert auftauchen (globaler Limiter wird statisch nicht über Plugin-Grenzen erkannt) → PR-CodeQL-Check rot. Fix: explizites Per-Route config.rateLimit."
metadata: 
  node_type: memory
  type: reference
  originSessionId: ad4050f3-ed30-4beb-a342-f948a47662f3
---

CodeQL läuft als PR-Check („CodeQL" / GitHub Advanced Security, getrennt vom „Analyze (javascript-typescript)"-Job). Es meldet `js/missing-rate-limiting` (High) für **jede Route-Handler-Datei, die im PR geändert wurde** und Authorization/DB-Writes macht — obwohl `app.ts` einen **globalen** `@fastify/rate-limit` (`global: true`, 100/min pro IP/Tenant) registriert. Grund: CodeQL kann die globale Plugin-Registrierung statisch NICHT zu Routen in separat registrierten Plugin-Dateien verfolgen. Solange man die Datei nicht anfasst, bleibt der Alert im Baseline; sobald man sie ändert, taucht er als „**new alert in code changed by this pull request**" auf → CodeQL-Check **rot** → `mergeStateStatus` blockiert (per `--admin` umgehbar, aber unschön).

**Fix (echtes Defense-in-Depth, kein bloßes Appeasement):** explizites Per-Route-Limit setzen. `@fastify/rate-limit` augmentiert `FastifyContextConfig` global (Import in `app.ts`), daher typecheckt das überall:

```ts
const RL = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
app.post('/:token/oauth/sumup/start', RL, handler);   // opts als 2. Arg vor dem Handler
```

Greift nur, wenn das Plugin registriert ist (Prod) — in Tests (eigene Mini-App ohne Plugin) wird `config.rateLimit` ignoriert, **bricht also keine Tests**. CodeQL erkennt das Per-Route-`config.rateLimit` und clear-t den Alert (verifiziert T067/PR #160: „No new alerts" nach dem Fix). Bei einer geänderten Route-Datei am besten ALLE Handler der Datei limitieren (CodeQL flaggt sonst whack-a-mole den nächsten). Sinnvolle Werte: öffentliche Token-/OAuth-Brücken eng (10–20/min), Staff-/Standard-Routen 30/min.

Prüfen welche Routen geflaggt sind: `gh api repos/prozesspilot/gastro/check-runs/<id>/annotations` (id aus `gh pr checks <pr>` Link `/runs/<id>`).
