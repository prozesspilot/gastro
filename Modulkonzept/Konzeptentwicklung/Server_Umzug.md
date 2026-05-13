# Server-Umzug — Schritt-für-Schritt-Anleitung

> **Ziel:** ProzessPilot von localhost auf einen produktiven Server bringen.
> **Detaillierte Referenz:** [`prozesspilot/infra/runbook/01_deployment.md`](../../prozesspilot/infra/runbook/01_deployment.md) — ausführliche Version mit allen Edge-Cases.
> **Diese Datei** ist die kondensierte Schritt-für-Schritt-Variante zum Abhaken.

---

## 0 · Vorab-Entscheidungen (5 min)

Beantworte diese drei Fragen, bevor du loslegst:

- [ ] **Hosting:** **IONOS VPS 4-4-120** (Default — EU, DSGVO, 4 vCore + 4 GB RAM + 120 GB NVMe) / Hetzner Cloud / AWS / eigener Server?
- [ ] **Domain:** Schon vorhanden? Wenn ja: welche? Wenn nein: bei einem Registrar (z. B. INWX, Namecheap) holen.
- [ ] **WhatsApp Meta-Verifizierung:** Schon angestoßen? Wenn nicht — **JETZT** starten, dauert 2–3 Wochen, läuft parallel zum Server-Setup.

> Empfehlung: IONOS VPS 4-4-120 + neue Domain → Umzug ca. 4 Stunden plus Wartezeiten (DNS-Propagierung, SSL-Ausstellung).
> **Wichtig (4 GB RAM):** Swap-Setup ist Pflicht, siehe Schritt 2.

---

## 1 · Server bestellen (15 min)

**Annahme: IONOS VPS Linux M (4-4-120).** Für andere Anbieter analog vorgehen.

