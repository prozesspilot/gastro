# Technische und Organisatorische Maßnahmen (TOMs)

> **Anlage 1 zum AVV — Stand 2026-05-15**
>
> Beschreibung der technischen und organisatorischen Maßnahmen gemäß Art. 32 DSGVO, die ProzessPilot zum Schutz personenbezogener Daten ergreift.

---

## 1. Vertraulichkeit (Art. 32 Abs. 1 lit. b DSGVO)

### 1.1 Zutrittskontrolle (physisch)

- **Server-Hosting:** Hetzner Online GmbH, Rechenzentren in Falkenstein und Nürnberg (Deutschland)
- **Physische Zugangskontrolle:** Hetzner-Rechenzentren sind ISO 27001-zertifiziert, mit Mehrfaktor-Zugangskontrolle, 24/7-Bewachung, Videoüberwachung
- **Mitarbeiter-Geräte:** Steve und Andreas arbeiten remote, jeweils auf eigenen MacBooks mit FileVault-Vollverschlüsselung
- **Keine eigenen Büro-Räumlichkeiten** mit Datenverarbeitung

### 1.2 Zugangskontrolle (logisch)

- **Mitarbeiter-Login:** Discord OAuth 2.0 mit Mitgliedschaftsprüfung im internen Discord-Server
- **Notfall-Login (nur Geschäftsführer):** Email + Argon2id-Passwort + TOTP-2FA
- **Customer-Authentifizierung:** Magic-Link-Tokens mit kryptographischer Sicherheit (192 Bit Entropie), gebunden an Tenant
- **n8n ↔ Backend:** HMAC-Signierung
- **Brute-Force-Schutz:** Rate-Limit auf alle Login-Endpoints (max. 5 Versuche pro IP pro 15 Min)
- **Session-Token:** JWT mit kurzer Lebensdauer (24h für Discord, 4h für Notfall-Login), HttpOnly + Secure + SameSite=Strict Cookies

### 1.3 Zugriffskontrolle (Berechtigungen)

- **Rollen-basiertes Berechtigungsmodell:** Geschäftsführer / Mitarbeiter / Support
- **Multi-Tenancy mit Row-Level Security (RLS):** PostgreSQL setzt automatisch tenant_id-Filter — Tenant A kann nicht Tenant B's Daten sehen
- **Permission-Check pro API-Endpoint:** requireRole-Middleware im Backend
- **Audit-Log:** Jeder Statuswechsel und jeder Auth-Event wird in audit_log gespeichert (12 Monate Aufbewahrung)

### 1.4 Trennungskontrolle

- **Multi-Tenancy:** Strikte logische Trennung der Tenant-Daten via tenant_id-Spalte und RLS
- **Test-/Produktionsumgebung getrennt:** separate DB-Instanzen, separate API-Keys
- **Pseudonymisierung im Logging:** PII (E-Mail, Tenant-Name) wird nicht im Klartext geloggt, sondern als Hash

---

## 2. Integrität (Art. 32 Abs. 1 lit. b DSGVO)

### 2.1 Weitergabekontrolle

- **TLS 1.3** für alle Verbindungen (HTTPS, WSS für WebSocket)
- **End-to-End-Verschlüsselung von API-Tokens** (Lexware Office, SumUp, Google Drive) in Postgres mit pgcrypto AES
- **Keine personenbezogenen Daten in URLs** (immer in HTTPS-Body)
- **Customer-Belege nicht via Discord-Channels** (DSGVO-Variante B: Discord ist nur Notification, keine Customer-Daten)

### 2.2 Eingabekontrolle

- **Audit-Log:** Jeder Statuswechsel eines Belegs wird mit Zeitstempel, Akteur und vorher/nachher-Diff gespeichert
- **Discord-Integration-Audit:** Login-Events, Task-Übernahmen, manuelle Eingriffe protokolliert
- **GoBD-konforme Unveränderbarkeit:** Hash-Sums (SHA256) pro Beleg, Verifizierung möglich

---

## 3. Verfügbarkeit und Belastbarkeit (Art. 32 Abs. 1 lit. b DSGVO)

### 3.1 Verfügbarkeitskontrolle

- **Backup-Strategie:**
  - Postgres: tägliches Vollbackup, alle 6 Stunden inkrementelles Backup, 30 Tage Aufbewahrung
  - MinIO/Belege: Replication 3-fach, tägliches Snapshot
  - Backups in separater Hetzner-Storage-Box (anderer Standort)
