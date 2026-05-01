---
name: ProzessPilot Production Setup
description: Docker, docker-compose.prod, nginx, health check, and env var structure
type: project
---

Production Docker setup completed 2026-05-01:

- `/backend/Dockerfile`: multi-stage build (builder/runtime), node:20-alpine, HEALTHCHECK via wget /health
- `/webapp/Dockerfile`: multi-stage build, nginx:1.25-alpine, ARG VITE_API_URL
- `/webapp/nginx.conf`: SPA fallback, /api/ proxy to backend:3000, gzip, /nginx-health endpoint
- `/docker-compose.prod.yml`: postgres:16, redis:7, minio, backend, webapp, n8n — internal + external networks
- `/.env.example`: all required env vars alphabetically, includes: ANTHROPIC_API_KEY, APP_VERSION, AWS_BACKUP_BUCKET, BACKUP_DIR, DATABASE_URL, GRAFANA_ADMIN_PASSWORD, GOOGLE_APPLICATION_CREDENTIALS, LEXOFFICE_*, NODE_ENV, PORT, PP_AUTH_DISABLED, PP_HMAC_SECRET, PP_S3_*, RETENTION_DAYS, SENTRY_DSN, SEVDESK_*, SMTP_*

Health route at `/health` now returns: ok, version, timestamp, uptime, checks.database (503 if DB unreachable).
Graceful shutdown via SIGTERM/SIGINT in server.ts calls app.close() -> onClose hook closes DB pool + Redis.

**Why:** Production mission to make the system deployable.
**How to apply:** Use docker-compose.prod.yml for production deployment; backend/webapp have separate Dockerfiles.
