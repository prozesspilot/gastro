# M12 — DSGVO-Workflows

> **Status (2026-05-07):** ✅ implementiert. Spec wurde nachgezogen, weil das Modul ursprünglich nicht als eigene Spec geführt wurde.
> **Code:** `backend/src/modules/dsgvo/`
> **Paket:** alle (Basic / Standard / Pro)

---

## 1. Zweck

Erfüllt DSGVO-Pflichten gegenüber Endkunden des Tenants (Lieferanten, deren Daten in Belegen vorkommen) und gegenüber dem Tenant selbst (Auftragsverarbeitungs-Vertrag, Auskunftsrecht, Löschpflicht).

Ist **nicht** ein einzelner Workflow, sondern eine Gruppe verwandter Endpoints + UI-Funktionen.

## 2. Funktionsbereiche

| Bereich                          | Wer ist Subjekt        | Trigger                       |
|----------------------------------|------------------------|-------------------------------|
| Auskunftsersuchen (Art. 15)      | Lieferant in Belegen   | Manual via Webapp / API       |
| Berichtigung (Art. 16)           | Lieferant in Belegen   | Manual via Webapp             |
| Löschung (Art. 17)               | Lieferant / Tenant     | Manual + Cron für Aufbewahrungsfristen |
| Einschränkung (Art. 18)          | Lieferant              | Manual                        |
| Datenübertragbarkeit (Art. 20)   | Tenant                 | API-Endpoint                  |
| Tenant-Offboarding               | Tenant                 | Operator-Workflow             |
| Aufbewahrungsfristen             | alle Belege            | Cron (täglich)                |

## 3. Datenmodell-Bezug

Belege enthalten ggf. Personendaten von Lieferanten (Name, Anschrift, Steuernummer, IBAN). Lösch-/Auskunftsanfragen wirken auf:

- `receipts.extraction.supplier_*` — anonymisieren statt löschen (steuerliche Aufbewahrungspflicht!)
- `suppliers_global` — Eintrag entfernen, wenn keine Belege mehr referenzieren
- `customer_profile_history` — auf Anfrage redigieren
- `audit_log` — niemals löschen (gesetzlich vorgeschrieben für Wirtschaftsprüfung), aber bei Auskunftsersuchen offenlegen

**Wichtig:** Steuerliche Aufbewahrungspflichten (§ 147 AO, 10 Jahre) gehen DSGVO-Löschanspruch vor, solange Frist nicht abgelaufen.

## 4. Endpoints (Backend)

| Methode | Pfad                                              | Zweck                                       |
|---------|---------------------------------------------------|---------------------------------------------|
| POST    | `/api/v1/dsgvo/access-request`                    | Auskunftsersuchen anlegen                   |
| GET     | `/api/v1/dsgvo/access-request/:id`                | Ergebnis abrufen (PDF + JSON-Export)        |
| POST    | `/api/v1/dsgvo/erasure-request`                   | Löschanfrage anlegen                        |
| POST    | `/api/v1/dsgvo/rectification`                     | Korrektur einer Beleg-Position              |
| GET     | `/api/v1/dsgvo/retention-status/:customer_id`     | Welche Belege fallen aus der Aufbewahrungsfrist? |
| POST    | `/api/v1/dsgvo/tenant-offboarding/:customer_id`   | Tenant offboarden (alle Daten exportieren + löschen, soweit erlaubt) |

Alle authentifiziert (HMAC) + audit-pflichtig.

## 5. Cron-Jobs

| Workflow              | Frequenz | Aufgabe                                                    |
|-----------------------|----------|------------------------------------------------------------|
| `WF-CRON-DSGVO-RETENTION` | täglich  | Belege > 10 Jahre alt → markieren, Operator-Review-Liste   |

(Aktuell als Skeleton, noch kein eigener Workflow-File — als Sub-Routine in `WF-CRON-M08`.)

## 6. UI in der Webapp