- **Disaster-Recovery:** Wiederherstellungsplan dokumentiert, Drill mindestens halbjährlich
- **Monitoring:** Sentry für Errors, Grafana + Loki für System-Metrics, Discord-Webhooks für kritische Alerts
- **Verfügbarkeits-Ziel:** 99 % im Jahresmittel (kein SLA-Garantie, aber Best-Effort)

### 3.2 Schnelle Wiederherstellbarkeit

- **Docker-Compose-basiertes Deployment:** vollständige Wiederherstellung in <60 Min möglich
- **Infrastructure-as-Code:** alle Hetzner-Setup-Schritte in Repository dokumentiert
- **Datenbank-Migrations versioniert:** rückwärts-kompatibel, mit Rollback-Skripten

---

## 4. Verfahren zur regelmäßigen Überprüfung (Art. 32 Abs. 1 lit. d DSGVO)

### 4.1 Datenschutz-Management

- **Verzeichnis Verarbeitungstätigkeiten** (Art. 30 DSGVO) wird gepflegt
- **Auftragsverarbeitungsverträge** mit allen Sub-Auftragsverarbeitern
- **Standardvertragsklauseln (SCCs)** für US-Sub-Auftragsverarbeiter
- **Drittland-Transfer-Folgenabschätzung** durchgeführt
- **Datenschutzbeauftragter:** noch nicht Pflicht (<20 Mitarbeiter), wird bei Erreichen der Schwelle bestellt

### 4.2 Incident-Response

- **Incident-Response-Plan** dokumentiert (siehe `infra/runbook/incident_response.md`)
- **Eskalations-Kette:** GF Steve → GF Andreas → ggf. externer Datenschutzberater
- **72-Stunden-Meldepflicht:** Verfahren etabliert
- **Standard-Vorlagen** für Behörden-Meldung und Kunden-Information

### 4.3 Mitarbeiter-Sensibilisierung

- **Onboarding-Checklist:** jeder neue Mitarbeiter wird auf DSGVO und ProzessPilot-Datenschutz-Pflichten verpflichtet
- **CLAUDE.md im Repo:** Datenschutz-Regeln sind Teil der Master-Konfiguration für alle Claude-Code-Sessions
- **"NIE PII in Logs"** als verbindliche Coding-Regel

### 4.4 Pseudonymisierung und Verschlüsselung

- **Verschlüsselung in Ruhe (at rest):**
  - Postgres: Volume-Verschlüsselung auf Hetzner
  - MinIO: Object-Verschlüsselung server-side
  - API-Tokens: pgcrypto AES in dedizierten Spalten
- **Verschlüsselung in Übertragung (in transit):**
  - TLS 1.3 für alle externen Verbindungen
  - Interne Service-zu-Service: über VPC bzw. Docker-internes Netzwerk
- **Pseudonymisierung:**
  - Logs enthalten Hash-IDs statt Klartext-Identifier
  - Test-/Staging-DB enthält pseudonymisierte Produktivdaten

### 4.5 Datenminimierung

- **Nur notwendige Datenfelder werden erfasst** (z.B. kein Geburtsdatum, kein politisches Interesse)
- **Auto-Lösch-Job:** Daten werden 30 Tage nach Vertragsende vollständig gelöscht
- **Beleg-Aufbewahrung beim Kunden:** Original-Belege liegen im Kunden-eigenen Cloud-Speicher, nicht bei ProzessPilot
- **Audit-Log-Aufbewahrung:** 12 Monate, danach automatische Löschung

---

## 5. Konkrete technische Maßnahmen im Detail

### 5.1 Hosting + Infrastruktur

