# M09 — Lieferanten-Kommunikation

> **Paket:** Pro
> **Phase:** 3
> **Verantwortlich:** Automatische Bestätigungen und Rückfragen per E-Mail
> **Spec-Version:** 1.0

---

## 1. Zweck

M09 schickt Lieferanten automatisch:

1. **Bestätigungen** beim Belegeingang (optional pro Lieferant).
2. **Rückfragen** bei unlesbaren oder unvollständigen Belegen (`requires_review` mit Grund „LOW_QUALITY" oder „MISSING_FIELDS").
3. **Mahnungen** bei fehlenden Pflicht-Belegen (z. B. monatliche Pacht-Rechnung erwartet, kommt aber nicht).

Damit reduziert M09 manuelle Nacharbeit für den Kunden und sorgt für saubere Buchhaltung.

---

## 2. Verantwortlichkeit

- Reaktive Mails bei `pp.receipt.requires_review` mit bestimmtem Grund.
- Proaktive Mails per Cron für „erwartete, aber fehlende" Belege.
- Templates pro Kunde austauschbar.
- Antwort-Tracking: Lieferanten-Antwort-Mails werden automatisch dem Beleg zugeordnet (Inbound-Mail mit Reference-ID im Subject).

---

## 3. Trigger

| Trigger                           | Quelle                                 |
|-----------------------------------|----------------------------------------|
| `pp.receipt.requires_review`      | Event-Bus (M01/M03)                    |
| Cron `0 9 * * 1` (Wo. 09:00)      | Geplante Erinnerungen                   |
| Manual aus Web-App                | Operator/Customer trigger Anschreiben   |
| Inbound-Mail Webhook              | Antwort eines Lieferanten              |

---

## 4. Abhängigkeiten

| Abhängigkeit         | Genutzt für                           |
|----------------------|---------------------------------------|
| Mail-Service (SMTP)  | Versand                               |
| Inbound-Mail (Mailgun/Postmark) | Antwort-Empfang             |
| Postgres             | Lieferanten-Stammdaten, Erwartungs-Regeln |
| Hook-System          | `on_requires_review`                  |

---

## 5. Output

```json
{
  "ok": true,
  "module": "M09",
  "data": {
    "communication_id": "comm_01HVZ...",
    "channel": "email",
    "to": "kontakt@metro.de",
    "template": "missing_invoice_de_v2",
    "delivered_at": "2026-04-29T08:30:00Z",
    "linked_receipt_id": "01HVZ8X4..."
  }
}
```

---

## 6. n8n-Workflow `WF-M09`

### 6.1 Event-Trigger-Variante

| #  | Node               | Name                                              |
|----|--------------------|---------------------------------------------------|
| 1  | Execute Workflow   | `Trigger: pp.receipt.requires_review` (vom Dispatcher) |
| 2  | HTTP Request       | `Backend: build communication`                    |
| 3  | IF                 | `IF: ok && action='send'`                         |
| 4  | HTTP Request       | `Backend: send communication`                     |

Endpoint: `POST /api/v1/communications/build` und `.../send`.

### 6.2 Cron-Variante (fehlende Belege)

| #  | Node               | Name                                          |
|----|--------------------|-----------------------------------------------|
| 1  | Cron               | `Mo 09:00`                                    |
| 2  | HTTP Request       | `Backend: list expected-missing receipts`     |
| 3  | Loop               |                                               |
| 4  |   HTTP Request     | `Backend: build communication`                |
| 5  |   HTTP Request     | `Backend: send communication`                 |

---

## 7. Backend-API

### 7.1 `POST /api/v1/communications/build`

Body:
```json
{
  "trigger": "requires_review",
  "receipt_id": "01HVZ8X4...",
  "reason": "LOW_QUALITY"
}
```

Logik:

```ts
async function buildCommunication(input: BuildInput): Promise<CommDraft | { skip: true }> {
  const profile = await profileService.get(input.customer_id);
  if (!profile.integrations.supplier_communication?.enabled) return { skip: true };

  const templateKey = pickTemplate(profile, input.trigger, input.reason);
  // requires_review/LOW_QUALITY → 'low_quality'
  // requires_review/MISSING_FIELDS → 'missing_invoice'

  const receipt = await receiptRepo.findById(input.receipt_id, profile.customer_id);
  const supplier = await supplierRepo.find(receipt.extraction.fields.supplier_name);

  if (!supplier?.contact_email) {
    // Kein Mail-Kontakt bekannt → Operator-Aufgabe
    await operatorTaskRepo.create({ kind: 'missing_supplier_email', receipt_id: receipt.receipt_id });
    return { skip: true };
  }

  // Hook: on_requires_review → kann Custom-Template injizieren oder skip:true setzen
  const hooked = await hookRunner.run('on_requires_review', { receipt, profile, draft: { template: templateKey, supplier } });
  if (hooked.skip) return { skip: true };

  const referenceId = `PP-REF-${receipt.receipt_id.slice(-12)}`;
  const draft = renderEmailDraft(hooked.template, { receipt, profile, supplier, referenceId });

  return {
    communication_id: ulid('comm'),
    customer_id: profile.customer_id,
    receipt_id: receipt.receipt_id,
    channel: 'email',
    to: supplier.contact_email,
    subject: draft.subject,
    body_html: draft.body_html,
    body_text: draft.body_text,
    reference_id: referenceId,
  };
}
```