- Tenant-Settings → "Datenschutz" → Liste eigener DSGVO-Anfragen + Status
- Operator-View → "DSGVO-Queue" → eingehende Anfragen abarbeiten
- Tenant-Offboarding-Wizard (4 Schritte: Datenexport → Bestätigung → Löschung-mit-Aufbewahrungsfrist → AVV-Kündigung)

## 7. Audit-Anforderungen

Jede DSGVO-Aktion erzeugt einen `audit_log`-Eintrag mit:

- `action`: `dsgvo.access_request.created` / `dsgvo.erasure.executed` etc.
- `actor`: User-ID des Operators
- `subject`: customer_id + ggf. supplier_id
- `details`: vollständige Anfrage + Ergebnis-Hash

`audit_log`-Einträge zu DSGVO sind selbst niemals löschbar (Begründung: Nachweis dass DSGVO erfüllt wurde).

## 8. Abhängigkeiten

- `audit_log`-Tabelle (Foundation)
- Mail-Service (Bestätigungs-E-Mails an Anfragesteller)
- PDF-Generator (Auskunftsdokument)
- Storage-Adapter (Export-Archive)

## 9. Bekannte Grenzen

- Lieferanten-Anfragen müssen aktuell vom Operator bearbeitet werden (kein Self-Service-Portal für Lieferanten)
- Multi-Tenant-übergreifende Lieferanten (gleicher Lieferant bei mehreren Kunden) → Lösch-Anfrage betrifft nur einen Tenant, technisch korrekt, aber Operator muss erkennen

## 10. Acceptance Criteria

- [x] Auskunftsersuchen-API liefert PDF + JSON-Export
- [x] Lösch-Anfrage prüft Aufbewahrungsfrist und blockiert ggf.
- [x] Audit-Log enthält jede DSGVO-Aktion
- [x] Tenant-Offboarding läuft 4-stufig
- [x] DSGVO-Anfrage-Antwortzeit ≤ 30 Tage technisch sichergestellt (kein 30-Tage-Stau möglich, weil Cron-Mahnung)

---

# ERWEITERUNG 2026-05-15 — GoBD-Verfahrensdokumentations-Generator

> Hinzugefügt nach Konzept-Reboot. Diese Sektion ergänzt M12 um den automatischen Generator für GoBD-Verfahrensdokumentation pro Tenant — eines der wichtigsten Verkaufsargumente.

## 16. Übersicht

| Komponente | Empfänger | Frequenz | MVP-Pflicht? |
|---|---|---|---|
| **GoBD-Verfahrensdokumentation** | Wirt (für Kassennachschau-Vorlage) | monatlich aktualisiert | ✓ |
| **Subunternehmer-Liste-Sync** | Wirt (Pflicht-Update bei Änderungen) | bei Änderungen + jährlich | ✓ |
| **Datenexport bei Kündigung** | Wirt | bei Vertragsende | ✓ |
| **Auto-Lösch-Job** | intern (DSGVO-Pflicht) | 30 Tage nach Kündigung | ✓ |

---

## 17. GoBD-Verfahrensdokumentations-Generator

### 17.1 Warum das ein Killer-Feature ist

Jeder buchführungspflichtige Wirt **muss** eine GoBD-Verfahrensdokumentation haben. Sie wird bei der Kassennachschau zwingend verlangt. Das Schreiben dieser Doku ist **sehr aufwändig** (10–20 Seiten), die meisten Wirte haben sie nicht oder nur halb-fertig.

Wenn ProzessPilot diese Doku **automatisch generiert**, individuell pro Tenant, monatlich aktuell — ist das ein massiver Mehrwert, den **kein Konkurrenz-Tool bietet**.

### 17.2 Inhalt der Verfahrensdokumentation

Standard-Aufbau gemäß GoBD-Anforderungen:

1. **Allgemeines**
   - Stammdaten Unternehmen
   - Verantwortlicher für die Buchführung (Wirt) und Datenverarbeitung (ProzessPilot)
   - Aufzählung der Verfahren

2. **Eingangs-Belegerfassung**
   - Beleg-Eingangskanäle (WhatsApp / E-Mail / Web-Upload / SumUp-API)
   - Annahme-Verfahren (automatisch via Workflow)
   - Pflicht-Felder pro Beleg
   - Verfahren bei unklaren Belegen (Wirt-Rückfrage via Magic-Link)

3. **Belegverarbeitung**
   - OCR-Verfahren (Google Vision API, EU-Region)
   - Kategorisierungs-Verfahren (Anthropic Claude)
   - Bewirtungsbeleg-Sonderbehandlung
   - MwSt-Splitting
   - Pfand-Trennung
   - Manuelle Korrektur bei niedriger Confidence

4. **Belegarchivierung**
   - Speicher-Ort (Wirts-eigenes Google Drive oder Dropbox)
   - Aufbewahrungsfrist (10 Jahre, GoBD-Pflicht)
   - Unveränderbarkeits-Garantie (Hash-Sum SHA256 pro Beleg)
   - Audit-Trail (jeder Statuswechsel geloggt)

5. **Buchungs-Übergabe**
   - Steuerberater-Setup
   - Übergabe-Format (DATEV-CSV / Lexware Office API / sevDesk)
   - Frequenz (monatlich am 1.)
   - Quittung des Steuerberaters

6. **Datenschutz**
   - Verantwortliche Stellen
   - Auftragsverarbeitungsvertrag (Verweis auf AVV)
   - TOMs (Technische und Organisatorische Maßnahmen)
   - Subunternehmer-Liste

7. **Notfall-Verfahren**
   - Bei Datenverlust
   - Bei System-Ausfall
   - Wiederherstellungs-Plan

8. **Verantwortlichkeiten**
   - Wer macht was (Wirt / ProzessPilot / Steuerberater)
   - Eskalations-Wege

### 17.3 Generierungs-Logik

```
1. Backend zieht Tenant-Daten:
   - Stammdaten
   - Aktivierte Module
   - Konfigurierte Eingangs-Kanäle
   - Steuerberater-Anbindung
   - Archiv-Verbindung
   - SumUp-Connector (falls aktiv)

2. Template-Engine (Mustache oder Handlebars) füllt Master-Template aus

3. PDF-Generator (puppeteer oder pdfkit) erstellt PDF

4. PDF wird in MinIO gespeichert: tenants/<tenant_id>/gobd/verfahrensdoku-<date>.pdf

5. Versand:
   - Bei Erstgenerierung: Mail an Wirt mit Hinweis "GoBD-Doku ist da"
   - Bei monatlichen Updates: nur Hinweis im Spar-Bericht ("aktualisierte Doku verfügbar")
   - Wirt kann jederzeit aus Web-Chat-Widget anfordern
```

### 17.4 Update-Trigger

Die Doku wird automatisch neu generiert bei:

- Erstmaliger Tenant-Aktivierung
- Modul-Toggle-Änderung
- Steuerberater-Wechsel
- Kassen-Connector hinzugefügt/entfernt
- Subunternehmer-Liste geändert (z.B. neuer Adapter hinzugefügt)
- Monatlich (Cron, falls keine anderen Trigger)

### 17.5 Datenmodell

```sql
CREATE TABLE gobd_verfahrensdoku (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  version INTEGER NOT NULL,                       -- fortlaufend
  generated_at TIMESTAMPTZ DEFAULT now(),
  trigger_reason VARCHAR(50),                     -- 'initial' / 'monthly' / 'module_change' / 'subprocessor_change' / 'manual'
  pdf_path VARCHAR(500),                          -- in MinIO
  hash_sha256 VARCHAR(64),                        -- für Unveränderbarkeits-Beweis
  active BOOLEAN DEFAULT true,                    -- alte Versionen werden auf false gesetzt
  delivered_to_wirt_at TIMESTAMPTZ NULL,
  UNIQUE (tenant_id, version)
);
```

