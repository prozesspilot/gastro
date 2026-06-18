# T017 — Onboarding-Wizard live auf setup.prozesspilot.net (Deploy)

**ID:** T017
**Owner:** Steve
**Priorität:** P1 (macht T016 sichtbar — Build-out Phase B)
**Geschätzt:** S–M
**Anker:** T016 (PR #150) · `.github/workflows/deploy-staging.yml` · `docker-compose.prod.yml` · `infra/caddy/Caddyfile` · [[buildout-phase-status]]

---

## Problem

T016 hat die `onboarding-wizard/`-App gebaut, aber **nicht deployt**. setup.prozesspilot.net zeigt weiterhin den **Healthcheck-Stub** („wird eingerichtet") — der Stub hält die Subdomain „bis T016" warm. Merge ≠ live.

## Was zu tun ist

Den Stub auf setup.* durch die echte Wizard-App ersetzen — Serving-Modell exakt wie die Mitarbeiter-Webapp gespiegelt:

1. **`onboarding-wizard/Dockerfile`** — Multi-Stage (node:20-alpine build → nginx:1.25-alpine serve), wie `webapp/Dockerfile`. Kein VITE_-Build-Arg (Wizard nutzt relativen `/api/v1/wizard`).
2. **`onboarding-wizard/nginx.conf`** — wie `webapp/nginx.conf`: `/api/` → `backend:3000` (Least-Privilege: **kein** `/webhooks/`-Proxy — der Wizard ruft nur `/api/v1/wizard`, anders als die webapp), statische Assets cachen, **SPA-Fallback** `try_files … /index.html` (Pflicht für die `/<token>`-Routen), plus **`/health`-Endpoint** (Deploy-Smoke curlt `setup.prozesspilot.net/health`).
3. **`onboarding-wizard/.dockerignore`** — node_modules/dist/coverage raus.
4. **`docker-compose.prod.yml`** — neuer Service `onboarding-wizard` (Bind `127.0.0.1:8082:80`, übernimmt setups Port vom Stub); `stubs`-Service nur noch `127.0.0.1:8083:8080` (chat). RAM: ~128 MB — gedeckt durch die per T064 freigewordene n8n-Reservierung (~800 MB).
5. **`infra/caddy/Caddyfile`** — setup-Block: Kommentar „Stub bis T016" → „Onboarding-Wizard"; CSP ergänzen (self + Google-Fonts, wie webapp). Route `localhost:8082` bleibt.
6. **`.github/workflows/deploy-staging.yml`** — 4. Build-&-Push-Step für `ghcr.io/.../onboarding-wizard` (context `./onboarding-wizard`).

## Akzeptanz-Kriterien

- [ ] Wizard-Dockerfile + nginx.conf (API-Proxy + SPA-Fallback + `/health`) + .dockerignore.
- [ ] `docker-compose.prod.yml`: Wizard-Service auf 8082; Stub nur noch chat (8083).
- [ ] Caddyfile setup-Block aktualisiert (Wizard, CSP); `infra/caddy/test-config.sh` grün (CI-Step).
- [ ] deploy-staging.yml baut + pusht das Wizard-Image.
- [ ] Nach Deploy: `setup.prozesspilot.net/health` = 200 (Smoke) und `setup.prozesspilot.net/<token>` lädt die Wizard-App (SPA-Fallback), `chat.*/health` bleibt grün (Stub).

## Verifikation

Docker lokal nicht baubar (Daemon aus) → Image-Build/Deploy laufen über die Pipeline. Lokal prüfbar: Caddy-Syntax (`bash infra/caddy/test-config.sh`), `docker compose -f docker-compose.prod.yml config` (YAML-Validität), nginx-Conf-Review. Nach Merge: `gh workflow run deploy-staging.yml --ref main` → Smoke-Checks im Job + manuell `curl setup.prozesspilot.net/`.

## Hinweis (manuell)

Prod-Env `SETUP_BASE_URL=https://setup.prozesspilot.net` setzen (für die Magic-Link-URL in der Einladungs-Mail), sonst zeigt der Link auf localhost.
