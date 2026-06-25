# RUNBOOK: Caddy Reverse-Proxy auf IONOS einrichten

Dieses Runbook beschreibt den **manuellen SSH-Teil** der T012-Task.
Alle Repo-Dateien sind bereits vorhanden — hier geht es nur um die Server-Schritte.

> **Voraussetzung:** Branch `steve/T012-caddy-setup` ist auf `main` gemergt,
> GitHub Action hat die Docker-Images gebaut und nach IONOS deployed.

---

## Übersicht der Schritte

1. DNS-Records bei IONOS prüfen/setzen
2. SSH zum Server verbinden
3. Caddy installieren (offizielle Repo, nicht apt-default)
4. UFW-Firewall prüfen
5. Caddyfile deployen
6. Syntax prüfen + Caddy reloaden
7. Let's Encrypt Cert-Ausstellung beobachten
8. End-to-End-Test von außen
9. GitHub-Secret `IONOS_SSH_KEY` setzen (für Auto-Deploy)

---

## Schritt 1: DNS-Records bei IONOS setzen

Im IONOS-Control-Panel (oder DNS-Provider) folgende A-Records anlegen:

| Hostname | Typ | Ziel | TTL |
|---|---|---|---|
| `admin.prozesspilot.net` | A | `87.106.8.111` | 300 |
| `setup.prozesspilot.net` | A | `87.106.8.111` | 300 |
| `api.prozesspilot.net` | A | `87.106.8.111` | 300 |
| `chat.prozesspilot.net` | A | `87.106.8.111` | 300 |

DNS-Propagation prüfen (nach 5-15 Minuten):

```bash
# Von lokalem Mac aus
dig +short admin.prozesspilot.net
dig +short api.prozesspilot.net
# Beide sollten 87.106.8.111 zurückgeben
```

> **Troubleshooting:** Falls nach 30 Min noch nicht propagiert — TTL war zu hoch
> oder falscher DNS-Zone-Eintrag. IONOS-Support-Ticket öffnen.

---

## Schritt 2: SSH zum Server verbinden

```bash
ssh root@87.106.8.111
```

Falls noch kein SSH-Key hinterlegt:

```bash
# Lokalen Public-Key kopieren
ssh-copy-id root@87.106.8.111

# Oder manuell in ~/.ssh/authorized_keys eintragen
```

---

## Schritt 3: Caddy installieren (offizielle Repo)

> **Wichtig:** NICHT `apt install caddy` vom Ubuntu-Standard-Repo — das ist Caddy 1.x.
> Wir brauchen Caddy 2.x von der offiziellen Quelle.

```bash
# Abhängigkeiten
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl

# GPG-Key hinzufügen
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

# Repository hinzufügen
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list

# Installieren
sudo apt update
sudo apt install -y caddy

# Version prüfen (sollte 2.x sein)
caddy version

# Service-Status prüfen
sudo systemctl status caddy
```

Erwartete Ausgabe: `active (running)` — Caddy läuft bereits mit Default-Config.

---

## Schritt 4: UFW-Firewall prüfen

Port 80 und 443 müssen offen sein (war beim IONOS-Hardening schon eingerichtet):

```bash
sudo ufw status

# Erwartete Ausgabe sollte enthalten:
#   80/tcp    ALLOW
#   443/tcp   ALLOW
#   22/tcp    ALLOW

# Falls nicht offen:
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

> **Wichtig:** Caddy braucht Port 80 für ACME-Challenge (Let's Encrypt).
> Ohne Port 80 gibt es keine Zertifikate.

---

## Schritt 5: Caddyfile aus Repo deployen

Vom lokalen Mac (nicht vom Server) ausführen:

```bash
# Im Repo-Root
cd /Users/steve/Documents/ProzessPilot/prozesspilot

# Caddyfile auf Server kopieren
scp infra/caddy/Caddyfile root@87.106.8.111:/etc/caddy/Caddyfile
```

Oder auf dem Server direkt (nach `git pull`):

```bash
# Auf dem Server (falls Repo unter /opt/gastro liegt)
cp /opt/gastro/infra/caddy/Caddyfile /etc/caddy/Caddyfile
```

---

## Schritt 6: Syntax prüfen + Caddy reloaden

```bash
# Syntax-Prüfung (auf dem Server)
caddy validate --config /etc/caddy/Caddyfile

# Erwartete Ausgabe: "Valid configuration"

# Reload ohne Downtime
sudo systemctl reload caddy

# Status prüfen
sudo systemctl status caddy
```

> **Troubleshooting bei Syntax-Fehler:**
> - Fehlermeldung zeigt Zeile + Spalte
> - Häufige Ursache: Copy-Paste mit falschen Anführungszeichen oder Tabulatoren

---

## Schritt 7: Let's Encrypt Cert-Ausstellung beobachten

```bash
# Logs in Echtzeit ansehen
sudo journalctl -u caddy -f
```

Erwartete Log-Zeilen (innerhalb 30-60 Sekunden):

```
obtained certificate for admin.prozesspilot.net
obtained certificate for setup.prozesspilot.net
obtained certificate for api.prozesspilot.net
obtained certificate for chat.prozesspilot.net
```

> **Troubleshooting "ACME challenge failed":**
>
> 1. DNS noch nicht propagiert → warten, dann `systemctl reload caddy`
> 2. Port 80 blockiert → `ufw allow 80/tcp && ufw reload`
> 3. Rate-Limit von Let's Encrypt (5 Zertifikate/Woche) → hat normalerweise keinen Effekt bei Erstinstall
> 4. Server hinter weiterer Firewall (IONOS-Infrastruktur-Firewall) → IONOS-Panel prüfen

---

## Schritt 8: End-to-End-Test von außen

Vom lokalen Mac aus:

```bash
# Backend-API Health-Check
curl -v https://api.prozesspilot.net/api/v1/health

