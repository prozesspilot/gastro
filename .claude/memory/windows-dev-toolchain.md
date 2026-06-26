---
name: windows-dev-toolchain
description: "Lokale Node/npm-Toolchain auf Steves Windows-Rechner — Pfad, PATH-Quirk, autocrlf, DB-Tests"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 1f4a929c-5ad8-4705-ae30-68ece6a32ff1
---

Steves Windows-Dev-Rechner hatte ursprünglich KEIN Node/npm (nur Adobe-gebundelte `node.exe`, kein npm, kein WSL/nvm). Am 2026-06-26 installiert: portables **Node 20.20.2 + npm 10.8.2** unter `C:\Users\steve\AppData\Local\nodejs20` (offizielles ZIP, Checksumme verifiziert, kein Admin, User-PATH dauerhaft ergänzt). CI nutzt Node 20 — exakt getroffen. `backend/` ist kein Monorepo; `npm ci` mit `backend/package-lock.json`.

**Quirks (wichtig für jede Session):**
- **PATH-Prefix nötig INNERHALB einer laufenden Claude-Code-Session** (der Host cached den Environment-Block bis Neustart): jedem npm/node-Befehl `$env:Path = "$env:LOCALAPPDATA\nodejs20;$env:Path"` voranstellen. Nach einem Claude-Code-Neustart ist node/npm automatisch auf PATH.
- **git `core.autocrlf=false`** ist repo-lokal gesetzt (war `true`, Repo hat KEINE `.gitattributes`). Mit `true` checkt git auf Windows LF→CRLF aus → `biome check` (LF-only) wirft Format-Fehler auf ALLEN vorbestehenden Dateien, obwohl CI (Linux/LF) grün ist. NICHT zurückstellen. Working-Tree wurde per `git rm --cached -r . && git reset --hard` auf LF renormalisiert (kein Commit, Blobs waren schon LF). Sauberer Repo-Fix wäre eine `.gitattributes` mit `* text=auto eol=lf` (gut für Mac↔Windows-Sync).
- **Backend-DB-Integrationstests** (`src/__tests__/integration/*`, `tests/...`) brauchen ein lokales Postgres `prozesspilot_test` (default `postgresql://pp:pp@localhost:5432/prozesspilot_test`). Ohne DB skippen sie sauber (`dbAvailable=false`); ohne `CI=true` kein Hard-Fail. CI fährt sie echt. Lokal: `npm test` ≈ 811 passed / 22 skipped, Exit 0.
- npm-Befehle mit Netzwerk (`npm ci`/`install`) brauchen deaktivierte Sandbox (Egress).

Damit laufen Build/Lint/Unit-Tests lokal; nur die DB-Tests brauchen zusätzlich ein Docker-Postgres. Pendant für Prod-Env-Änderungen: [[prod-env-change-recreate]].
