# ProzessPilot — Backend

Modulares Automationssystem für Buchhaltungsprozesse.

Stack: Node 20 · TypeScript strict · Fastify · Vitest · pino · Zod · pg · ioredis · @aws-sdk/client-s3 · biome

---

## Setup-Schritte

### 1. Voraussetzungen

- Node 20+
- Docker + Docker Compose
- `cp .env.example .env` (Werte prüfen/anpassen)

### 2. Infra-Services starten

```bash
docker compose up -d
```

Wartet bis alle Healthchecks grün sind (~30 s):

```bash
docker compose ps
```

| Service  | Port  | URL                                  |
|----------|-------|--------------------------------------|
| Postgres | 5432  | `postgres://pp:pp@localhost:5432/prozesspilot` |
| Redis    | 6379  | `redis://localhost:6379`             |
| MinIO    | 9000  | http://localhost:9000 (API)          |
| MinIO    | 9001  | http://localhost:9001 (Konsole)      |
| n8n      | 5678  | http://localhost:5678                |

### 3. MinIO Bucket anlegen (einmalig)

```bash
# Im Browser: http://localhost:9001 → Login pp / pp-secret
# Bucket "prozesspilot-raw" anlegen
# Oder per mc CLI:
docker run --rm --network host minio/mc \
  alias set local http://localhost:9000 pp pp-secret && \
  mc mb local/prozesspilot-raw
```

### 4. Backend-Abhängigkeiten installieren

```bash
cd backend
npm install
```

### 5. Datenbankmigrationen ausführen (ab D2)

```bash
npm run migrate
```

### 6. Backend im Entwicklungsmodus starten

```bash
npm run dev
```

Fastify startet auf `http://localhost:3000`.

### 7. Schnell-Check

```bash
curl http://localhost:3000/health
# → { "ok": true, "version": "0.1.0", "uptime": 2 }

curl http://localhost:3000/ready
# → { "ok": true }   (wenn Postgres + Redis erreichbar)
```

### 8. Tests ausführen

```bash
npm test
# → 1 grüner Smoke-Test (kein laufender Infra-Service notwendig)
```

---

## Deliverable-Status

| ID  | Was                        | Status     |
|-----|----------------------------|------------|
| D1  | Repo-Bootstrap             | ✅ fertig  |
| D2  | Postgres-Migrations + RLS  | ✅ fertig  |
| D3  | HMAC-Auth + Middleware      | ✅ fertig  |
| D4  | Zod-Schemas                | ✅ fertig  |
| D5  | Customer-Profile-API       | ✅ fertig  |
| D6  | Event-Bus (Redis Streams)  | ✅ fertig  |
| D7  | n8n-Setup                  | ✅ fertig  |
| D8  | Storage-Service (MinIO)    | ✅ fertig  |
| D9  | Routing-Service            | ✅ fertig  |
| D10 | Logging / Tracing          | ✅ fertig  |

---

## Wichtige Umgebungsvariablen

Alle Variablen: `.env.example`. Kritische Regeln:

- `PP_AUTH_DISABLED=1` nur in Dev — Backend startet in Production nicht, wenn gesetzt.
- `PP_HMAC_SECRET` muss 32-Byte hex sein: `openssl rand -hex 32`
- `PP_PGCRYPTO_KEY` muss 32-Byte base64 sein: `openssl rand -base64 32`
