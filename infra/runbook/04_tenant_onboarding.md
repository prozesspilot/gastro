# 04 — Tenant Onboarding

Checkliste fuer die Einrichtung eines neuen Kunden (Tenants) in ProzessPilot.
Alle Schritte muessen in der angegebenen Reihenfolge ausgefuehrt werden.

Geschaetzte Dauer: **30-45 Minuten** fuer einen neuen Tenant.

---

## Vorbereitung

Folgende Informationen vom Kunden benoetigt:

- [ ] Firmenname und Anschrift
- [ ] WhatsApp-Handynummer (fuer Beleg-Eingang)
- [ ] E-Mail-Adresse fuer Onboarding-Mail
- [ ] Buchhaltungs-System: Lexoffice / sevDesk / keins
- [ ] Falls Lexoffice: API-Key (`Einstellungen -> API-Keys`)
- [ ] Falls sevDesk: API-Key (`Einstellungen -> API-Token`)
- [ ] Aktivierte Module (WhatsApp, Lexoffice, Monatsreport, etc.)
- [ ] DSGVO-Einwilligung und AV-Vertrag unterschrieben?

---

## Schritt 1: Tenant in der Datenbank anlegen

```sql
-- Neuen Tenant anlegen
INSERT INTO tenants (id, name, created_at)
VALUES (
  gen_random_uuid(),
  'Musterfirma GmbH',
  now()
)
RETURNING id;
-- ID notieren: TENANT_UUID

-- Verify
SELECT id, name, created_at FROM tenants WHERE name = 'Musterfirma GmbH';
```

- [ ] Tenant angelegt
- [ ] Tenant-UUID notiert: `____________________________________`

---

## Schritt 2: Customer Profile anlegen

```sql
-- Customer Profile erstellen
INSERT INTO customer_profiles (
  id,
  tenant_id,
  company_name,
  contact_email,
  whatsapp_number,
  enabled_modules,
  created_at
)
VALUES (
  gen_random_uuid(),
  'TENANT_UUID',
  'Musterfirma GmbH',
  'kontakt@musterfirma.de',
  '+4917612345678',  -- International-Format mit +
  '{"whatsapp": true, "lexoffice": true, "monthly_report": true}',
  now()
)
RETURNING id;
-- Customer-ID notieren
```

Moegliche `enabled_modules`-Optionen:
```json
{
  "whatsapp":       true,
  "lexoffice":      false,
  "sevdesk":        false,
  "monthly_report": true,
  "categorization": true,
  "dsgvo_export":   true
}
```

- [ ] Customer Profile angelegt
- [ ] Customer-UUID notiert: `____________________________________`

---

## Schritt 3: WhatsApp-Nummer konfigurieren

```sql
-- WhatsApp-Nummer im Customer Profile eintragen (falls noch nicht in Schritt 2)
UPDATE customer_profiles
SET whatsapp_number = '+4917612345678',
    updated_at = now()
WHERE id = 'CUSTOMER_UUID';

-- Verify: Nummer korrekt gesetzt?
SELECT id, company_name, whatsapp_number
FROM customer_profiles
WHERE id = 'CUSTOMER_UUID';
```

```bash
# WhatsApp-Webhook fuer neue Nummer registrieren (falls Twilio)
# Twilio Console -> Phone Numbers -> Aktive Nummern -> Webhook-URL setzen
# Webhook-URL: https://n8n.example.com/webhook/whatsapp-inbound

# Test: WhatsApp-Nachricht an +4917612345678 senden
# Erwartung: Antwort "Beleg wird verarbeitet..." oder aehnlich
```

- [ ] WhatsApp-Nummer korrekt eingetragen
- [ ] Webhook-URL in Twilio/Meta-Konfiguration gesetzt
- [ ] Test-Nachricht gesendet und Antwort erhalten

---

## Schritt 4: Buchhaltungs-System API-Keys hinterlegen

### Option A: Lexoffice

```sql
-- Lexoffice API-Key in customer_credentials speichern
INSERT INTO customer_credentials (
  id,
  customer_id,
  provider,
  api_key,
  created_at
)
VALUES (
  gen_random_uuid(),
  'CUSTOMER_UUID',
  'lexoffice',
  pgp_sym_encrypt('sk-lexoffice-apikey-hier', current_setting('app.encryption_key')),
  now()
);
```

