# Verzeichnis der Subunternehmer (Sub-Auftragsverarbeiter)

> **Stand:** 2026-05-15
> **Status:** Lebende Liste — wird bei jeder Änderung aktualisiert. Endkunden werden über Änderungen informiert (siehe AVV § 8).
> **Zweck:** Vollständige Übersicht aller Dritt-Anbieter, die im Auftrag von ProzessPilot personenbezogene Daten verarbeiten.

---

## 1. Hosting und Infrastruktur

### 1.1 Hetzner Online GmbH

| Feld | Wert |
|---|---|
| **Vollständiger Name** | Hetzner Online GmbH |
| **Sitz** | Industriestraße 25, 91710 Gunzenhausen, Deutschland |
| **Verarbeitungs-Ort** | Rechenzentren in Falkenstein und Nürnberg, Deutschland |
| **Drittland** | nein (EU) |
| **Verarbeitete Daten** | sämtliche ProzessPilot-Daten (Postgres, MinIO, Backups, Application-Logs) |
| **Zweck** | Server-Hosting, Storage, Backups |
| **DSGVO-Grundlage** | EU-Standort, kein Drittland-Transfer |
| **AVV abgeschlossen** | ja (Hetzner Standard-AVV) |
| **Datenschutz-URL** | https://www.hetzner.com/de/rechtliches/datenschutz |
| **Zertifizierungen** | ISO 27001 |

### 1.2 MinIO (selbst-gehostet auf Hetzner)

MinIO läuft auf den Hetzner-Servern und ist daher kein eigener Subunternehmer im rechtlichen Sinne. Wird hier nur zur Vollständigkeit erwähnt.

---

## 2. KI- und OCR-Verarbeitung

### 2.1 Google Cloud (Vision API)

| Feld | Wert |
|---|---|
| **Vollständiger Name** | Google Ireland Limited |
| **Sitz** | Gordon House, Barrow Street, Dublin 4, Irland |
| **Verarbeitungs-Ort** | EU-Region `europe-west3` (Frankfurt am Main) konfiguriert |
| **Drittland-Bezug** | Mutterkonzern in USA (Google LLC), aber Datenresidenz EU |
| **Verarbeitete Daten** | Beleg-Bilder zur OCR-Texterkennung; **keine** Tenant-IDs in API-Calls |
| **Zweck** | OCR-Texterkennung von Belegen |
| **DSGVO-Grundlage** | EU-Datenresidenz + Standardvertragsklauseln (SCCs) als Rückfall |
| **AVV abgeschlossen** | ja (Google Cloud Data Processing Addendum) |
| **Datenschutz-URL** | https://cloud.google.com/terms/data-processing-addendum |
| **Zertifizierungen** | ISO 27001, SOC 2/3, EU Code of Conduct |

### 2.2 Anthropic PBC

| Feld | Wert |
|---|---|
| **Vollständiger Name** | Anthropic PBC |
| **Sitz** | 548 Market St #91364, San Francisco, CA 94104, USA |
| **Verarbeitungs-Ort** | USA (mit potenzieller EU-Region falls verfügbar) |
| **Drittland** | ja (USA) |
| **Verarbeitete Daten** | Anonymisierte Beleg-Texte zur KI-Kategorisierung; **keine** PII in API-Calls |
| **Zweck** | KI-gestützte Beleg-Kategorisierung (Claude API) |
| **DSGVO-Grundlage** | Standardvertragsklauseln (SCCs) gemäß Beschluss 2021/914 EU-Kommission |
| **AVV abgeschlossen** | ja (Anthropic Data Processing Addendum, Business-Plan) |
| **Datenschutz-URL** | https://www.anthropic.com/legal/privacy |
| **Besonderheiten** | Vertragliche Zusicherung: keine Verwendung der Daten für Modell-Training |

---

## 3. Mitarbeiter-Kommunikation

### 3.1 Discord Inc.

