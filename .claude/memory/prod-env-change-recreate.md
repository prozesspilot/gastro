---
name: prod-env-change-recreate
description: "Env-Änderungen auf Prod (.env.prod) brauchen 'docker compose up -d --force-recreate', nicht 'restart' — sonst greifen sie nicht."
metadata: 
  node_type: memory
  type: reference
  originSessionId: a7581dcb-1494-43f9-8e09-6b49b4a536c9
---

Das Prod-Backend liest seine Env aus **`.env.prod`** (siehe `docker-compose.prod.yml`,
`env_file: - .env.prod`) auf dem IONOS-Server `root@87.106.8.111:/opt/gastro/`.

**Wichtig:** `docker compose restart backend` lädt geänderte `env_file`-Werte **NICHT**
neu — env_file wird nur beim **Erstellen** des Containers gelesen. Nach einer
`.env.prod`-Änderung muss man `docker compose -f docker-compose.prod.yml up -d
--force-recreate backend` ausführen, sonst läuft der Container mit der alten Env weiter.

**Why:** Beim Discord-Login-Fix (DISCORD_REDIRECT_URI) führte `restart` dazu, dass der
Live-Endpoint weiter den alten Wert ausgab, obwohl die Datei korrekt war.

**How to apply:**
- Env-Wert auf Prod prüfen, **ohne** SSH (das ist als root-Prod-Aktion vom Harness
  geblockt): den öffentlichen Endpoint von außen abfragen. Z.B. zeigt
  `curl -sS -D - -o /dev/null https://admin.prozesspilot.net/api/v1/auth/discord/login`
  im `Location`-Header die aktuell genutzte `redirect_uri` → Ground-Truth ohne Server-Login.
- IONOS-Befehle für den User als `!`-Befehl bereitstellen (läuft in dessen Session).
  **Kurz halten** (~<100 Zeichen, eine Zeile) — lange verkettete SSH-Einzeiler brechen
  beim Einfügen um, Zeilenumbrüche zerlegen das Kommando (`command not found`).
- Discord-OAuth: `DISCORD_REDIRECT_URI` muss auf `/api/v1/auth/discord/callback` enden
  (Route + Prefix, via nginx `/api/`-Proxy) und identisch im Discord Developer Portal
  stehen — sonst stiller Login-Loop. Siehe Config-Default + Startup-Warnung in `config.ts`.
