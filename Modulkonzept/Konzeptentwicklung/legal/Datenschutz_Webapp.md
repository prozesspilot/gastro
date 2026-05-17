# Datenschutz-Hinweise — ProzessPilot-Plattform

> **Vorlage zur anwaltlichen Bearbeitung — Stand 2026-05-15**
>
> Diese Datenschutz-Hinweise gelten für die Mitarbeiter-Webapp (admin.prozesspilot.net), den Onboarding-Wizard (setup.prozesspilot.net) und das Web-Chat-Widget (chat.prozesspilot.net bzw. prozesspilot.net/c/{token}). Sie sind separat von der Marketing-Website-Datenschutzerklärung.

---

## I. Allgemeine Informationen

### 1. Verantwortlicher

[Firmenname ProzessPilot]
[Adresse Schneverdingen]
vertreten durch [Steve Bernhardt]
E-Mail: datenschutz@prozesspilot.net

### 2. Datenschutzbeauftragter

Aktuell ist die Bestellung eines Datenschutzbeauftragten gesetzlich nicht erforderlich (weniger als 20 Mitarbeiter). Anfragen zum Datenschutz richten Sie bitte an:

E-Mail: datenschutz@prozesspilot.net

### 3. Geltungsbereich

Diese Datenschutz-Hinweise gelten für die folgenden Anwendungen:

- Mitarbeiter-Webapp unter `admin.prozesspilot.net` (interne Nutzung durch ProzessPilot-Mitarbeiter)
- Onboarding-Wizard unter `setup.prozesspilot.net` (einmalige Einrichtung durch Endkunden)
- Web-Chat-Widget unter `chat.prozesspilot.net` bzw. `prozesspilot.net/c/{token}` (Kommunikation Endkunde ↔ Support)

Für die Marketing-Website `prozesspilot.net` gilt eine separate Datenschutzerklärung.

---

## II. Datenverarbeitung in der Mitarbeiter-Webapp

### 1. Welche Daten werden verarbeitet

Die Mitarbeiter-Webapp ist ein internes Tool und ausschließlich von Mitarbeitern von ProzessPilot zugänglich. Folgende personenbezogene Daten von Mitarbeitern werden verarbeitet:

- Discord-User-ID, Discord-Username, Discord-Avatar (über Discord-OAuth)
- Display-Name (im System konfigurierbar)
- Rolle (Geschäftsführer / Mitarbeiter / Support)
- Login-Events (Zeitstempel, IP-Adresse, Login-Methode)
- UI-Vorlieben (Theme, Default-View)
- Bei Geschäftsführern zusätzlich: Notfall-Email, Notfall-Passwort-Hash (Argon2id), TOTP-Secret, Backup-Codes-Hashes

Die Mitarbeiter-Webapp hat zudem Zugriff auf Endkunden-Daten, deren Verarbeitung im Auftragsverarbeitungsvertrag (AVV) zwischen ProzessPilot und dem jeweiligen Endkunden geregelt ist.

### 2. Zweck der Verarbeitung

- Authentifizierung und Autorisierung von Mitarbeitern
- Bereitstellung der Verwaltungs-Funktionalität (Tenant-Management, Tasks, Beleg-Korrektur, Customer-Chat-Übersicht)
- Sicherheits-Maßnahmen (Brute-Force-Schutz, Audit-Log)

### 3. Rechtsgrundlage

- Art. 6 Abs. 1 lit. b DSGVO (Erforderlich zur Erfüllung des Arbeitsvertrags / Auftragsverhältnisses)
- Art. 6 Abs. 1 lit. f DSGVO (Berechtigtes Interesse an System-Sicherheit für Audit-Logs)

### 4. Speicherdauer

- Aktive Mitarbeiter-Daten: Dauer der Tätigkeit + 6 Monate
- Audit-Logs (auth_audit_log): 12 Monate
- Backup-Snapshots: 30 Tage

### 5. Empfänger

- Discord Inc. (USA, mit SCCs) — als OAuth-Provider und für Notifications
- Hetzner Online GmbH (Deutschland) — als Hosting-Provider

---

## III. Datenverarbeitung im Onboarding-Wizard

### 1. Welche Daten werden verarbeitet

Wenn Sie als Endkunde den Onboarding-Wizard durchlaufen, werden folgende Daten verarbeitet:

**Stammdaten:**
- Firmenname, Rechtsform, Inhaber/Geschäftsführer
- Adresse, Telefon, E-Mail
- USt-ID, Steuernummer
- Branche, Mitarbeiter-Anzahl
- Geschätztes Belegvolumen, aktuelle Steuerberater-Kosten

**Steuerberater-Kontakt:**
- Steuerberater-Kanzlei, Ansprechpartner
- E-Mail Steuerberater, Telefon Steuerberater
- System-Auswahl (Lexware Office / DATEV / sevDesk / etc.)

**Konfigurations-Daten:**
- Eingangskanal-Wahl (WhatsApp / E-Mail / beides)
- Archiv-Provider (Google Drive / Dropbox)
- Kassensystem-Wahl (SumUp / orderbird / keines / etc.)
- OAuth-Tokens (verschlüsselt) zu Drittanbieter-Diensten
- Test-Beleg während Wizard-Abschluss

**Session-Daten:**
- Magic-Link-Token (Pseudo-Identifikation)
- Schritt-Fortschritt im Wizard
- Letzte Aktivität, Wizard-Abschluss-Zeitpunkt

### 2. Zweck der Verarbeitung

- Einmalige Einrichtung Ihres ProzessPilot-Tenants
- Aktivierung der gewählten Module
- Verbindung zu Drittanbieter-Diensten (Lexware, Drive, SumUp)

### 3. Rechtsgrundlage

- Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung und -erfüllung)

### 4. Speicherdauer

- Wizard-Session-Daten: 30 Tage nach Abschluss oder Abbruch
- Stammdaten und Konfigurations-Daten: Dauer des Hauptvertrags + 30 Tage Lösch-Frist

### 5. Empfänger

- Hetzner Online GmbH (Hosting)
- Bei OAuth-Verbindungen: Google, Lexware, SumUp etc. — gemäß Subunternehmer-Liste

### 6. Magic-Link-Mechanik

Sie haben kein Account und kein Passwort. Stattdessen erhalten Sie einen einmaligen Setup-Link per E-Mail. Dieser Link ist 30 Tage gültig und kryptographisch sicher (32 Zeichen, 192 Bit Entropie). Nach Abschluss des Wizards verfällt der Link.

---

## IV. Datenverarbeitung im Web-Chat-Widget

### 1. Welche Daten werden verarbeitet

Wenn Sie als Endkunde den Magic-Link zum Web-Chat-Widget anklicken, werden folgende Daten verarbeitet:

- Tenant-Zuordnung (über den Magic-Link-Token)
- Inhalte Ihrer Chat-Nachrichten an ProzessPilot-Support
- Inhalte der Antworten von ProzessPilot-Mitarbeitern
- Zeitpunkt der Nachrichten
- Browser-Session-Cookie (24 Stunden Gültigkeit)
- Optional bei Datei-Upload (Phase 2): hochgeladene Bilder/PDFs

Vorgangsbezogene Daten (z.B. der Beleg über den die Klärung erfolgt) werden mit angezeigt.

### 2. Zweck der Verarbeitung

- Klärung von Belegen, die nicht automatisch verarbeitet werden konnten
- Beantwortung von Anfragen zum Service
- Unterstützung bei Setup-Problemen
- Übergabe von Bewirtungs-Notizen (Anlass, Teilnehmer)

### 3. Rechtsgrundlage

- Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)

### 4. Speicherdauer

- Chat-Konversationen: Dauer des Hauptvertrags + 30 Tage Lösch-Frist
- Magic-Link-Tokens: 14 Tage ab Erstellung
- Browser-Session-Cookie: 24 Stunden

### 5. Empfänger

- Hetzner Online GmbH (Hosting der Datenbank)
- Discord Inc. (USA, mit SCCs) — Mitarbeiter-Spiegelung als Notification + Reply-Interface
- ProzessPilot-Mitarbeiter (intern, gemäß Rollen-Modell)

**Wichtiger Hinweis zur Discord-Spiegelung:** Ihre Customer-Konversationen werden zur Mitarbeiter-Bequemlichkeit auch in einem Discord-Channel gespiegelt, der nur für ProzessPilot-Mitarbeiter sichtbar ist. Die EU-Datenbank von ProzessPilot ist die maßgebliche Datenquelle. Discord ist nur Spiegelung. Sie können der Discord-Spiegelung widersprechen — in diesem Fall läuft Ihre Kommunikation ausschließlich über die EU-Webapp und E-Mail.