| Feld | Wert |
|---|---|
| **Vollständiger Name** | Discord Inc. |
| **Sitz** | 444 De Haro Street #200, San Francisco, CA 94107, USA |
| **Verarbeitungs-Ort** | USA |
| **Drittland** | ja (USA) |
| **Verarbeitete Daten** | Discord-User-IDs, Mitarbeiter-Usernames, Notification-Inhalte, Auszüge aus Customer-Chat-Konversationen (Mitarbeiter-Spiegelung) |
| **Zweck** | Mitarbeiter-Login-Provider, interne Team-Kommunikation, Notifications |
| **DSGVO-Grundlage** | Standardvertragsklauseln (SCCs) |
| **AVV abgeschlossen** | ja (Discord Data Processing Addendum) |
| **Datenschutz-URL** | https://discord.com/privacy |
| **Besonderheiten** | Customer-Daten leben primär in EU-DB. Discord ist nur Spiegelung für Mitarbeiter-Komfort. Endkunde hat im AVV Widerspruchs-Recht. |

---

## 4. Eingangs-Kanäle

### 4.1 Twilio Inc. (Pilot-Phase, bis Meta-Verifizierung)

| Feld | Wert |
|---|---|
| **Vollständiger Name** | Twilio Inc. |
| **Sitz** | 101 Spear Street, Floor 5, San Francisco, CA 94105, USA |
| **Verarbeitungs-Ort** | USA |
| **Drittland** | ja (USA) |
| **Verarbeitete Daten** | WhatsApp-Telefonnummern der Endkunden, Beleg-Foto-Inhalte (während Übertragung), Nachrichten-Texte |
| **Zweck** | WhatsApp-Sandbox-Eingang während Pilot-Phase |
| **DSGVO-Grundlage** | Standardvertragsklauseln (SCCs) |
| **AVV abgeschlossen** | ja (Twilio DPA) |
| **Datenschutz-URL** | https://www.twilio.com/legal/privacy |
| **Geplante Beendigung** | Sobald Meta-WhatsApp-Cloud-API-Freigabe erteilt (P1.3, voraussichtlich KW 29+) |

### 4.2 Meta Platforms (WhatsApp Business Cloud API, ab P1.3)

| Feld | Wert |
|---|---|
| **Vollständiger Name** | Meta Platforms Ireland Limited (für EU-Kunden) |
| **Sitz** | Merrion Road, Dublin 4, D04 X2K5, Irland |
| **Verarbeitungs-Ort** | EU + USA (gemischte Verarbeitung) |
| **Drittland-Bezug** | partiell USA |
| **Verarbeitete Daten** | WhatsApp-Telefonnummern der Endkunden, Beleg-Foto-Inhalte, Nachrichten-Texte |
| **Zweck** | WhatsApp Business Cloud API als primärer WhatsApp-Eingang |
| **DSGVO-Grundlage** | EU-Standort der Vertragspartner + SCCs für US-Anteil |
| **AVV abgeschlossen** | ja (WhatsApp Business Solution Terms + Meta DPA) |
| **Datenschutz-URL** | https://www.whatsapp.com/legal/business-data-transfer-addendum |
| **Aktivierung** | ab Phase 1.3, sobald Meta-Verifizierung erteilt |

---

## 5. Kassen-System-Anbindung

### 5.1 SumUp Payments S.A.S.

| Feld | Wert |
|---|---|
| **Vollständiger Name** | SumUp Payments S.A.S. |
| **Sitz** | 32-34 rue du Wacken, 67000 Strasbourg, Frankreich |
| **Verarbeitungs-Ort** | EU (Frankreich + Deutschland) |
| **Drittland** | nein (EU) |
| **Verarbeitete Daten** | Kassen-Transaktionsdaten der Endkunden (Tagesumsätze, Zahlungsweisen, MwSt-Splitting) |
| **Zweck** | Pull der Tagesabschlüsse via SumUp-API für M15 Kassensystem-Connector |
| **DSGVO-Grundlage** | EU-Standort, kein Drittland-Transfer |
| **AVV abgeschlossen** | ja (SumUp Standard-AVV) |
| **Datenschutz-URL** | https://sumup.com/de/datenschutz |
| **Aktivierung** | nur bei Tenants mit aktivem M15 + SumUp-OAuth-Setup |

