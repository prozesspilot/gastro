# T072 — Web-Chat: Infra & Deploy (chat.prozesspilot.net live)

**ID:** T072
**Verantwortlich:** Steve
**Priorität:** P0
**Branch:** `steve/T072-webchat-infra`
**Geschätzt:** 1 Tag Claude-Code-Session
**Dependencies:** [T071] — muss in `_done/`
**Ziel-Meilenstein:** Build-out Phase C (Web-Chat-Widget)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

`chat.prozesspilot.net` vom **Healthcheck-Stub** auf die echte Widget-App umstellen: Caddy,
docker-compose-Service, Dockerfile/nginx, CI-Job und Deploy-Image — alles nach dem
`onboarding-wizard`-Muster.

---

## Akzeptanz-Kriterien

- [ ] `web-chat-widget/Dockerfile` (Multi-Stage `node:20-alpine` build → `nginx:1.25-alpine`,
      `npm ci --ignore-scripts`) + eigene `nginx.conf` nach `onboarding-wizard/nginx.conf`:
      `/health`-JSON, `/api/`-Proxy an `backend:3000` **mit `proxy_buffering off`** (SSE),
      SPA-Fallback `try_files $uri /index.html` für `/{token}`, Asset-Cache. `.dockerignore` übernehmen.
- [ ] `docker-compose.prod.yml`: neuer Service `web-chat-widget` analog wizard-Service
      (`ghcr.io/prozesspilot/gastro/web-chat-widget:latest`, Port `127.0.0.1:8084:80`,
      `depends_on backend: service_healthy`, healthcheck, `mem_limit 128m`). Stub auf 8083
      reduzieren/abbauen; RAM-Budget-Kommentar anpassen.
- [ ] `infra/caddy/Caddyfile`: `chat.prozesspilot.net` von `localhost:8083` (Stub) auf
      `localhost:8084` umstellen; CSP analog `setup`-Block; **X-Frame-Options DENY/SAMEORIGIN**
      (eigene Seite, kein Cross-Origin-Embed im Pilot).
- [ ] CI (`.github/workflows/ci-backend.yml`): neuer Job `web-chat-widget` (tsc --noEmit, vitest,
      build) mit `cache-dependency-path web-chat-widget/package-lock.json`.
- [ ] Deploy (`.github/workflows/deploy-staging.yml`): „Build & Push Web-Chat-Widget Image"-Step
      (Tags `latest` + `${{ github.sha }}`); Stub-Build-Step entfernen sobald 8083 weg. Der
      bestehende `chat.prozesspilot.net/health`-Smoke-Step bleibt gültig (neuer nginx liefert `/health`).
- [ ] Migration 124/125 laufen automatisch über `migrate:prod` beim Deploy (verifizieren).

### Tests / Verifikation
- [ ] Lokaler Build des Images grün; `/health` antwortet; SPA-Fallback für `/{token}` greift.
- [ ] CI grün (neuer Job). code-reviewer OK.

---

## Spec-Referenzen
- Referenz: `onboarding-wizard/Dockerfile|nginx.conf`, `docker-compose.prod.yml` (wizard-Service),
  `infra/caddy/Caddyfile` (setup/chat-Blöcke), `.github/workflows/*`
- CLAUDE.md §5.2 (Domains), §5.4 (EU-Hosting)

---

## Notes / Gotchas
- Prod-Env-Änderung greift nur via `docker compose up -d --force-recreate` (Memory `prod-env-change-recreate`).
- **Folge-Ausbau (eigener Task, NICHT hier):** same-origin Support-Einbettung auf der Marketing-
  Domain `prozesspilot.net` — diese nackte Domain ist im Repo noch nicht verdrahtet (kein Caddy-/
  compose-Block). Erst nötig, wenn die Website-Einbettung kommt.

---

## Lessons Learned (Implementierung 2026-06-25)
- **chat-Stub komplett entfernt:** Der `stubs`-Service (compose) + der Healthcheck-Stub-Build-Step
  (deploy) sind raus — chat.* serviert jetzt der `web-chat-widget`-Container (Port 8084). Der alte
  Stub-Container wird beim Deploy via `--remove-orphans` entfernt. `infra/healthcheck-stub/` bleibt
  als ungenutztes Verzeichnis liegen (harmlos; Abbau optional).
- **Gelockte Entscheidung umgesetzt:** EIGENE Seite → Caddy chat-Block `X-Frame-Options DENY` + CSP
  (wie `setup.*`), NICHT das alte „kein DENY, per Iframe einbettbar". Same-origin-Embed auf
  prozesspilot.net = Folge (dann `frame-ancestors`).
- **nginx-Verifikation:** Das Image startet NICHT standalone — `proxy_pass http://backend:3000`
  resolved den Host `backend` nur im compose-Netz (sonst „host not found in upstream"). Das ist
  identisch zum funktionierenden onboarding-wizard-Container; `depends_on: backend: service_healthy`
  stellt im Deploy sicher, dass backend vorher da ist. Verifiziert: `docker build` grün,
  `docker compose config` valide, Caddyfile wird im Deploy via `caddy validate` geprüft.
- CI-Job war schon in T071; T072 = nur Docker/nginx/compose/Caddy/Deploy-Image.
