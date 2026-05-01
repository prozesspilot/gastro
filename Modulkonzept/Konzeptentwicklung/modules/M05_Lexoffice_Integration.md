# M05 — Lexoffice-Integration

> **Paket:** Standard, Pro
> **Phase:** 2
> **Verantwortlich:** Push der kategorisierten Belege als Voucher nach Lexoffice
> **Spec-Version:** 1.0

---

## 1. Zweck

M05 überträgt einen kategorisierten Beleg als Voucher (Buchungsbeleg) inklusive Anhang nach Lexoffice. Lexoffice bleibt das System des Kunden — ProzessPilot ersetzt es nicht, sondern befüllt es automatisch.

---

## 2. Verantwortlichkeit

- Mapping `Receipt → Lexoffice-Voucher-Payload`.
- Anhang-Upload (PDF aus M02 oder Original).
- Erstellung des Vouchers via Lexoffice-API.
- Persistenz `external_id` in `receipts.payload.exports[]`.
- Hook `before_export.lexoffice` und `after_export.lexoffice`.
- Idempotenz pro `(receipt_id, target=lexoffice)`.

---

## 3. Trigger

- Sub-Workflow-Aufruf aus `WF-MASTER-RECEIPT`.
- Akzeptierter Status: `archived` oder `categorized`.
- Aktiv nur wenn Profil: `integrations.booking.providers` enthält `lexoffice` UND `M05` in `modules_enabled`.

---

## 4. Abhängigkeiten

| Abhängigkeit         | Genutzt für                              |
|----------------------|------------------------------------------|
| Lexoffice REST API   | `vouchers`, `files`                       |
| MinIO                | Anhang-Lesen                             |
| Hook-System          | Pro-Anpassungen                          |

---

## 5. Input / Output

### 5.1 Input

```json
{ "receipt": { "..." }, "customer_profile": { "...mit lexoffice_credential_ref..." } }
```

### 5.2 Output

```json
{
  "ok": true,
  "module": "M05",
  "receipt_patch": {
    "exports": [
      {
        "target": "lexoffice",
        "status": "pushed",
        "external_id": "voucher_99887766",
        "external_url": "https://app.lexoffice.de/vouchers/99887766",
        "pushed_at": "2026-04-29T08:14:52Z"
      }
    ]
  },
  "events_to_emit": ["pp.receipt.exported"]
}
```

---

## 6. n8n-Workflow `WF-M05`

| #  | Node                | Name                                    |
|----|---------------------|-----------------------------------------|
| 1  | Execute Workflow    | `Trigger`                               |
| 2  | Code                | `Function: assert_status`               |
| 3  | HTTP Request        | `Backend: Push Lexoffice`               |
| 4  | IF                  | `IF: ok`                                |
| 5  | Set                 | `Build: Result`                         |
| 6  | Respond to Workflow | `Respond`                               |

Endpoint: `POST /api/v1/receipts/{id}/exports/lexoffice`.

---

## 7. Backend-API

### 7.1 `POST /api/v1/receipts/{receipt_id}/exports/lexoffice`

Backend-Logik:

```ts
async function pushToLexoffice(receiptId: string, profile: CustomerProfile) {
  let receipt = await receiptRepo.findById(receiptId, profile.customer_id);
  assertStatus(receipt, ['archived', 'categorized']);

  // Idempotenz: schon gepusht?
  const existing = receipt.exports?.find(e => e.target === 'lexoffice' && e.status === 'pushed');
  if (existing) return receipt;

  // Voucher-Payload bauen
  const voucher = buildLexofficeVoucher(receipt, profile);

  // Hook before_export.lexoffice (Pro-Kunden können Voucher anpassen)
  const hookResult = await hookRunner.run('before_export.lexoffice', { receipt, profile, voucher });

  // Lexoffice-Client (Backend-Proxy zu Lexoffice REST)
  const client = await lexofficeClient.forCustomer(profile.customer_id);

  // 1. Voucher anlegen
  const created = await client.createVoucher(hookResult.voucher);                  // POST /v1/vouchers
  // 2. Datei anhängen (PDF aus Archive falls vorhanden, sonst Original)
  const fileBytes = await pickAttachmentBytes(receipt);
  await client.uploadVoucherFile(created.id, fileBytes, `${receipt.receipt_id}.pdf`);

  // Receipt patchen
  const exportEntry = {
    target: 'lexoffice' as const,
    status: 'pushed' as const,
    external_id: created.id,
    external_url: `https://app.lexoffice.de/vouchers/${created.id}`,
    pushed_at: new Date().toISOString(),
  };
  receipt.exports = [...(receipt.exports ?? []).filter(e => e.target !== 'lexoffice'), exportEntry];
  receipt.status = 'exported';

  receipt = await hookRunner.run('after_export.lexoffice', { receipt, profile, result: created });

  const saved = await receiptRepo.update(receipt);
  await audit.log(saved, 'exported.lexoffice', { external_id: created.id });
  await events.emit('pp.receipt.exported', { ...saved, target: 'lexoffice' });
  return saved;
}
```

---

## 8. Lexoffice-Voucher-Mapping

```ts
function buildLexofficeVoucher(r: Receipt, p: CustomerProfile): LexofficeVoucher {
  const f = r.extraction.fields;
  const c = r.categorization;

  return {
    type: 'salesinvoice'?'expense':'expense',         // immer 'expense' für eingehende Rechnungen
    voucherNumber: f.document_number,
    voucherDate: f.document_date,                     // YYYY-MM-DD
    shippingDate: f.document_date,
    dueDate: f.document_date,                         // konservativ: same day
    totalGrossAmount: f.total_gross,
    totalTaxAmount: sum(f.tax_lines.map(t => t.amount)),
    taxType: 'gross',
    useCollectiveContact: !lookupContactId(f.supplier_vat_id),
    contactId: lookupContactId(f.supplier_vat_id) ?? null,   // sonst Sammel-Kreditor
    voucherItems: [{
      amount: f.total_gross,
      taxAmount: sum(f.tax_lines.map(t => t.amount)),
      taxRatePercent: dominantTaxRate(f.tax_lines) * 100,
      categoryId: mapSkrToLexofficeCategoryId(c.skr_account, p),
      // Kostenstelle: Lexoffice-API unterstützt das nicht direkt → in 'memo'
    }],
    memo: [
      `ProzessPilot Receipt ${r.receipt_id}`,
      c.cost_center ? `Kostenstelle: ${c.cost_center}` : null,
    ].filter(Boolean).join(' · '),
  };
}
```

### 8.1 Kontaktauflösung

- Wenn `supplier_vat_id` in Lexoffice-Kontakten existiert (Backend hat Mapping-Cache `customer_id × vat_id → contactId`), wird `contactId` gesetzt.
- Sonst: Sammel-Kreditor (`useCollectiveContact: true`).
- Optional: M05 legt fehlende Kontakte automatisch an (Profil-Flag `lexoffice.auto_create_contacts`).

### 8.2 Kategorie-Mapping

Lexoffice hat eigene `categoryIds`. Backend pflegt eine Mapping-Tabelle:

```sql
CREATE TABLE lexoffice_category_map (
  customer_id      TEXT NOT NULL,
  skr_account      TEXT NOT NULL,
  lexoffice_category_id  UUID NOT NULL,
  PRIMARY KEY (customer_id, skr_account)
);
```

Initial wird sie beim Onboarding über `GET /v1/categories` befüllt. Default-Mapping liegt im Code.

---

## 9. Lexoffice-Client (Backend)

```
backend/src/core/adapters/booking/lexoffice/
├── lexoffice.client.ts
├── auth.ts                # OAuth2 PKCE oder API-Key-Modus
├── voucher.builder.ts
├── category.mapper.ts
└── tests/
```

- Auth: Lexoffice unterstützt OAuth2 + API-Keys. Default: API-Key (einfacher), als Fallback OAuth2.
- Rate-Limit: Lexoffice = 2 Req/s pro Mandant. Backend nutzt Redis-Token-Bucket.
- Retry: 3× exponential bei 5xx oder 429 (Retry-After-Header beachten).

---

## 10. Anhang-Strategie

- Erste Wahl: PDF aus M02-Archiv (`receipt.archive.path` → über Storage-Adapter ziehen).
- Fallback: Original-Datei aus MinIO.
- Lexoffice akzeptiert `multipart/form-data` für Voucher-Files. Max. 25 MB.

---

## 11. Events

| Event                       | Wann                                |
|-----------------------------|-------------------------------------|
| `pp.receipt.exported`       | Erfolg                              |
| `pp.receipt.export_failed`  | Endgültiger Fehler nach Retries     |

---

## 12. Fehlerbehandlung

| Fehler                            | Klasse        | Handling                                                     |
|-----------------------------------|---------------|--------------------------------------------------------------|
| 401/403 (Auth)                    | Fatal         | Token-Refresh; sonst Operator-Alert                          |
| 429 Rate-Limit                    | Recoverable   | Retry mit `Retry-After`                                       |
| 422 Validation (z. B. ungültiges Datum) | Validation | `requires_review`, Issue ins Receipt                          |
| 5xx Lexoffice                     | Recoverable   | Retry 3× exponential                                          |
| Anhang-Upload fehlt               | Recoverable   | Voucher steht trotzdem; Anhang-Retry über separaten Job      |
| Duplicate Voucher (gleicher VN)   | Validation    | `requires_review` mit Issue `DUPLICATE_AT_TARGET`             |

---

## 13. Code-Struktur

```
backend/src/modules/m05-lexoffice/
├── routes.ts
├── handlers/
│   └── push.handler.ts
├── services/
│   ├── voucher-builder.ts
│   ├── contact-resolver.ts
│   └── category-mapper.ts
├── tests/
└── README.md

backend/src/core/adapters/booking/lexoffice/   # client, auth (siehe §9)
```

---

## 14. ENV-Variablen

| Variable                       | Beispiel                       |
|--------------------------------|--------------------------------|
| `LEXOFFICE_API_BASE`           | `https://api.lexoffice.io`     |
| `LEXOFFICE_DEFAULT_TIMEOUT_MS` | `15000`                        |

API-Keys liegen pro Kunde verschlüsselt in `customer_credentials` (kind=`lexoffice_api_key`).

---

## 15. Acceptance Criteria

- [ ] Voucher mit korrektem Brutto/Netto/Steuer ist in Lexoffice sichtbar.
- [ ] PDF ist als Anhang am Voucher.
- [ ] Sammel-Kreditor wird genutzt, wenn Kontakt fehlt.
- [ ] Idempotenz: zweiter Push für selben Beleg → kein Duplicate, sondern Existing.
- [ ] Hooks werden aufgerufen.
- [ ] Rate-Limit wird respektiert.
- [ ] Bei Fatalen Auth-Fehlern: Operator-Alert.