---

## 6. Buchhaltungs-Übergabe

### 6.1 Haufe-Lexware GmbH (Lexware Office API)

| Feld | Wert |
|---|---|
| **Vollständiger Name** | Haufe-Lexware GmbH & Co. KG |
| **Sitz** | Munzinger Str. 9, 79111 Freiburg, Deutschland |
| **Verarbeitungs-Ort** | Deutschland |
| **Drittland** | nein |
| **Verarbeitete Daten** | aufbereitete Buchungs-Daten der Endkunden (Beleg-Nummern, Beträge, Konten, Kategorien) |
| **Zweck** | Direkt-Push der Buchungen in Lexware-Office-Konto des Steuerberaters |
| **DSGVO-Grundlage** | EU-Standort |
| **AVV abgeschlossen** | indirekt — der Steuerberater ist als Lexware-Kunde der direkte Vertragspartner. ProzessPilot agiert als Datenlieferant. |
| **Datenschutz-URL** | https://www.lexware.de/datenschutz |
| **Aktivierung** | nur bei Tenants mit Lexware-Office-Steuerberater + erfolgreichem OAuth |

### 6.2 sevDesk GmbH (sevDesk API)

| Feld | Wert |
|---|---|
| **Vollständiger Name** | sevDesk GmbH |
| **Sitz** | Hauptstraße 115, 77652 Offenburg, Deutschland |
| **Verarbeitungs-Ort** | Deutschland |
| **Drittland** | nein |
| **Verarbeitete Daten** | aufbereitete Buchungs-Daten |
| **Zweck** | Direkt-Push in sevDesk-Konto |
| **DSGVO-Grundlage** | EU-Standort |
| **AVV abgeschlossen** | indirekt (Steuerberater als sevDesk-Kunde) |
| **Datenschutz-URL** | https://sevdesk.de/datenschutz |
| **Aktivierung** | nur bei Tenants mit sevDesk-Steuerberater |

### 6.3 DATEV eG (DATEV-CSV-Format)

DATEV ist kein Sub-Auftragsverarbeiter — wir generieren nur eine CSV-Datei im DATEV-Format und versenden sie per E-Mail an den Steuerberater. Es findet kein direkter API-Zugriff statt.

---

## 7. Archiv-Provider (Wirts-eigene Konten)

### 7.1 Google Drive (Workspace)

Der Endkunde verbindet sein eigenes Google-Drive-Konto via OAuth. Belege werden im Konto des Endkunden (nicht im ProzessPilot-Konto) gespeichert. Google ist daher Sub-Auftragsverarbeiter des Endkunden, nicht von ProzessPilot.

ProzessPilot greift nur über den vom Endkunden vergebenen OAuth-Token auf einen einzigen Ordner ("ProzessPilot/") im Endkunden-Konto zu.

### 7.2 Dropbox

Analog zu Google Drive — Endkunden-eigenes Konto, ProzessPilot agiert nur als technischer Vermittler.

---

## 8. Transaktionsmail

### 8.1 Postmark (ActiveCampaign Postmark)

| Feld | Wert |
|---|---|
| **Vollständiger Name** | ActiveCampaign LLC (Postmark) |
| **Sitz** | 1 N Dearborn St, Suite 500, Chicago, IL 60602, USA |
| **Verarbeitungs-Ort** | USA |
| **Drittland** | ja (USA) |
| **Verarbeitete Daten** | E-Mail-Adressen der Endkunden + Steuerberater + Mitarbeiter, Mail-Inhalte (Übergabe-Mails, Mahnungen, Spar-Berichte) |
| **Zweck** | Versand transaktionaler E-Mails |
| **DSGVO-Grundlage** | Standardvertragsklauseln (SCCs) |
| **AVV abgeschlossen** | ja (Postmark DPA) |
| **Datenschutz-URL** | https://postmarkapp.com/eu-privacy |
| **Besonderheiten** | Nur transaktionale Mails (keine Marketing-Mails) |