### 17.6 Web-Chat-Widget-Integration

Wirt kann im Web-Chat-Widget jederzeit anfordern:

> "GoBD-Doku herunterladen"

Triggert direkten Download der aktuellen Version. Discord-Notification an Mitarbeiter (informativ).

---

## 18. Subunternehmer-Liste-Sync

### 18.1 Wozu

Die Subunternehmer-Liste (Hetzner, Google Vision, Anthropic, Discord, SumUp, Twilio, Stripe, ...) ändert sich gelegentlich. Pflicht: Wirte bei Änderung **informieren**, weil im AVV vereinbart.

### 18.2 Workflow

```
1. Geschäftsführer pflegt zentrale subprocessors-Tabelle in Mitarbeiter-Webapp
2. Bei Änderung (Add/Remove): Backend triggert
3. Pro Tenant:
   - Mail an Wirt: "Update zu unseren Subunternehmern"
   - Anlage: aktualisierte Subunternehmer-Liste-PDF
   - Hinweis: "Du hast 30 Tage Widerspruchs-Recht. Bei Nicht-Einverständnis melden bitte."
4. Wirt-Reaktion:
   - Stille: nach 30 Tagen gilt als angenommen
   - Widerspruch: Mitarbeiter-Task "Wirt X widerspricht Subunternehmer-Update"
5. Auto-Update der Verfahrensdoku
```

### 18.3 Datenmodell

```sql
CREATE TABLE subprocessors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,                      -- z.B. "Discord Inc."
  purpose VARCHAR(200),                            -- z.B. "Mitarbeiter-Kommunikation"
  data_categories TEXT[],                          -- z.B. ["Discord-User-IDs", "Notifications"]
  location VARCHAR(50),                            -- z.B. "USA (mit SCCs)"
  dpa_url TEXT,                                    -- Link zu deren DPA
  added_at TIMESTAMPTZ DEFAULT now(),
  removed_at TIMESTAMPTZ NULL,
  active BOOLEAN GENERATED ALWAYS AS (removed_at IS NULL) STORED
);

CREATE TABLE subprocessor_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  subprocessor_id UUID REFERENCES subprocessors(id),
  notification_type VARCHAR(20),                   -- 'added' / 'removed' / 'changed'
  sent_at TIMESTAMPTZ,
  objection_received_at TIMESTAMPTZ NULL
);
```

---

## 19. Datenexport bei Kündigung

### 19.1 Pflicht

DSGVO Art. 20 (Recht auf Datenübertragbarkeit) + GoBD (10 Jahre Aufbewahrung beim Wirt).

### 19.2 Workflow

```
1. Wirt kündigt (manuell durch Mitarbeiter im Tenant-Detail markiert)
2. Backend triggert Export-Job:
   a. Buchungs-Daten aus DB → CSV + JSON
   b. Belegerfassungs-Status aller Belege → CSV
   c. Audit-Log → CSV
   d. GoBD-Verfahrensdoku → PDF (aktuelle Version)
   e. Subunternehmer-Verlauf → PDF
3. Alle Originale-Belege (PDFs) liegen bereits im Wirts-eigenen Drive
   → kein Migrations-Aufwand nötig
4. ZIP-Archiv erstellen, Verschlüsselung mit Passwort (an Wirt separat)
5. Mail an Wirt: "Hier dein vollständiger Datenexport"
6. Wirt hat 14 Tage Zeit, Daten zu sichern
7. Nach 30 Tagen: Auto-Lösch-Job (siehe 20)
```

### 19.3 Datenmodell

```sql
CREATE TABLE tenant_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  export_reason VARCHAR(30),                       -- 'kündigung' / 'dsgvo_request' / 'migration'
  export_path VARCHAR(500),                        -- ZIP-Pfad in MinIO
  export_password_hash VARCHAR(255),               -- für Wiederherstellung
  generated_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ NULL,
  acknowledged_by_wirt_at TIMESTAMPTZ NULL
);
```