Lexoffice-Verbindung testen:
```bash
curl -s https://api.lexoffice.io/v1/profile \
  -H "Authorization: Bearer LEXOFFICE_API_KEY" | jq .organizationId
```

### Option B: sevDesk

```sql
-- sevDesk API-Token speichern
INSERT INTO customer_credentials (
  id,
  customer_id,
  provider,
  api_key,
  created_at
)
VALUES (
  gen_random_uuid(),
  'CUSTOMER_UUID',
  'sevdesk',
  pgp_sym_encrypt('sevdesk-api-token-hier', current_setting('app.encryption_key')),
  now()
);
```

sevDesk-Verbindung testen:
```bash
curl -s "https://my.sevdesk.de/api/v1/CheckAccount?token=SEVDESK_TOKEN" | jq .status
```

- [ ] API-Key/Token korrekt gespeichert (verschluesselt in DB)
- [ ] Verbindung zum Buchhaltungs-System erfolgreich getestet

---

## Schritt 5: Test-Beleg durch die Pipeline schicken

```bash
# Option A: Via WhatsApp (am realistischsten)
# Sende eine PDF-Quittung per WhatsApp an die konfigurierte Nummer.
# Erwarteter Ablauf:
# 1. WhatsApp-Nachricht eingeht -> n8n Webhook triggt
# 2. Status: received -> extracting -> categorized -> (ggf. synced)
# Dauer: 30-120 Sekunden

# Option B: Direkt via API
curl -X POST https://api.example.com/api/v1/receipts \
  -H "X-Tenant-ID: TENANT_UUID" \
  -F "file=@/path/to/test-receipt.pdf" \
  -F "customer_id=CUSTOMER_UUID"

# Status verfolgen
psql $DATABASE_URL -c "
SELECT id, status, total_amount, category, updated_at
FROM receipts
WHERE tenant_id = 'TENANT_UUID'
ORDER BY created_at DESC
LIMIT 5;
"
```

Erwartetes Ergebnis nach 2 Minuten:
```
status: 'categorized'  (oder 'synced' bei Lexoffice/sevDesk)
total_amount: <Betrag aus PDF>
category: <automatisch vergeben>
```

- [ ] Test-Beleg erfolgreich hochgeladen
- [ ] Status `categorized` oder `synced` erreicht
- [ ] Kategorie sieht plausibel aus
- [ ] Falls Lexoffice/sevDesk: Beleg in Buchhaltungs-System sichtbar

---

## Schritt 6: Kategorisierungs-Mapping pruefen

Haeufige Lieferanten des Kunden erfragen und sicherstellen, dass Kategorien korrekt zugewiesen werden:

```sql
-- Bestehende Mappings fuer diesen Tenant anschauen
SELECT supplier_name, category, confidence_score
FROM categorization_mappings
WHERE tenant_id = 'TENANT_UUID'
ORDER BY confidence_score DESC
LIMIT 20;

-- Manuelles Mapping fuer bekannte Lieferanten hinzufuegen
INSERT INTO categorization_mappings (
  id, tenant_id, supplier_name, category, is_manual, created_at
)
VALUES
  (gen_random_uuid(), 'TENANT_UUID', 'Amazon Business', 'Bueroausstattung', true, now()),
  (gen_random_uuid(), 'TENANT_UUID', 'Deutsche Telekom', 'Telekommunikation', true, now()),
  (gen_random_uuid(), 'TENANT_UUID', 'REWE', 'Bewirtungskosten', true, now());
```

- [ ] Mindestens 5 haeufige Lieferanten-Mappings eingetragen
- [ ] Kategorien stimmen mit Kunden-Kontenrahmen ueberein

---

## Schritt 7: Monatsreport-Cron aktivieren

```sql
-- Monatsreport-Konfiguration einrichten
INSERT INTO report_schedules (
  id,
  tenant_id,
  report_type,
  cron_expression,
  recipients,
  is_active,
  created_at
)
VALUES (
  gen_random_uuid(),
  'TENANT_UUID',
  'monthly_summary',
  '0 8 1 * *',  -- Am 1. jeden Monats um 08:00 Uhr
  ARRAY['kontakt@musterfirma.de'],
  true,
  now()
);
```