### 8.2 Alternativen (zur Risikoreduktion vorbereitet)

- **Brevo** (Sendinblue, Frankreich, EU) — als möglicher Wechsel falls Postmark-USA-Risiko zu hoch
- **Eigener SMTP-Server auf Hetzner** — bei größerem Volumen evaluieren

---

## 9. Zahlungsabwicklung (ab Phase 2)

### 9.1 Stripe Payments Europe Ltd. (geplant ab Phase 2)

| Feld | Wert |
|---|---|
| **Vollständiger Name** | Stripe Payments Europe Ltd. |
| **Sitz** | The One Building, 1 Lower Grand Canal Street, Dublin 2, Irland |
| **Verarbeitungs-Ort** | EU + USA (gemischte Verarbeitung, je nach Zahlungsmethode) |
| **Drittland-Bezug** | partiell USA |
| **Verarbeitete Daten** | Zahlungsdaten der Endkunden (Bankverbindung, Kreditkarten-Daten via tokenisiert) |
| **Zweck** | Subscription-Abrechnung, Mahn-Workflow, Zahlungseinzug |
| **DSGVO-Grundlage** | EU-Vertragspartner + SCCs für US-Anteil |
| **AVV abgeschlossen** | ja (Stripe DPA) |
| **Datenschutz-URL** | https://stripe.com/de/privacy |
| **Aktivierung** | ab ~25 Tenants (geplant Phase 2, M3 in 2027) |

---

## 10. Notfall-Login-Komponenten

### 10.1 TOTP-App (Google Authenticator / Authy / 1Password)

Diese Apps speichern den TOTP-Secret nur lokal auf dem Mobilgerät der jeweiligen Geschäftsführer. Es findet **keine** Datenweitergabe statt. Daher kein Sub-Auftragsverarbeiter.

---

## 11. Zukünftig geplante Subunternehmer (Phase 2+)

| Subunternehmer | Geplant ab | Zweck |
|---|---|---|
| Mindee SAS (Frankreich, EU) | Phase 2 wenn Vision-Genauigkeit nicht reicht | Backup-OCR-Provider |
| orderbird AG (Deutschland) | Phase 2 wenn Tenant-Bedarf | Kassen-Connector |
| Lightspeed Commerce Inc. (Kanada) | Phase 2 wenn Tenant-Bedarf | Kassen-Connector |
| ready2order GmbH (Österreich, EU) | Phase 2 wenn Tenant-Bedarf | Kassen-Connector |

---

## 12. Geänderte/entfernte Subunternehmer

| Datum | Subunternehmer | Änderung |
|---|---|---|
| (Initial-Liste) | — | — |

---

## 13. Verfahren bei Subunternehmer-Änderungen

(1) Bei Hinzufügen oder Entfernen eines Subunternehmers wird diese Liste aktualisiert.

(2) Endkunden werden mindestens 30 Tage vor Aktivierung eines neuen Subunternehmers per E-Mail informiert.

(3) Endkunden haben innerhalb der 30 Tage ein Widerspruchsrecht. Bei Widerspruch besteht für ProzessPilot ein außerordentliches Kündigungsrecht des Hauptvertrags.

(4) Geänderte Liste wird automatisch in die GoBD-Verfahrensdokumentation des Endkunden übernommen (siehe M12).

---

## 14. Verantwortlich

- **Steve Bernhardt** (Geschäftsführung)
- **E-Mail:** datenschutz@prozesspilot.net

---

**Letzte Aktualisierung:** 2026-05-15 (Initial-Liste)
**Version:** 1.0
