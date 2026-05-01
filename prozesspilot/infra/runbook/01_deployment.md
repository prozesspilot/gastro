# 01 — Deployment-Anleitung

Vollstaendige Anleitung fuer Erstinstallation und Updates von ProzessPilot
in einer Produktionsumgebung.

---

## Voraussetzungen

### Server-Anforderungen

| Ressource | Minimum         | Empfohlen        |
|-----------|-----------------|------------------|
| CPU       | 2 vCPU          | 4 vCPU           |
| RAM       | 4 GB            | 8 GB             |
| Disk      | 40 GB SSD       | 100 GB SSD       |
| OS        | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Benoetigte Software

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
sudo apt-get install -y docker-compose-plugin
sudo usermod -aG docker $USER

# PM2 (falls ohne Docker betrieben)
npm install -g pm2

# PostgreSQL Client (fuer manuelle DB-Ops)
sudo apt-get install -y postgresql-client

# Certbot fuer SSL
sudo apt-get install -y certbot python3-certbot-nginx
```

Version pruefen:
```bash
node --version    # >= 20.0.0
docker --version  # >= 24.0.0
pm2 --version     # >= 5.0.0
```

---

## .env Checkliste

Erstelle `/prozesspilot/backend/.env` mit folgenden Werten (alle PFLICHTFELDER):

```bash
# ── Datenbank ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://prozesspilot:SICHERES_PASSWORT@localhost:5432/prozesspilot
DB_HOST=localhost
DB_PORT=5432
DB_NAME=prozesspilot
DB_USER=prozesspilot
DB_PASSWORD=SICHERES_PASSWORT         # min. 24 Zeichen, Sonderzeichen

# ── Backend ───────────────────────────────────────────────────────────────────
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# ── Auth ──────────────────────────────────────────────────────────────────────
HMAC_SECRET=SEHR_LANGER_ZUFAELLIGER_KEY  # min. 32 Bytes: openssl rand -hex 32
PP_AUTH_DISABLED=                         # LEER lassen in Produktion!

# ── Claude AI ─────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── S3 / MinIO ────────────────────────────────────────────────────────────────
S3_ENDPOINT=https://s3.example.com       # oder AWS-Endpoint
S3_BUCKET=prozesspilot-receipts
S3_ACCESS_KEY=ACCESS_KEY_ID
S3_SECRET_KEY=SECRET_ACCESS_KEY
S3_REGION=eu-central-1

# ── n8n ───────────────────────────────────────────────────────────────────────
N8N_BASE_URL=http://localhost:5678
N8N_WEBHOOK_URL=https://api.example.com/webhook  # oeffentliche URL

# ── WhatsApp (Twilio oder Meta Business API) ──────────────────────────────────
WHATSAPP_PROVIDER=twilio                 # oder 'meta'
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=+49...

# ── Lexoffice / sevDesk (optional, per Tenant konfiguriert) ──────────────────
# Werden in der DB gespeichert, nicht hier

# ── Monitoring (optional) ─────────────────────────────────────────────────────
SENTRY_DSN=https://...@sentry.io/...
```

Sicherheitspruefung:
```bash
# Stellt sicher, dass .env nicht in Git committed wird
grep -r "\.env" .gitignore || echo "WARNUNG: .env nicht in .gitignore!"
chmod 600 .env
```

---

## Schritt-fuer-Schritt Erstinstallation

### 1. Repository klonen

```bash
git clone https://github.com/ORGANISATION/prozesspilot.git /opt/prozesspilot
cd /opt/prozesspilot
```

### 2. Datenbank einrichten

```bash
# PostgreSQL-User und Datenbank anlegen
sudo -u postgres psql <<SQL
CREATE USER prozesspilot WITH PASSWORD 'SICHERES_PASSWORT';
CREATE DATABASE prozesspilot OWNER prozesspilot;
GRANT ALL PRIVILEGES ON DATABASE prozesspilot TO prozesspilot;
\c prozesspilot
CREATE EXTENSION IF NOT EXISTS pgcrypto;
\q
SQL