---

## 20. Auto-Lösch-Job

### 20.1 Pflicht

DSGVO Art. 17 (Recht auf Löschung) + AVV-Klausel: 30 Tage nach Vertragsende vollständige Löschung.

### 20.2 Workflow

```
1. Cron täglich um 04:00:
   - Findet Tenants mit kündigungs_datum + 30 Tage <= today
   - UND export_acknowledged_by_wirt = true ODER export_delivered_at + 14 Tage > now
2. Pro betroffener Tenant:
   a. Lösch-Sequence:
      - Belege in MinIO: gelöscht
      - Receipt-Records in DB: gelöscht
      - Buchungen, Tasks, Chat-Messages: gelöscht
      - Auth-Sessions: revoziert
      - Discord-Threads: archiviert (nicht gelöscht — Discord erlaubt das nur eingeschränkt)
      - Magic-Link-Tokens: revoziert
   b. Backup-Bereinigung: aus Backup-Snapshots in den nächsten 30 Tagen entfernt
   c. tenant_exports + tenants-Eintrag bleibt (für Buchhaltung) aber:
      - alle PII-Felder werden anonymisiert
      - Status auf 'deleted'
3. Audit-Log-Eintrag 'tenant_data_deleted'
4. Mail-Bestätigung an Wirt: "Deine Daten wurden vollständig gelöscht"
5. Mitarbeiter-Webapp zeigt Tenant nicht mehr an (außer in Audit-View)
```

### 20.3 Datenmodell

```sql
ALTER TABLE tenants ADD COLUMN deletion_status VARCHAR(20) DEFAULT 'active';
-- Werte: 'active' / 'cancelled' / 'export_pending' / 'deletion_pending' / 'deleted'

ALTER TABLE tenants ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN deletion_scheduled_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN deleted_at TIMESTAMPTZ;
```

---

## 21. Implementations-Reihenfolge

| Phase | Komponente |
|---|---|
| P1.1 (KW 22) | Subprocessors-Tabelle + Initial-Liste |
| P1.2 (KW 25) | GoBD-Verfahrensdoku-Generator (Erstversion) |
| P1.2 (KW 26) | Erste Doku-Generierung für Pilot-Wirt |
| Phase 2 (M2+) | Datenexport + Auto-Lösch-Job |
| Phase 2 (M2+) | Subunternehmer-Notification-Workflow |

---

## 22. Tests

### 22.1 Unit-Tests

- Doku-Template-Rendering mit verschiedenen Tenant-Konfigurationen
- PDF-Generierung-Vergleich
- Hash-Berechnung für Unveränderbarkeit

### 22.2 Integration-Tests

- Voller Lösch-Workflow End-to-End mit Test-Tenant
- Subunternehmer-Notification-Versand
- Export-ZIP mit allen erwarteten Files

### 22.3 Compliance-Tests

- 50 verschiedene Tenant-Konfigurationen → 50 valide Verfahrensdokus
- Manuelle Review der ersten Pilot-Doku durch DSGVO-Anwalt vor Live-Schaltung

---

## 23. Bezug zu anderen Dokumenten

- `Mitarbeiter_Webapp.md` — Subprocessor-Verwaltung in System-Settings
- `Web_Chat_Widget.md` — Wirt kann GoBD-Doku im Chat anfordern
- `legal/AVV_Vorlage.md` — verlinkt auf Verfahrensdoku
- `legal/Subunternehmer.md` — Initial-Liste, manuell gepflegt

---

**Letzte Aktualisierung:** 2026-05-15 (Erweiterung GoBD-Generator + DSGVO-Workflows)
**Verantwortlich:** Andreas (Backend), Steve (DSGVO-Anwalts-Abstimmung)
