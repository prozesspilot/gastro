# ADR-003: Plugin-Sandbox-Library

**Status:** Vorgeschlagen — (noch) nicht relevant; kein Code-Sandboxing umgesetzt (siehe Ist-Stand)  
**Datum:** 2026-05-04  
**Entscheider:** Solo-Agent (autonom/solo)

> **⚠️ Ist-Stand (2026-06-06): kein Code-Sandboxing umgesetzt — die Frage stellt sich (noch) nicht.** Das Plugin-System führt **keinen** Kunden-Code aus. `backend/src/modules/plugin-system/services/plugin-dispatcher.ts` sendet nur **HTTP-POST an registrierte Plugin-Webhooks** (HMAC-signiert, SSRF-Schutz, 10s-Timeout) — Plugins sind externe Services, keine sandboxed In-Process-Ausführung. `isolated-vm` ist **keine** Dependency. Diese ADR wird erst relevant, falls echtes In-Process-Code-Sandboxing gebaut wird. Das Plugin-System ist derzeit tot/eingefroren (siehe `.claude/CLAUDE.md` §3).

## Kontext

Das Plugin-System (H1 aus der Produktions-Härtungs-Liste) erlaubt Pro-Kunden, Custom-Code auszuführen. `vm2` ist deprecated und enthält bekannte RCE-Schwachstellen.

## Optionen

| Library | Sicherheit | Performance | Status |
|---------|-----------|-------------|--------|
| **isolated-vm** | Sehr hoch (V8 Isolate) | Gut | Aktiv |
| **vm2** | Niedrig (bekannte Sandbox-Escapes) | Gut | DEPRECATED |
| **Quickjs-Emscripten** | Hoch (eigene JS-Engine) | Mittel | Aktiv |
| **Worker Threads** | Mittel (Node-Sandbox) | Mittel | Aktiv |

## Entscheidung

**`isolated-vm`** für Plugin-Code-Ausführung.

**Begründung:**
1. Echte V8-Isolate-Sandbox — kein Zugriff auf Node.js-Globals
2. Konfigurierbare Memory-Limits und CPU-Timeouts
3. Aktiv gewartet, weit verbreitet (Cloudflare Workers nutzt ähnliches Konzept)
4. TypeScript-Definitionen vorhanden

**vm2 wird nicht verwendet** — zu viele CVEs, projekt eingestellt.

## Ressource-Limits

```typescript
const isolate = new ivm.Isolate({
  memoryLimit: 64,    // 64 MB
  inspector: false,
});
const context = await isolate.createContext();
const timeout = 5000; // 5 Sekunden max

const result = await isolate.compileScript(userCode)
  .run(context, { timeout });
```

## Konsequenzen

- `isolated-vm` als npm-Dependency (enthält native Binaries → Build in Docker nötig)
- Audit-Log für jede Plugin-Ausführung (wer, wann, welche Eingabe/Ausgabe)
- Resource-Limits: 64MB RAM, 5s CPU-Zeit
- Tests: Unit-Tests für Sandbox-Grenzen (memory exhaustion, infinite loop)
