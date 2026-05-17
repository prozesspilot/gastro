# ProzessPilot OWASP Top 10 Security-Checklist

Stand: 2026-05-01 | Reviewer: Autonomous Security Review (Block D)

---

## A01 — Broken Access Control

### GEPRUEFT:
- Alle Datenbankabfragen enthalten `customer_id = $N` oder `tenant_id = $N` als Filter (Row-Level-Security auf Anwendungsebene)
- `x-pp-tenant-id` Header wird in allen Modulen verifiziert
- Plugin-Registry: Plugins werden immer per `tenant_id` gefiltert (`WHERE plugin_id = $1 AND tenant_id = $2`)
- Loeschantraege werden per `tenant_id` gefiltert
- DSGVO-Endpoints erfordern Tenant-Header

### TODO (manuell pruefen):
- Postgres Row-Level-Security (RLS) als zweite Verteidigungslinie aktivieren
- Admin-Rolle fuer `execute-deletion` Endpoint implementieren (aktuell jeder Tenant kann ausfuehren)
- Rate-Limit fuer sensible Endpunkte erhoehen (aktuell global 100/min)

---

## A02 — Cryptographic Failures

### GEPRUEFT:
- PII-Felder (`vat_id`, Steuer-ID) werden mit pgcrypto (`pgp_sym_encrypt`) verschluesselt
- HMAC-SHA256 wird fuer Request-Signierung genutzt (`src/core/auth/hmac.ts`)
- Plugin-Webhooks werden mit HMAC-SHA256 signiert (`plugin-dispatcher.ts`)
- WhatsApp-Webhooks werden mit HMAC-SHA256 verifiziert (`m10-whatsapp/webhook-verifier.ts`)

### VERBESSERT:
- `timingSafeEqual()` bereits korrekt implementiert in `hmac.ts` — kein Aenderungsbedarf

### TODO (manuell pruefen):
- PostgreSQL TLS-Verbindung (`sslmode=verify-full`) in Produktion erzwingen
- MinIO/S3 Server-Side-Encryption aktivieren
- PP_PGCRYPTO_KEY-Rotation-Prozess dokumentieren

---

## A03 — Injection

### GEPRUEFT:
- ALLE Datenbankabfragen nutzen parametrisierte Queries (`$1`, `$2` usw.)
- Kein String-Concat mit User-Input in SQL gefunden
- Suche nach `WHERE.*+` ergab nur Template-Strings mit `$N`-Parametern
- Plugin-Dispatcher: JSON-Payload wird nicht in SQL-Queries eingebaut

### VERBESSERT:
- Kein Aenderungsbedarf — bereits sauber implementiert

---

## A04 — Insecure Design

### GEPRUEFT:
- Receipt-Status-Workflow ist validiert (Enum in DB)
- DSGVO-Loeschung erfordert `status='pending'` vor Ausfuehrung (State-Machine)
- Plugin-Executions werden immer protokolliert (Audit-Trail)

### TODO:
- Threat-Modelling-Session durchfuehren
- DSGVO-Execute-Endpoint auf Admin-Rolle beschraenken

---

## A05 — Security Misconfiguration

### GEPRUEFT:
- `PP_AUTH_DISABLED=1` in Produktion wird beim Start abgefangen (config.ts)
- Alle Secrets kommen aus ENV-Variablen

### VERBESSERT:
- `@fastify/rate-limit` installiert und konfiguriert: 100 req/min pro Tenant/IP global
- Rate-Limiting ist im Test-Modus deaktiviert (um Tests nicht zu blockieren)
- Produktion-Error-Handler gibt keine Stack-Traces nach außen weiter
- `.env.example` erstellt mit allen benoetigten Variablen

### TODO:
- Security-Headers (Helmet) hinzufuegen (`npm install @fastify/helmet`)
- CORS einschraenken auf bekannte Origins
- Content-Security-Policy konfigurieren

---

## A06 — Vulnerable Components

### TODO (manuell pruefen):
- `npm audit` regelmaessig ausfuehren: `cd backend && npm audit`
- Aktuell 15 Vulnerabilities (2 low, 12 moderate, 1 high) — mit `npm audit fix` beheben soweit moeglich
- Abhaengigkeiten mit `npm outdated` regelmaessig pruefen
- Dependabot oder `npm audit` in CI/CD-Pipeline einbinden

---

## A07 — Authentication Failures

### GEPRUEFT:
- HMAC-SHA256 mit Timestamp-Skew-Pruefung (verhindert Replay-Angriffe)
- `timingSafeEqual()` verhindert Timing-Angriffe bei Signatur-Vergleich
- Timestamp-Fenster: 300 Sekunden (konfigurierbar)

### TODO:
- Brute-Force-Schutz fuer API-Key-Endpunkte
- JWT oder OAuth fuer Webapp-User erwaegen

---

## A09 — Security Logging

### GEPRUEFT:
- `audit_log` Tabelle bereits vorhanden (Aktionen werden geloggt)
- Plugin-Ausfuehrungen werden vollstaendig protokolliert (`plugin_executions`)
- DSGVO-Loeschantraege werden in `deletion_requests` getrackt
- Pino-Logger mit strukturiertem JSON-Format

### TODO:
- Audit-Log fuer Login-Versuche implementieren
- Log-Retention-Policy definieren (aktuell kein automatisches Cleanup)
- Loki/Grafana fuer zentrales Log-Management einrichten

---

## A10 — SSRF (Server-Side Request Forgery)

### VERBESSERT:
- Plugin-Dispatcher prueft private IP-Ranges in Produktion (`plugin-dispatcher.ts`)
- Blockiert: 127.x, 10.x, 192.168.x, 172.16-31.x, localhost, ::1
- In Dev-Modus erlaubt (localhost-Webhooks fuer lokale Entwicklung)
- `isPrivateUrl()` Funktion im Plugin-Dispatcher implementiert

### TODO:
- DNS-Rebinding-Angriffe bedenken (IP-Check nach DNS-Aufloesung wiederholen)
- Allowlist fuer externe Domains erwaegen statt Blocklist fuer private IPs

---

## Naechste Schritte (Priorisiert)

1. `npm audit fix` ausfuehren
2. Helmet-Middleware fuer HTTP-Security-Headers hinzufuegen
3. Admin-Rolle fuer DSGVO-Execute-Endpoint implementieren
4. Postgres RLS aktivieren als zweite Sicherheitsschicht
5. Penetrationstest mit bekanntem Tool (OWASP ZAP) durchfuehren
6. Dependency-Updates in CI/CD integrieren