# Erwartete Antwort:
#   HTTP/2 200
#   {"status":"ok"} oder ähnlich
#   Certificate: Let's Encrypt

# Frontend-Container testen (setup = Onboarding-Wizard, chat = Web-Chat-Widget)
curl -s https://setup.prozesspilot.net/health | jq .
# Erwartet: {"status":"ok","service":"onboarding-wizard"}
curl -s https://chat.prozesspilot.net/health | jq .
# Erwartet: {"status":"ok","service":"web-chat-widget"}   (seit T072 kein Stub mehr)

# Mitarbeiter-Webapp
curl -I https://admin.prozesspilot.net
# Erwartet: HTTP/2 200

# TLS-Zertifikat Details
openssl s_client -connect api.prozesspilot.net:443 -brief
# Erwartete Ausgabe enthält: "Issuer: Let's Encrypt"
```

---

## Schritt 9: GitHub-Secret IONOS_SSH_KEY setzen

Damit die GitHub-Action automatisch deployen kann, muss der SSH-Key als Secret hinterlegt sein.

### SSH-Key für Deploy erstellen (auf dem Server)

```bash
# Auf dem IONOS-Server
ssh-keygen -t ed25519 -C "github-actions-deploy" -f /root/.ssh/github_deploy -N ""

# Public-Key zu authorized_keys hinzufügen
cat /root/.ssh/github_deploy.pub >> /root/.ssh/authorized_keys

# Private-Key ausgeben (wird als GitHub-Secret gespeichert)
cat /root/.ssh/github_deploy
```

### Secret in GitHub hinterlegen

1. GitHub öffnen: `https://github.com/[ORG]/gastro/settings/secrets/actions`
2. "New repository secret" klicken
3. Name: `IONOS_SSH_KEY`
4. Value: Den privaten Key aus dem obigen `cat`-Befehl (gesamten Inhalt inklusive `-----BEGIN...` und `-----END...`)
5. "Add secret" klicken

Weitere benötigte Secrets (falls noch nicht gesetzt):

| Secret-Name | Inhalt |
|---|---|
| `IONOS_HOST` | `87.106.8.111` |
| `IONOS_USER` | `root` (oder `deploy` falls Deploy-User angelegt) |
| `DISCORD_DEPLOYMENT_WEBHOOK` | Webhook-URL für `#deployment`-Kanal |
| `DISCORD_ALERTS_WEBHOOK` | Webhook-URL für `#alerts`-Kanal |

### Deploy-Test

```bash
# Lokalen Commit pushen (oder leeren Commit für Test)
git commit --allow-empty -m "chore: test deploy pipeline"
git push origin main

# GitHub Actions ansehen
gh run list --limit 5
gh run watch
```

---

## Troubleshooting-Sektion

### Problem: "dial tcp: lookup admin.prozesspilot.net: no such host"

DNS noch nicht propagiert. Warten und neu testen:

```bash
# Wiederhole bis Antwort kommt
watch -n 5 'dig +short admin.prozesspilot.net'
```

### Problem: "connection refused" auf Port 443

Caddy läuft nicht oder Port 443 ist geblockt:

```bash
systemctl status caddy
ufw status
# IONOS-Infrastruktur-Firewall im Control-Panel prüfen
```

### Problem: Zertifikat von "Caddy Local Authority" statt Let's Encrypt

Caddy hat kein echtes Zertifikat geholt, nutzt Self-Signed. Ursache: DNS-Fehler oder Port-80-Block.

```bash
journalctl -u caddy -n 50 | grep -i "acme\|cert\|error"
```

### Problem: "upstream connection failed" (502 Bad Gateway)

Der Docker-Container auf dem Ziel-Port läuft nicht:

```bash
docker compose -f /opt/gastro/docker-compose.prod.yml ps
# Zeigt ob alle Container laufen

docker compose -f /opt/gastro/docker-compose.prod.yml logs backend --tail 20
```

### Problem: GitHub-Action SSH-Login schlägt fehl

```bash
# Lokal testen
ssh -i ~/.ssh/github_deploy root@87.106.8.111 "echo OK"

# Authorized_keys prüfen
cat /root/.ssh/authorized_keys | grep github-actions-deploy
```

---

## Was danach ansteht

Sobald T012 fertig und alle 4 Subdomains mit HTTPS antworten:

- **T015 SumUp-OAuth-Adapter** (Andreas) kann starten — braucht `api.prozesspilot.net`
- **T016 Onboarding-Wizard** (Steve) kann starten — ersetzt `setup.prozesspilot.net`-Stub
- **T013 Mitarbeiter-Webapp-Skeleton** ist bereit für ersten echten Deploy auf `admin.prozesspilot.net`