- [ ] [IONOS Cloud Panel](https://login.ionos.de/) öffnen, Vertrag prüfen.
- [ ] **Server bestellen:**
  - Standort: Frankfurt oder Berlin (beide EU/DSGVO)
  - Image: **Ubuntu 22.04 LTS**
  - Typ: **VPS Linux M (4-4-120)** — 4 vCore, 4 GB RAM, 120 GB NVMe
  - SSH-Key: dein eigener Public-Key hochladen (wenn du keinen hast: `ssh-keygen -t ed25519` lokal)
  - Backup-Add-On: **zubuchen** (separat zu buchen, ~3 €/Monat) — IONOS-Backups
    sind kein Default!
  - Hostname: `prozesspilot-prod-01`
- [ ] IPv4-Adresse notieren
- [ ] **Reverse-DNS** (falls Mail-Versand aus dem Backend geplant): im Cloud
      Panel unter „Server → Netzwerk → Reverse-DNS" den FQDN setzen, sonst
      werden ausgehende Mails von Gmail/Microsoft als Spam markiert.
- [ ] Erste SSH-Verbindung testen:

```bash
ssh root@<server-ipv4>
# Sollte ohne Passwort-Abfrage durchkommen, wenn der Key korrekt war
```

---

## 2 · Server härten (30 min)

Direkt auf dem Server (per SSH).

- [ ] System aktualisieren:

```bash
apt update && apt upgrade -y
```

- [ ] **Swap einrichten (4 GB RAM-Host — Pflicht!).** Skript liegt im Repo,
      aber bei IONOS ist das Repo noch nicht ausgecheckt — daher inline:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
free -h   # zeigt 4 GB Swap
```

Nach Repo-Clone alternativ: `bash infra/scripts/setup-swap.sh` (idempotent).

- [ ] User anlegen, SSH-Login auf Root deaktivieren:

```bash
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Root-SSH abschalten
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

- [ ] Ab jetzt nur noch als `deploy` einloggen: `ssh deploy@<server-ipv4>`

- [ ] Firewall + fail2ban:

```bash
sudo apt install -y ufw fail2ban
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo systemctl enable fail2ban
```

- [ ] Docker + Docker Compose installieren:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo apt install -y docker-compose-plugin
sudo usermod -aG docker deploy
# Neu einloggen, damit die Gruppen-Mitgliedschaft greift:
exit
ssh deploy@<server-ipv4>
docker --version && docker compose version
```

- [ ] Nginx + Certbot:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## 3 · DNS einrichten (5 min, dann 5–60 min Wartezeit)

Bei deinem Domain-Registrar zwei A-Records anlegen:

| Subdomain          | Typ | Wert                   |
|--------------------|-----|------------------------|
| `api.deinedomain.de` | A   | `<server-ipv4>`        |
| `n8n.deinedomain.de` | A   | `<server-ipv4>`        |

Optional zusätzlich:
| Subdomain          | Typ | Wert                   |
|--------------------|-----|------------------------|
| `app.deinedomain.de` | A   | `<server-ipv4>`        |

> Propagierung dauert je nach Provider 5 Min bis 1 Stunde. Während du wartest: weiter mit Schritt 4.

Test wenn fertig:

```bash
dig api.deinedomain.de +short
# Sollte deine Server-IP zurückgeben
```

---

## 4 · Repo aufs Server bringen (15 min)

- [ ] **Repo nach GitHub pushen** (falls noch nicht): erstelle ein **privates** Repo auf GitHub, dann lokal:

```bash
cd /Users/donandrejo/Documents/ProzessPilot/prozesspilot
git remote add origin git@github.com:<dein-user>/prozesspilot.git
git push -u origin main
```

- [ ] Auf dem Server SSH-Deploy-Key generieren und in GitHub als „Deploy Key" hinterlegen (read-only):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
# → in GitHub: Repo → Settings → Deploy keys → Add
```

- [ ] SSH-Config:

```bash
cat >> ~/.ssh/config <<EOF
Host github-prozesspilot
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
EOF
chmod 600 ~/.ssh/config
```

- [ ] Repo klonen:

```bash
sudo mkdir -p /opt/prozesspilot
sudo chown deploy:deploy /opt/prozesspilot
git clone github-prozesspilot:<dein-user>/prozesspilot.git /opt/prozesspilot
cd /opt/prozesspilot
```

---

## 5 · Production-Secrets erstellen (20 min)

Auf dem Server.

- [ ] Sichere Werte generieren:

```bash
echo "DB_PASSWORD=$(openssl rand -hex 24)"
echo "REDIS_PASSWORD=$(openssl rand -hex 24)"
echo "HMAC_SECRET=$(openssl rand -hex 32)"
echo "PP_S3_SECRET_KEY=$(openssl rand -hex 24)"
echo "N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

(Werte kopieren, gleich gleich gebraucht.)

- [ ] `.env.prod` anlegen — Vorlage `.env.example` als Basis nehmen:

```bash
cd /opt/prozesspilot
cp .env.example .env.prod 2>/dev/null || touch .env.prod
chmod 600 .env.prod
nano .env.prod
```

- [ ] Mindest-Inhalt für `.env.prod` (bei Hetzner + Default-Setup):

```bash
# Database
DB_USER=pp
DB_PASSWORD=<oben generierter Wert>
DB_NAME=prozesspilot

# Redis
REDIS_PASSWORD=<oben generierter Wert>

# Backend
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
PP_AUTH_DISABLED=
HMAC_SECRET=<oben generierter Wert>

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# Object Storage (MinIO lokal)
PP_S3_ACCESS_KEY=pp
PP_S3_SECRET_KEY=<oben generierter Wert>
PP_S3_ENDPOINT=http://minio:9000
PP_S3_BUCKET=prozesspilot-receipts
PP_S3_REGION=eu-central-1

# n8n
N8N_HOST=n8n.deinedomain.de
N8N_WEBHOOK_URL=https://n8n.deinedomain.de
N8N_ENCRYPTION_KEY=<oben generierter Wert>
N8N_DB_NAME=n8n

# WhatsApp (Meta Business — füllen wenn verifiziert)
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=<beliebiger fester String, gleich bei Meta einreichen>
WHATSAPP_GRAPH_API_VERSION=v21.0

# Sentry (optional)
SENTRY_DSN=

# Webapp
VITE_API_URL=https://api.deinedomain.de
```

- [ ] **Niemals** `.env.prod` ins Git pushen (steht schon in `.gitignore`):

```bash
git check-ignore .env.prod
# Sollte ".env.prod" ausgeben
```

---

## 6 · Erststart der Container (10 min)

```bash
cd /opt/prozesspilot
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

- [ ] Status prüfen:

```bash
docker compose -f docker-compose.prod.yml ps
# Alle services sollten "healthy" oder "running" sein

docker compose -f docker-compose.prod.yml logs backend --tail=50
# Auf Fehler scannen
```

- [ ] **Migrations ausführen:**

```bash
docker compose -f docker-compose.prod.yml exec backend npm run migrate
```

- [ ] **MinIO-Bucket anlegen:**

```bash
docker run --rm --network prozesspilot_internal minio/mc \
  alias set pp http://minio:9000 pp <PP_S3_SECRET_KEY> && \
  mc mb pp/prozesspilot-receipts || true
```

- [ ] Health-Check intern:

```bash
docker compose -f docker-compose.prod.yml exec backend wget -qO- http://localhost:3000/health
# → {"ok":true,...}
```

---

## 7 · Nginx + SSL (20 min)

- [ ] Nginx-Konfig anlegen:

```bash
sudo nano /etc/nginx/sites-available/prozesspilot
```

Inhalt (Domain anpassen!):

```nginx
# Webapp
server {
    listen 80;
    server_name deinedomain.de;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name deinedomain.de;
    ssl_certificate     /etc/letsencrypt/live/deinedomain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/deinedomain.de/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# API
server {
    listen 80;
    server_name api.deinedomain.de;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name api.deinedomain.de;
    ssl_certificate     /etc/letsencrypt/live/api.deinedomain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.deinedomain.de/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

# n8n
server {
    listen 80;
    server_name n8n.deinedomain.de;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name n8n.deinedomain.de;
    ssl_certificate     /etc/letsencrypt/live/n8n.deinedomain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8n.deinedomain.de/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

- [ ] Konfig aktivieren:

```bash
sudo ln -s /etc/nginx/sites-available/prozesspilot /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
```

> Wenn `nginx -t` rote Fehler bringt: SSL-Zertifikate gibt's noch nicht — kein Problem, jetzt Certbot:

- [ ] SSL-Zertifikate ausstellen (DNS muss propagiert sein, sonst schlägt das fehl):

```bash
sudo certbot --nginx \
  -d deinedomain.de \
  -d api.deinedomain.de \
  -d n8n.deinedomain.de \
  --non-interactive --agree-tos --email du@deinedomain.de
```

- [ ] Nginx neu laden + Test:

```bash
sudo systemctl reload nginx
curl https://api.deinedomain.de/health
# → {"ok":true,...}
```

---

## 8 · n8n-Workflows importieren (15 min)

- [ ] n8n-Webinterface öffnen: `https://n8n.deinedomain.de` — beim ersten Aufruf ein Admin-Konto anlegen
- [ ] In n8n: Settings → Variables — die Werte aus `.env.prod` setzen:
  - `BACKEND_URL` = `https://api.deinedomain.de`
  - `PP_HMAC_SECRET` = wie in `.env.prod`
- [ ] Alle 17 Workflows importieren:

```bash
# Lokale n8n-Workflows liegen in /opt/prozesspilot/n8n/workflows/*.json
# In n8n-UI: jeder Workflow → "Import from File"
ls /opt/prozesspilot/n8n/workflows/
```

- [ ] Pro Workflow: aktivieren (Toggle oben rechts)
- [ ] Smoke-Test: WF-MASTER-RECEIPT manuell mit Dummy-Receipt-ID triggern → erwarteter RoutePlan

---

## 9 · Backups einrichten (10 min)

- [ ] Backup-Skripte sind schon im Repo — Cron einrichten:

```bash
crontab -e
```

Eintrag:

```cron
# Postgres-Dump täglich um 3:00
0 3 * * * cd /opt/prozesspilot && bash infra/backup/backup-postgres.sh >> /var/log/pp-backup.log 2>&1

# MinIO-Sync täglich um 3:30
30 3 * * * cd /opt/prozesspilot && bash infra/backup/backup-s3.sh >> /var/log/pp-backup.log 2>&1
```

- [ ] **Wichtig:** Backup-Ziel muss extern sein — Hetzner Storage Box (3 €/Monat extra) oder S3-Bucket. NICHT auf demselben Server. Das Skript erwartet ein Backup-Ziel in `.env.prod`:

```bash
BACKUP_TARGET=ssh://u123456@u123456.your-storagebox.de/backups
# oder
BACKUP_TARGET=s3://my-bucket/prozesspilot/
```

- [ ] Erstes Backup manuell testen:

```bash
bash infra/backup/backup-postgres.sh
bash infra/backup/restore-test.sh   # restored auf Staging-DB, prüft Integrität
```

---

## 10 · WhatsApp-Webhook konfigurieren (5 min — sobald Meta-Verifizierung durch ist)

- [ ] Meta Business Manager → App → Webhooks
- [ ] Callback-URL: `https://n8n.deinedomain.de/webhook/wa`
- [ ] Verify-Token: derselbe Wert wie `WHATSAPP_VERIFY_TOKEN` in `.env.prod`
- [ ] Subscribed Fields: `messages`
- [ ] Test-Nachricht via Meta Business → muss in n8n landen

---

## 11 · Erster Smoke-Test (10 min)

End-to-End-Validierung:

- [ ] `curl https://api.deinedomain.de/health` → 200
- [ ] `curl https://api.deinedomain.de/ready` → 200
- [ ] In Webapp einloggen (https://deinedomain.de)
- [ ] Test-Tenant + Test-Customer-Profile + Drive-OAuth durchklicken (analog zu `infra/runbook/04_tenant_onboarding.md`)
- [ ] Test-Beleg via WhatsApp schicken
- [ ] **In Drive prüfen:** PDF erscheint < 60 s
- [ ] **In Sheet prüfen:** Zeile erscheint
- [ ] **Bestätigung via WhatsApp** zurück

---

## 11b · Memory-Monitoring einrichten (5 min — IONOS 4 GB Pflicht)

Bei 4 GB RAM ist Memory-Druck der wahrscheinlichste Outage-Grund. Daher
täglicher Cron-Check, der bei > 85 % Auslastung eine Mail schickt.

```bash
sudo crontab -e
```

```cron
*/15 * * * * /opt/prozesspilot/infra/scripts/memory-check.sh
```

Mail-Versand setzt voraus, dass `mail` (mailutils/postfix) installiert ist:

```bash
sudo apt install -y mailutils
```

Threshold und Empfänger anpassbar via ENV:

```bash
export MEM_ALERT_THRESHOLD=85
export MEM_ALERT_EMAIL=s.andreas-k@hotmail.de
```

---

## 12 · Monitoring + Alerting (15 min, optional aber empfohlen)

- [ ] Sentry-Account anlegen (kostenlos für 5K Events/Monat)
- [ ] DSN in `.env.prod` setzen → `docker compose restart backend`
- [ ] UptimeRobot (kostenlos): Health-Check alle 5 min auf `https://api.deinedomain.de/health` mit Mail-Alert
- [ ] Optional: Grafana-Dashboard nach `infra/runbook/05_monitoring_checks.md`

---

## Wie du danach **weiterarbeitest**

Du entwickelst lokal wie bisher. Deployen geht so:

```bash
# Lokal: Änderungen committen + pushen
cd /Users/donandrejo/Documents/ProzessPilot/prozesspilot
git add -p
git commit -m "feat: ..."
git push

# Auf dem Server: pullen + neu starten
ssh deploy@<server-ipv4>
cd /opt/prozesspilot
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build backend
docker compose -f docker-compose.prod.yml exec backend npm run migrate
```

> **Sobald der erste zahlende Kunde drauf ist:** Staging-Server dazu (zweiter Hetzner CX22), GitHub Actions deployt automatisch — siehe `infra/runbook/01_deployment.md` „CI/CD-Pipeline".

---

## Wenn was schiefgeht

| Symptom                                    | Wahrscheinliche Ursache                                          | Lösung                                                       |
|--------------------------------------------|------------------------------------------------------------------|--------------------------------------------------------------|
| `nginx -t` schlägt fehl: cert nicht da    | DNS noch nicht propagiert oder certbot noch nicht gelaufen      | `dig <domain>` checken; danach `sudo certbot --nginx ...`    |
| `docker compose up` Backend crasht         | `.env.prod` unvollständig                                        | `docker compose logs backend` — fehlende Variable lesen      |
| Migrations schlagen fehl                   | DB nicht erreichbar oder Versions-Konflikt                       | `docker compose logs postgres`; `psql` als pp-User testen    |
| n8n-Webhook bekommt keine WhatsApp-Calls   | Meta-Webhook nicht verifiziert oder Verify-Token falsch          | Meta-Webhook-Test rerun, Verify-Token in `.env.prod` prüfen |
| OCR-Calls scheitern                        | Google Vision Service-Account-JSON nicht vorhanden               | Service-Account-JSON nach `/opt/prozesspilot/secrets/`, Pfad in `.env.prod` |
| Belege landen nicht in Drive               | Customer-Drive-OAuth nicht durchgeklickt                         | Webapp → Tenant → Integrations → Google Drive verbinden     |

Detaillierte Troubleshooting-Schritte: `infra/runbook/03_oncall_playbook.md`.

---

## Realistische Zeitschätzung

| Block                                  | Aktive Zeit | Wartezeit            |
|----------------------------------------|-------------|----------------------|
| Vorab-Entscheidungen                   | 5 min       | —                    |
| Server bestellen                       | 15 min      | —                    |
| Server härten                          | 30 min      | —                    |
| DNS einrichten                         | 5 min       | 5–60 min Propagierung|
| Repo aufs Server                       | 15 min      | —                    |
| Secrets erstellen                      | 20 min      | —                    |
| Erststart Container + Migrations       | 10 min      | —                    |
| Nginx + SSL                            | 20 min      | —                    |
| n8n-Workflows importieren              | 15 min      | —                    |
| Backups einrichten                     | 10 min      | —                    |
| Smoke-Test                             | 10 min      | —                    |
| Monitoring                             | 15 min      | —                    |
| **Gesamt**                             | **3 h**     | **+ DNS-Wartezeit**  |
| Plus WhatsApp Meta-Verifizierung       | 30 min      | **2–3 Wochen**       |

---

**Diese Datei ist deine Checkliste — drucke sie aus oder hak sie im Editor ab.**