# Verbindung testen
psql postgresql://prozesspilot:SICHERES_PASSWORT@localhost:5432/prozesspilot -c "SELECT version();"
```

### 3. Backend-Abhaengigkeiten installieren und bauen

```bash
cd /opt/prozesspilot/backend
npm ci --omit=dev
npm run build

# Migration ausfuehren
npm run migrate
```

### 4. Migrationen manuell pruefen

```bash
psql $DATABASE_URL -c "\dt"  # Alle Tabellen anzeigen
# Erwartete Tabellen: tenants, users, customer_profiles, receipts, ...
```

### 5. MinIO (S3-kompatibel) starten

```bash
# Via Docker
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=SICHERES_PASSWORT \
  -v /data/minio:/data \
  minio/minio server /data --console-address ":9001"

# Bucket anlegen
docker exec minio mc alias set local http://localhost:9000 admin SICHERES_PASSWORT
docker exec minio mc mb local/prozesspilot-receipts
docker exec minio mc anonymous set download local/prozesspilot-receipts
```

---

## Docker-Compose Deployment

Empfohlene Produktionsmethode: alle Dienste via `docker-compose.yml`.

```yaml
# /opt/prozesspilot/docker-compose.yml (Produktions-Version)
version: '3.9'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: prozesspilot-backend:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - ./backend/.env
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: prozesspilot
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: prozesspilot
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U prozesspilot"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    volumes:
      - minio_data:/data
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY}
    command: server /data --console-address ":9001"

  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:5678:5678"
    volumes:
      - n8n_data:/home/node/.n8n
    environment:
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - N8N_EDITOR_BASE_URL=https://n8n.example.com
      - WEBHOOK_URL=https://n8n.example.com/
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=db
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=prozesspilot
      - DB_POSTGRESDB_PASSWORD=${DB_PASSWORD}
    depends_on:
      - db

volumes:
  pgdata:
  minio_data:
  n8n_data:
```

Deployment-Befehle:

```bash
# Erststart
docker-compose up -d

# Update-Deployment (Zero-Downtime fuer Backend)
docker-compose pull
docker-compose up -d --no-deps --build backend

# Status pruefen
docker-compose ps
docker-compose logs --tail=50 backend
```

---

## Nginx-Konfiguration

Nginx als Reverse Proxy vor dem Backend.

```nginx
# /etc/nginx/sites-available/prozesspilot
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
    limit_req zone=api burst=10 nodelay;

    # Upload-Limit fuer Belege (max 10 MB)
    client_max_body_size 10m;

    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # n8n Webhooks
    location /webhook/ {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Nginx aktivieren:

```bash
sudo ln -s /etc/nginx/sites-available/prozesspilot /etc/nginx/sites-enabled/
sudo nginx -t  # Konfiguration pruefen
sudo systemctl reload nginx
```

---

## SSL mit Let's Encrypt

```bash
# Zertifikat ausstellen (Domain muss bereits auf Server zeigen)
sudo certbot --nginx -d api.example.com -d n8n.example.com \
  --non-interactive --agree-tos --email admin@example.com

# Auto-Renewal einrichten (ist standardmaessig via Systemd-Timer aktiv)
sudo systemctl status certbot.timer

# Manuell erneuern testen
sudo certbot renew --dry-run

# Zertifikat-Ablaufdatum pruefen
sudo certbot certificates
```

---

## Post-Deployment Pruefung

```bash
# Health-Check
curl -f https://api.example.com/health
# Erwartete Antwort: {"status":"ok","uptime":...}

# API erreichbar
curl -H "X-Tenant-ID: test" https://api.example.com/api/v1/receipts
# Erwartete Antwort: 401 (ohne gueltigen HMAC) oder 200 mit leerer Liste

# n8n erreichbar
curl -s https://n8n.example.com/healthz | jq .status
# Erwartete Antwort: "ok"

# Datenbank-Tabellen vorhanden
psql $DATABASE_URL -c "\dt" | grep receipts
```