| Komponente | Maßnahme |
|---|---|
| Server | Hetzner Cloud CX22+ in EU (Falkenstein, Nürnberg) |
| Reverse Proxy | Caddy mit Auto-TLS (Let's Encrypt) |
| Container | Docker + Docker Compose, isolierte Container pro Service |
| Backup | Hetzner-Storage-Box, separater Standort, 30 Tage Retention |
| Monitoring | Sentry + Grafana + Loki, Alerts via Discord-Webhook |

### 5.2 Datenbank-Sicherheit

| Maßnahme | Details |
|---|---|
| RLS (Row-Level Security) | Aktiv für jede Tabelle mit tenant_id |
| Verschlüsselung at rest | Volume-Verschlüsselung |
| Verschlüsselte Spalten | API-Tokens via pgcrypto |
| Backup-Verschlüsselung | AES-256 für Backup-Files |
| Connection-Pooling | mit TLS-erzwungenen Verbindungen |
| Read-Only-User | für Reporting-Queries (kein DELETE/UPDATE) |

### 5.3 Application-Security

| Maßnahme | Details |
|---|---|
| Eingabe-Validation | Zod-Schemas für alle API-Inputs |
| SQL-Injection-Schutz | Parametrisierte Queries (kein String-Concat) |
| XSS-Schutz | React standardmäßig escaped, Content-Security-Policy |
| CSRF-Schutz | SameSite=Strict Cookies + state-Token bei OAuth |
| Rate-Limiting | Pro IP und pro User |
| Dependency-Audit | npm audit in CI, automatische Security-Updates |

### 5.4 Authentifizierung

| Mechanismus | Details |
|---|---|
| Mitarbeiter | Discord OAuth 2.0 |
| Geschäftsführer-Notfall | Email + Argon2id-Passwort + TOTP-2FA |
| Customer | Magic-Link mit DB-Token (192 Bit) |
| Service-zu-Service | HMAC-SHA256 |
| API-Tokens | gespeichert verschlüsselt, automatischer Refresh |

### 5.5 Discord-Integration (besondere Hinweise)

- **Customer-Daten landen NICHT in Discord-Channels.** Discord ist nur:
  - Mitarbeiter-Login-Provider
  - Notification-Channel (Status-Updates, Task-Pings)
  - Spiegelung von Customer-Chat (Mitarbeiter sehen Auszüge zur effizienten Antwort)
- **EU-DB ist Source of Truth** — bei DSGVO-Lösch-Anfrage werden DB-Daten + Discord-Spiegelung beide gelöscht

### 5.6 KI-Verarbeitung (Anthropic Claude, Google Vision)

- **Daten werden nicht für Training verwendet** (vertraglich ausgeschlossen via Business-Plan)
- **EU-Region wo möglich:** Google Vision `europe-west3`
- **SCCs für US-Anteil:** Anthropic Claude über Standardvertragsklauseln
- **Belege werden anonym verarbeitet:** keine Tenant-IDs in API-Calls (nur Bild-Daten)

---

## 6. Organisatorische Maßnahmen

### 6.1 Mitarbeiter-Verpflichtungen

- **Verschwiegenheitsverpflichtung** bei Anstellung / Tätigkeitsbeginn
- **DSGVO-Schulung** (Online-Kurs + ProzessPilot-spezifische Onboarding-Checkliste)
- **Discord-Server-Mitgliedschaft als Voraussetzung** — bei Verlassen des Teams: Server-Kick + DB-Deaktivierung sofort

### 6.2 Lieferanten-Management

- **AVVs mit allen Sub-Auftragsverarbeitern** abgeschlossen
- **Jährliche Re-Evaluation** der Sub-Auftragsverarbeiter-Liste
- **Backup-Provider** für kritische Dienste vorbereitet (z.B. Mindee als OCR-Backup)

### 6.3 Prozess-Dokumentation

- **Verzeichnis Verarbeitungstätigkeiten** in `legal/Verzeichnis_VAT.md`
- **Subunternehmer-Liste** in `legal/Subunternehmer.md`
- **Incident-Response-Plan** in `infra/runbook/incident_response.md`
- **Backup-/Restore-Prozeduren** in `infra/runbook/backup_restore.md`

### 6.4 Notfall-Übungen

- **Disaster-Recovery-Drill** halbjährlich
- **Backup-Restore-Test** quartalsweise (auf Staging gegen Produktiv-Snapshot)
- **Incident-Response-Tabletop** jährlich

---

## 7. Anpassung der TOMs

(1) Die TOMs werden mindestens einmal jährlich überprüft und an den Stand der Technik angepasst.

(2) Wesentliche Änderungen werden dem Verantwortlichen mitgeteilt.

(3) Bei neuen technischen Herausforderungen (z.B. neue Bedrohungslagen, neue Datenarten) werden zusätzliche Maßnahmen evaluiert.

---

## 8. Kontakt für Datenschutz-Anfragen

- **Verantwortlich:** Steve Bernhardt
- **E-Mail:** datenschutz@prozesspilot.net
- **Adresse:** [Schneverdingen-Adresse]
- **Datenschutzbeauftragter:** noch nicht bestellt (Pflicht ab 20 Mitarbeitern)

---

**Stand:** 2026-05-15 (Vorlage zur anwaltlichen Bearbeitung)
**Verantwortlich:** Steve Bernhardt + Andreas (Tech-Maßnahmen)