---

## V. Cookies

### 1. Essentielle Cookies (zwingend erforderlich)

| Cookie-Name | Zweck | Lebensdauer |
|---|---|---|
| `pp_auth` | Mitarbeiter-Auth-Session in Webapp | 24 Stunden |
| `pp_chat_session` | Customer-Chat-Session | 24 Stunden |
| `pp_wizard_session` | Onboarding-Wizard-Fortschritt | 30 Tage |
| `pp_csrf` | CSRF-Schutz | Session |

Alle Cookies sind:
- HttpOnly (kein JavaScript-Zugriff)
- Secure (nur über HTTPS)
- SameSite=Strict (kein Cross-Site-Request)

### 2. Keine Tracking-Cookies

Wir setzen **keine** Tracking-, Analyse- oder Marketing-Cookies in den Plattform-Anwendungen ein. Es gibt **kein** Google Analytics, **kein** Meta-Pixel, **kein** Tracking-Tool.

### 3. Cookie-Banner

Da wir nur essentielle Cookies einsetzen, ist kein Cookie-Banner mit Einwilligungs-Dialog erforderlich. Diese Datenschutz-Hinweise erfüllen die Informationspflicht.

---

## VI. Drittland-Transfer

Folgende Subunternehmer verarbeiten Daten in den USA bzw. außerhalb der EU. Für diese Übermittlungen werden **Standardvertragsklauseln (SCCs)** der EU-Kommission gemäß Art. 46 Abs. 2 lit. c DSGVO verwendet:

- **Discord Inc.** (USA) — Mitarbeiter-Login + Notifications + Customer-Chat-Spiegelung
- **Anthropic PBC** (USA) — KI-Kategorisierung
- **Google Cloud / Vision API** — EU-Region konfiguriert, Mutterkonzern in USA
- **Twilio Inc.** (USA, Pilot-Phase) — WhatsApp-Sandbox
- **Meta Platforms** (USA-Anteil) — WhatsApp Business Cloud
- **Postmark / SendGrid** (USA) — Transaktionsmail

Eine vollständige Liste mit Details ist im **Subunternehmer-Verzeichnis** abrufbar.

---

## VII. Ihre Rechte als betroffene Person

Sie haben jederzeit das Recht auf:

- **Auskunft** (Art. 15 DSGVO) über die zu Ihrer Person gespeicherten Daten
- **Berichtigung** (Art. 16 DSGVO) unrichtiger Daten
- **Löschung** (Art. 17 DSGVO) Ihrer Daten ("Recht auf Vergessenwerden")
- **Einschränkung der Verarbeitung** (Art. 18 DSGVO)
- **Datenübertragbarkeit** (Art. 20 DSGVO) in maschinenlesbarem Format
- **Widerspruch** (Art. 21 DSGVO) gegen die Verarbeitung

Anfragen richten Sie bitte an: datenschutz@prozesspilot.net

Sie haben zudem das Recht auf Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO), insbesondere bei der für ProzessPilot zuständigen Behörde:

**Landesbeauftragte für Datenschutz und Informationsfreiheit Niedersachsen**
[Anschrift]
https://lfd.niedersachsen.de/

---

## VIII. Sicherheit

Wir treffen umfangreiche technische und organisatorische Maßnahmen zum Schutz Ihrer Daten. Diese sind im Detail im AVV-Anhang **TOMs (Technische und Organisatorische Maßnahmen)** beschrieben:

- Verschlüsselung in Übertragung (TLS 1.3) und in Ruhe (Volume- und Spalten-Verschlüsselung)
- Zugriffskontrolle via Discord-OAuth + TOTP (Notfall-Login)
- Multi-Tenancy mit Row-Level Security in Postgres
- Audit-Logging aller relevanten Events
- Regelmäßige Security-Audits + Backup-Restore-Tests

---

## IX. Änderungen dieser Datenschutz-Hinweise

Wir behalten uns vor, diese Datenschutz-Hinweise gelegentlich zu aktualisieren, um sie an neue rechtliche Anforderungen oder Änderungen unserer Dienste anzupassen.

Bei wesentlichen Änderungen werden Sie per E-Mail informiert.

---

**Stand:** 2026-05-15 (Vorlage zur anwaltlichen Bearbeitung)
**Verantwortlich:** Steve Bernhardt
