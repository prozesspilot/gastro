# infra/caddy — Reverse-Proxy-Konfiguration

Caddy ist der Reverse-Proxy auf dem IONOS-Server (`87.106.8.111`).
Er übernimmt TLS-Terminierung (Let's Encrypt, automatisch), HTTP→HTTPS-Redirect
und routet Anfragen an die jeweiligen Docker-Container.

## Dateien in diesem Verzeichnis

| Datei | Zweck |
|---|---|
| `Caddyfile` | Produktions-Konfiguration — wird nach `/etc/caddy/Caddyfile` deployed |
| `RUNBOOK.md` | Schritt-für-Schritt-Anleitung für den manuellen Server-Setup |
| `test-config.sh` | Syntax-Prüfung via `caddy validate` (lokal + CI) |
| `README.md` | Diese Datei |

## Subdomain-Routing

| Subdomain | Ziel (Container-Port) | Status |
|---|---|---|
| `admin.prozesspilot.net` | `localhost:8081` (Mitarbeiter-Webapp) | aktiv |
| `setup.prozesspilot.net` | `localhost:8082` (Onboarding-Wizard) | Stub bis T016 |
| `api.prozesspilot.net` | `localhost:8080` (Backend-API) | aktiv |
| `chat.prozesspilot.net` | `localhost:8084` (Web-Chat-Widget) | aktiv (T071/T072, Stub abgelöst) |

## Caddy auf dem Server reloaden

```bash
# Caddyfile aus Repo auf Server kopieren
scp infra/caddy/Caddyfile root@87.106.8.111:/etc/caddy/Caddyfile

# Syntax prüfen (auf dem Server)
caddy validate --config /etc/caddy/Caddyfile

# Reload ohne Downtime
systemctl reload caddy

# Logs beobachten
journalctl -u caddy -f
```

## Lokaler Syntax-Check

Falls Caddy lokal installiert ist:

```bash
bash infra/caddy/test-config.sh
```

Oder via Docker (kein lokales Caddy nötig):

```bash
docker run --rm \
  -v $(pwd)/infra/caddy/Caddyfile:/etc/caddy/Caddyfile \
  caddy:2-alpine \
  caddy validate --config /etc/caddy/Caddyfile
```

## Caddy-Version

Caddy v2 (Debian-Paket von `https://dl.cloudsmith.io/public/caddy/stable/`).
Nicht das Ubuntu-Standard-Paket — das ist veraltet.

## Wichtige Sicherheitsregeln

- Caddy-Admin-API ist auf `localhost:2019` beschränkt (nicht von außen erreichbar)
- Secrets kommen nicht ins Caddyfile — alle Tokens via Env-Vars
- UFW hat Port 80 + 443 offen, alle anderen Ports sind geschlossen
- HSTS ist für alle 4 Subdomains aktiv (max-age 1 Jahr + preload)
