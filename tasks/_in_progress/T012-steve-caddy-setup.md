# T012 — Caddy Reverse-Proxy auf IONOS einrichten

> **Owner-Kandidat:** Andreas (Infrastructure)
> **Geschätzt:** 1–2h
> **Priorität:** P0 (blockiert ersten echten Deploy)
> **Spec-Referenzen:**
> - `Modulkonzept/Konzeptentwicklung/00_Architektur_Hauptdokument.md` — DNS-Subdomains + Reverse-Proxy-Setup
> - `Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md` — Deploy-Pipeline

---

## Ziel

Auf dem IONOS-Server (87.106.8.111) Caddy als Reverse-Proxy installieren, sodass die 4 Subdomains über HTTPS antworten und automatisch TLS-Zertifikate von Let's Encrypt geholt werden.

Damit ist die letzte Infra-Lücke geschlossen und der erste echte Test-Deploy möglich.

---

## Akzeptanz-Kriterien

### Caddy-Installation
- [ ] Caddy auf IONOS-Server installiert (offizielle Repo, nicht apt-default)
- [ ] Caddy läuft als systemd-Service (`systemctl status caddy` zeigt active)
- [ ] Caddyfile liegt unter `/etc/caddy/Caddyfile` und ist im Git-Repo unter `infra/caddy/Caddyfile` versioniert

### Subdomains routen
- [ ] `https://admin.prozesspilot.net` → Reverse-Proxy zu Mitarbeiter-Webapp-Container (Platzhalter wenn noch nicht da: Health-Check-Stub)
- [ ] `https://setup.prozesspilot.net` → Onboarding-Wizard-Container (gleicher Stub)
- [ ] `https://api.prozesspilot.net` → Backend-API-Container (gleicher Stub)
- [ ] `https://chat.prozesspilot.net` → Web-Chat-Widget-Container (gleicher Stub)

### Auto-TLS funktioniert
- [ ] Let's Encrypt-Zertifikat für alle 4 Subdomains automatisch geholt
- [ ] HTTP → HTTPS Auto-Redirect aktiv
- [ ] Browser zeigt grünes Schloss

### Health-Check-Stub (provisorisch bis echter Code da)
- [ ] Docker-Container der auf Port 8080 horcht und auf `/health` mit `{"status":"ok"}` antwortet
- [ ] `docker-compose.prod.yml` hat den Container drin, Caddy routet `api.prozesspilot.net` darauf
- [ ] `curl https://api.prozesspilot.net/health` antwortet 200 OK von extern

### Deploy-Pipeline-Test
- [ ] GitHub Action `deploy-staging.yml` wird durch Merge auf main getriggert
- [ ] SSH-Connect zu IONOS klappt mit Deploy-Key
- [ ] `docker compose pull && docker compose up -d` läuft fehlerfrei durch
- [ ] Discord-Webhook `#deployment` postet Erfolg-Meldung

---

## Sicherheits-Anker (NICHT VERGESSEN)

- [ ] Caddy-Admin-API auf Localhost beschränkt (nicht von außen erreichbar)
- [ ] Caddyfile enthält **keine** Secrets — alle Tokens aus Env-Vars
- [ ] UFW hat Port 80 + 443 offen (war schon beim IONOS-Hardening) — checken
- [ ] fail2ban-Regel für Caddy-Logs anlegen (optional, nice-to-have)

---

## Step-by-Step für Andreas

### 1. Branch + Task-Lock
```bash
cd ~/Documents/ProzessPilot/prozesspilot
git checkout main && git pull
git checkout -b andreas/T012-caddy-setup
git mv tasks/_backlog/T012-caddy-setup.md tasks/_in_progress/T012-andreas-caddy-setup.md
git add -A && git commit -m "chore: T012 task in progress"
git push -u origin andreas/T012-caddy-setup
```

### 2. Discord-Post in `#dev-coordination`
> 🟢 Starte T012 Caddy-Setup — Branch `andreas/T012-caddy-setup` — geschätzt 1-2h

### 3. Caddy auf IONOS installieren
```bash
ssh root@87.106.8.111

# Offizielle Caddy-Repo hinzufügen
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list

sudo apt update
sudo apt install -y caddy

# Status prüfen
sudo systemctl status caddy
```

### 4. Caddyfile schreiben

Inhalt für `/etc/caddy/Caddyfile`:

```caddyfile
# Email für Let's Encrypt-Account
{
    email steve@prozesspilot.net
}

admin.prozesspilot.net {
    reverse_proxy localhost:8081
}

setup.prozesspilot.net {
    reverse_proxy localhost:8082
}

api.prozesspilot.net {
    reverse_proxy localhost:8080
}

chat.prozesspilot.net {
    reverse_proxy localhost:8083
}
```

### 5. Health-Check-Stub-Container

Lege im Repo unter `infra/healthcheck-stub/` an:
- `Dockerfile` mit Node oder Caddy-static
- `docker-compose.prod.yml` mit Service `healthcheck-stub` auf Port 8080
- Test: `docker compose up -d && curl http://localhost:8080/health`

### 6. Caddyfile testen + reloaden
```bash
caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

# Logs ansehen falls Probleme
sudo journalctl -u caddy -f
```

### 7. End-to-End-Test
```bash
# Vom eigenen Mac (nicht vom Server)
curl -v https://api.prozesspilot.net/health
# → sollte 200 + {"status":"ok"} liefern + Cert von Let's Encrypt zeigen
```

### 8. PR aufmachen
```bash
git add -A
git commit -m "feat: T012 caddy reverse-proxy + healthcheck-stub

- Caddy mit Auto-TLS für admin/setup/api/chat.prozesspilot.net
- Healthcheck-Container auf Port 8080
- docker-compose.prod.yml erweitert
- Caddyfile im Repo unter infra/caddy/

Refs: Architektur-Hauptdokument §3"

gh pr create --title "T012: Caddy + Healthcheck-Stub" \
  --body "Reverse-Proxy steht. Erster echter Deploy-Test funktioniert (siehe Akzeptanz-Kriterien)."
```

### 9. Steve review't + merged

---

## Offene Fragen während der Bearbeitung

<wird beim Bearbeiten ergänzt>

---

## Rollback-Plan (falls was schief geht)

Wenn Caddy nicht läuft oder TLS-Zertifikate nicht kommen:
- `sudo systemctl stop caddy`
- DNS-Records zeigen weiterhin auf IONOS, aber kein Service antwortet → kein Schaden für Pilot-Wirt (noch nicht produktiv)
- `journalctl -u caddy -n 100` für Fehlersuche
- Discord-Post in `#dev-coordination` mit Fehlermeldung → gemeinsam fixen

---

## Was DANACH ansteht

Sobald T012 gemergt ist, kann **T013 Mitarbeiter-Webapp-Skeleton** starten (Steve) bzw. **T015 SumUp-OAuth-Adapter** (Andreas). Vorher nicht — sonst deployt ihr ins Leere.
