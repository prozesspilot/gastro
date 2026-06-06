# M11 — IMAP / E-Mail Eingang

> ⚠️ **EINGEFROREN (Stand 2026-06-06)** — beschreibt ein ungebautes/totes Modul, das aktuell gegen nicht-existente (Geister-)Tabellen läuft (HTTP 500). Die „✅ implementiert"-Zeile unten ist **überholt** (das Modul läuft gegen `customer_profiles`/`customers`/`receipts`, die es nicht gibt). Diese Spec gilt erst nach Reaktivierung (Post-Pilot). Was wirklich läuft, steht in `.claude/CLAUDE.md` §3.

> **Status (2026-05-07):** ✅ implementiert. Spec wurde nachgezogen, weil das Modul ursprünglich nicht in der Konzeption stand.
> **Code:** `backend/src/modules/m11-imap/`
> **n8n-Workflow:** `n8n/workflows/WF-INPUT-IMAP.json`
> **Paket:** Basic+

---

## 1. Zweck

Alternativer Eingangskanal zu M10 (WhatsApp). Belege erreichen ProzessPilot per E-Mail (Anhang oder eingebettetes Bild). Wichtig für:

- Lieferanten, die Rechnungen per E-Mail schicken
- Buchhalter, die Belege gesammelt weiterleiten
- Kunden, die kein WhatsApp Business haben

Ergänzt M10, ersetzt es nicht.

## 2. Verantwortlichkeit

- IMAP-Postfach pollen (oder Webhook-basierten Mail-Provider entgegennehmen)
- Anhänge extrahieren (PDF, JPG, PNG, HEIC)
- Absender-E-Mail gegen `customer_profile.integrations.input_email.allowed_senders[]` prüfen
- Bei Match: Beleg in Storage hochladen, `pp.receipt.received` emittieren, `WF-MASTER-RECEIPT` triggern
- Bei Nicht-Match: Hinweis-E-Mail zurückschicken (analog M10 sender_not_registered)

## 3. Trigger

| Variante              | Wann                         | Quelle                          |
|-----------------------|------------------------------|---------------------------------|
| IMAP-Polling (Default)| alle 5 min via n8n Schedule  | IMAP-Server (z. B. Outlook, Gmail) |
| Webhook (Optional)    | sofort                       | Mailgun / SendGrid Inbound      |

## 4. Input / Output

### 4.1 Input (vom n8n IMAP-Trigger)

```json
{
  "from": "lieferant@example.com",
  "to": "belege@kunde.de",
  "subject": "Rechnung 4711",
  "body_text": "...",
  "attachments": [
    { "filename": "rechnung-4711.pdf", "mime_type": "application/pdf", "content_base64": "..." }
  ],
  "received_at": "2026-05-07T10:23:00Z"
}
```

### 4.2 Output (an `WF-MASTER-RECEIPT`)

Standard-`Receipt`-JSON nach [01_Datenmodell_Events.md §2.1](../01_Datenmodell_Events.md), mit `source.channel = "email"`.

## 5. Endpoints (Backend)

| Methode | Pfad                                          | Zweck                                      |
|---------|-----------------------------------------------|--------------------------------------------|
| POST    | `/api/v1/internal/email/resolve`              | Customer per `to`-Adresse + Sender prüfen  |
| POST    | `/api/v1/internal/email/attachment`           | Anhang in Storage hochladen, Idempotenz    |
| POST    | `/api/v1/internal/email/send-bounce`          | Hinweis-Mail an unbekannten Absender       |

Alle HMAC-geschützt (analog M10).

## 6. Customer-Profil-Felder

```json
{
  "integrations": {
    "input_email": {
      "inbox_address": "belege+cust_123@inbound.prozesspilot.de",
      "imap": {
        "host": "imap.example.com",
        "port": 993,
        "user_credential_id": "cred_...",
        "folder": "INBOX",
        "delete_after_processing": false
      },
      "allowed_senders": [
        { "email": "lieferant@example.com", "label": "Bäckerei Schmidt" }
      ],
      "auto_reply": true
    }
  }
}
```

## 7. Events

- `pp.receipt.received` (mit `source.channel = "email"`)
- `pp.email.bounced` (bei nicht erlaubtem Sender)

## 8. Fehlerhandling

- IMAP-Verbindung weg → Retry exponential, nach 5× → Operator-Alert via Slack/Mail
- Anhang > 10 MB → ablehnen, Bounce mit Hinweis
- HEIC-Anhang → automatisch in JPEG konvertieren (libvips, schon in Backend vorhanden)

## 9. Abhängigkeiten

- M01 (Belegerfassung) — wird via `WF-MASTER-RECEIPT` aufgerufen
- Storage-Adapter (D8)
- Event-Bus (D6)
- Mail-Service (`backend/src/core/mail/`) für Bounce-E-Mails

## 10. Bekannte Grenzen

- Keine OAuth-IMAP-Variante (Gmail mit OAuth muss noch dazu, wenn Kunde es braucht)
- Eingebettete Bilder im HTML-Body werden aktuell nicht extrahiert — nur echte Anhänge

## 11. Acceptance Criteria

- [x] IMAP-Polling alle 5 min läuft via n8n-Cron
- [x] Bekannter Absender → Beleg landet in Storage + `pp.receipt.received` emittiert
- [x] Unbekannter Absender → Bounce-Mail, Beleg verworfen
- [x] HEIC → JPEG-Konvertierung
- [x] PDF und JPG werden gleich behandelt wie via WhatsApp
