# M08 Monatsreporting — Phase-2-TODOs

> Erstellt: 2026-05-12 (autonomer Fix-Lauf)
> Quelle: Audit-Befund E7 aus STATUS_AUDIT_2026-05-12.html

Beide Sender in `backend/src/modules/m08-reporting/services/` sind aktuell
**STUBs** — das Interface ist korrekt implementiert, der eigentliche Versand
fehlt. Dieser Zustand ist bewusst und dokumentiert; der Code wirft
`MailNotConfiguredError` bzw. loggt „WhatsApp-Versand (STUB)".

---

## TODO 1 — Mail-Versand (nodemailer SMTP)

**Datei:** `backend/src/modules/m08-reporting/services/mail-sender.ts`

**Aktueller Stand:**

```typescript
// TODO Phase 2: nodemailer SMTP-Implementation
throw new MailNotConfiguredError();
```

**Was fehlt:**

1. `nodemailer` als Dependency installieren (`npm install nodemailer @types/nodemailer`)
2. SMTP-Config aus ENV lesen (bereits in `.env.example` teilweise vorhanden):
   ```
   SMTP_HOST=smtp.yourprovider.de
   SMTP_PORT=587
   SMTP_USER=noreply@yourdomain.de
   SMTP_PASSWORD=...
   SMTP_FROM="ProzessPilot <noreply@yourdomain.de>"
   ```
3. `createTransport` aufrufen, Mail mit PDF-Anhang versenden
4. Fehlerbehandlung: Retry-Logik (3x mit exponential backoff) +
   `delivery_log`-Eintrag in DB (Tabelle existiert bereits)
5. Test: Unit-Test mit `nodemailer-mock`

**Priorität:** Mittel — erst relevant wenn SMTP-Credentials für Pilot-Kunden vorhanden.

**Spec-Referenz:** `modules/M08_Monatsreporting.md` §6 (Versand-Kanal `email`)

---

## TODO 2 — WhatsApp-Versand (Meta Graph API)

**Datei:** `backend/src/modules/m08-reporting/services/whatsapp-sender.ts`

**Aktueller Stand:**

```typescript
// TODO Phase 2: Graph-API call template "monthly_report_de"
```

**Was fehlt:**

1. `WHATSAPP_GRAPH_API_VERSION` + `WHATSAPP_APP_SECRET` sind bereits in ENV
2. Meta Business API: Template `monthly_report_de` in Meta Business Manager anlegen
   (Template muss von Meta genehmigt werden — 2–3 Tage Vorlauf!)
3. API-Call implementieren:
   ```
   POST https://graph.facebook.com/v{VERSION}/PHONE_NUMBER_ID/messages
   Body: { type: "template", template: { name: "monthly_report_de", ... } }
   ```
4. Telefonnummer aus Customer-Profil lesen (`customer_profiles.meta.whatsapp_phone`)
5. PDF-Link als Media-URL mitgeben (MinIO presigned URL, 1h gültig)
6. Fehlerbehandlung + delivery_log-Eintrag

**Priorität:** Niedrig — erst relevant nach Meta-Verifizierung + Template-Genehmigung.
Blockiert auf WhatsApp Business API-Verifizierung (2–3 Wochen Vorlauf, siehe Phase C).

**Spec-Referenz:** `modules/M08_Monatsreporting.md` §6 (Versand-Kanal `whatsapp`)

---

## Abhängigkeiten

- Meta-Verifizierung muss abgeschlossen sein (Phase B/C)
- SMTP-Credentials müssen vom Piloten konfiguriert werden
- `delivery_log`-Tabelle existiert bereits (Migration 022)
- `deliver.handler.ts` ruft beide Services korrekt auf — kein Umbau nötig, nur Implementation der STUBs