- [ ] Monatsreport-Cron aktiv
- [ ] E-Mail-Adresse korrekt eingetragen
- [ ] Test-Report ausgeloest (optional):

```bash
# Optionaler Test: Report manuell triggern
curl -X POST https://api.example.com/api/v1/reports/generate \
  -H "X-Tenant-ID: TENANT_UUID" \
  -H "Content-Type: application/json" \
  -d '{"report_type": "monthly_summary", "month": "2026-04"}'
```

---

## Schritt 8: DSGVO-Pruefung

```
[ ] DSGVO-Einwilligungserklarung vom Kunden unterschrieben erhalten
[ ] Auftragsverarbeitungsvertrag (AV-Vertrag) unterschrieben
[ ] AV-Vertrag in CRM / Dokumentenmanagementsystem abgelegt
[ ] Loeschfristen konfiguriert:
    - Belege: 10 Jahre (steuerrechtliche Aufbewahrungspflicht)
    - PII (Name/Kontaktdaten nach Vertragsende): 30 Tage
[ ] Datenschutzbeauftragten informiert (falls vorhanden)
```

---

## Schritt 9: Backup verifizieren

```bash
# Stellt sicher, dass der neue Tenant im naechsten Backup enthalten ist
# Backup manuell ausloesen (oder warten bis naechsten Cron)
/opt/prozesspilot/scripts/backup.sh

# Neues Backup pruefen: Tenant taucht auf?
pg_restore --list /backup/latest.dump | grep -i "prozesspilot"

# Direkt: Tenant in aktueller DB vorhanden
psql $DATABASE_URL -c "
SELECT id, name, created_at
FROM tenants
WHERE id = 'TENANT_UUID';
"
```

- [ ] Tenant im Backup vorhanden
- [ ] Backup-Log zeigt keinen Fehler: `tail /var/log/pp-backup.log`

---

## Schritt 10: Onboarding-Mail versenden

Mail-Vorlage (anpassen!):

```
Betreff: ProzessPilot — Ihre Zugangsdaten und erste Schritte

Sehr geehrte Damen und Herren,

herzlich willkommen bei ProzessPilot!

Ihre Konfiguration ist abgeschlossen. Hier sind Ihre Zugangsdaten:

WhatsApp-Nummer fuer Belegeingang:
  +49XXX XXX XXXX (unsere Empfangsnummer)

Ihr erster Beleg:
  Fotografieren Sie einfach Ihre Quittung und senden Sie das Bild
  per WhatsApp an die oben genannte Nummer.
  Innerhalb von 2 Minuten wird der Beleg automatisch verarbeitet.

Dashboard-Zugang:
  URL:      https://app.prozesspilot.de
  Tenant:   [Tenant-Name]
  Zugangsdaten: [werden separat zugesendet]

Monatsreport:
  Sie erhalten am 1. jeden Monats eine automatische Zusammenfassung
  aller Belege an: [E-Mail]

Bei Fragen stehen wir Ihnen gerne zur Verfuegung.

Mit freundlichen Gruessen
ProzessPilot Support
```

- [ ] Onboarding-Mail versendet
- [ ] Zugangsdaten separat/sicher uebermittelt (nicht per E-Mail im Klartext!)
- [ ] Rueckmeldung vom Kunden nach erstem Test erhalten

---

## Onboarding-Abschluss-Checkliste

Alle Punkte abgehakt, bevor Tenant als "onboarded" gilt:

```
[ ] Schritt 1: Tenant in DB angelegt
[ ] Schritt 2: Customer Profile erstellt mit korrekten enabled_modules
[ ] Schritt 3: WhatsApp-Nummer konfiguriert und getestet
[ ] Schritt 4: Buchhaltungs-API-Key hinterlegt und verifiziert
[ ] Schritt 5: Test-Beleg erfolgreich durch die gesamte Pipeline
[ ] Schritt 6: Kategorisierungs-Mapping fuer 5+ Lieferanten
[ ] Schritt 7: Monatsreport-Cron aktiv
[ ] Schritt 8: DSGVO/AV-Vertrag abgeschlossen
[ ] Schritt 9: Backup verifiziert
[ ] Schritt 10: Onboarding-Mail versendet, Kunde bestaetigt
```

Datum Onboarding abgeschlossen: `____________________________`
Durchgefuehrt von: `____________________________`