### 7.2 `POST /api/v1/communications/send`

Sendet, persistiert in `communications`-Tabelle, emittiert `pp.communication.sent`.

### 7.3 `POST /webhooks/email/inbound`

Mailgun/Postmark Webhook. Backend extrahiert `PP-REF-xxxx` aus Subject/Body, mappt auf Receipt, hängt die Antwort als `attachments` in den Beleg an. Wenn die Antwort einen neuen Beleg enthält → Pipeline-Trigger.

---

## 8. Templates

```
backend/src/modules/m09-supplier-comm/templates/
├── confirmation_received_de_v1.{hbs,css}
├── low_quality_de_v1.{hbs,css}
├── missing_invoice_de_v2.{hbs,css}
└── reminder_overdue_de_v1.{hbs,css}
```

### 8.1 Beispiel `low_quality_de_v1`

Subject: `Rechnung {{document_number}} – Bitte erneut zusenden ({{ref}})`

Body:
```
Sehr geehrte Damen und Herren,

am {{received_date}} ist Ihr Beleg „{{document_number}}" bei {{customer.legal_name}} eingegangen.
Leider war die Datei nicht vollständig lesbar (Grund: {{reason_de}}).

Bitte senden Sie uns die Rechnung erneut als PDF an:
{{customer.belege_email}}

Bitte den Hinweis {{ref}} in der Antwort behalten – das hilft uns bei der Zuordnung.

Mit freundlichen Grüßen
Buchhaltung {{customer.display_name}}
```

Pro-Kunden können eigene Templates pflegen — siehe Hook-Mechanismus.

---

## 9. Erwartete-Belege-Logik

```sql
CREATE TABLE expected_receipts (
  expected_id        TEXT PRIMARY KEY,
  customer_id        TEXT NOT NULL,
  supplier_name      TEXT NOT NULL,
  cadence            TEXT NOT NULL,        -- 'monthly', 'quarterly'
  expected_day       INT,                  -- z. B. 5 (5. eines Monats)
  amount_min         NUMERIC,
  amount_max         NUMERIC,
  remind_after_days  INT NOT NULL DEFAULT 5,
  active             BOOLEAN NOT NULL DEFAULT true
);
```

Cron-Logik: für jeden Eintrag prüfen, ob im erwarteten Zeitraum ein Beleg eingegangen ist. Falls nein und `today >= expected_day + remind_after_days` → Erinnerung an Lieferant.

---

## 10. Datenstruktur

```sql
CREATE TABLE communications (
  communication_id   TEXT PRIMARY KEY,
  customer_id        TEXT NOT NULL,
  receipt_id         TEXT,
  expected_id        TEXT,
  channel            TEXT NOT NULL,
  direction          TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  template           TEXT,
  to_address         TEXT,
  from_address       TEXT,
  subject            TEXT,
  reference_id       TEXT,
  body_text          TEXT,
  body_html          TEXT,
  status             TEXT NOT NULL,        -- 'sent','delivered','bounced','reply_received'
  external_id        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comm_reference ON communications (reference_id);
```

---

## 11. Events

| Event                       | Wann                              |
|-----------------------------|-----------------------------------|
| `pp.communication.sent`     | Mail erfolgreich verschickt       |
| `pp.communication.bounced`  | Bounce erhalten                   |
| `pp.communication.replied`  | Antwort empfangen                 |

---

## 12. Fehlerbehandlung

| Fehler                          | Klasse        | Handling                              |
|---------------------------------|---------------|---------------------------------------|
| Lieferant ohne Mail             | Business      | Operator-Task statt automatischer Versand |
| Bounce                          | Validation    | Communication-Status `bounced`, Operator-Alert |
| Inbound ohne Reference-ID       | Validation    | Operator-Inbox in Web-App             |
| Template-Render-Fehler          | Fatal         | Operator-Alert                        |

---

## 13. Anti-Spam-Schutz

- Pro `(customer_id, supplier_email)` max. 1 Mail/Tag (außer Operator force).
- Reply-To = belege-Inbox des Kunden.
- DKIM/SPF/DMARC korrekt für `customer.belege_email` (Onboarding-Schritt).

---

## 14. Code-Struktur

```
backend/src/modules/m09-supplier-comm/
├── routes.ts
├── handlers/
│   ├── build.handler.ts
│   ├── send.handler.ts
│   └── inbound.handler.ts
├── services/
│   ├── template-renderer.ts
│   ├── reference-resolver.ts
│   └── expected-checker.ts
├── templates/
├── tests/
└── README.md
```

---

## 15. Acceptance Criteria

- [ ] Bei `requires_review` mit Grund „LOW_QUALITY" wird automatisch Lieferantenmail erzeugt.
- [ ] Reference-ID landet in Subject und Body.
- [ ] Inbound-Reply mit Reference-ID wird automatisch dem Receipt zugeordnet.
- [ ] Bei fehlender Lieferanten-Mail wird Operator-Task erzeugt, nichts versendet.
- [ ] Pro-Kunden können Templates per Hook überschreiben.
- [ ] Anti-Spam-Limit funktioniert (max. 1×/Tag pro Lieferant).
- [ ] Cron erzeugt Erinnerung für erwartete, aber fehlende Belege.
