---
name: biome-lint-cache-gotcha
description: "npm run lint (biome) kann lokal cache-bedingt grün melden, obwohl CI rot ist — geänderte Files direkt mit biome check prüfen."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a7581dcb-1494-43f9-8e09-6b49b4a536c9
---

`npm run lint` (= `biome check src tests`) im Backend kann lokal **fälschlich
grün** melden, obwohl dieselbe biome-Version (1.9.4) in CI Fehler findet —
biome cached Ergebnisse, und nach einem Edit (besonders wenn per Script/sed
statt über das Edit-Tool geschrieben) wird teils ein veraltetes „ok" geliefert.

**Why:** In dieser Session zweimal passiert — ein `noMisleadingCharacterClass`
(Regex mit Combining-Mark-Range `/[̀-ͯ]/`) und ein Formatter-Verstoß
(zu lange Zeile) rutschten lokal durch `npm run lint` durch, brachen aber CI.
Das kostete je eine zusätzliche CI-Runde.

**How to apply:**
- Nach Edits an Backend-Files die geänderten Files **direkt** prüfen:
  `npx biome check <pfad/zu/file.ts>` — das recomputed zuverlässig.
- Vor dem Push für Backend-PRs einmal `npx biome check --write src tests`
  laufen lassen (auto-fixt Formatierung) und dann `npm run lint` zur Bestätigung.
- Bekannte biome-1.9.4-Regeln, die hier zuschlagen:
  `lint/suspicious/noMisleadingCharacterClass` (Combining-Mark-Range in
  Character-Class → stattdessen Unicode-Property `\p{M}` mit u-Flag) und der
  Formatter (lange Objekt-Literale mehrzeilig).
- Hängt zusammen mit [[webapp-test-stack]] (CI nutzt Node 20; lokal ggf. Node 26
  → Webapp-Tests divergieren).
